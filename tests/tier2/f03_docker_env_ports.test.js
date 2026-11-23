'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { builtinModules } = require('node:module');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');

const { startDashboardServer } = require(path.join(HARNESS_DIR, 'dashboard_server'));
const { createDashboardSandbox } = require(path.join(HARNESS_DIR, 'dom_sandbox'));
const { buildIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('F3 Tier 2: Docker, Env Validation & Port Mismatch Negative Checks', () => {
  it('F3-T2-01: .env.example contains zero leaked production secrets or JWT tokens', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
    const secrets = ['eyJhbGciOi'];
    const envPath = path.join(REPO_ROOT, 'backend', '.env');
    if (fs.existsSync(envPath)) {
      const envTxt = fs.readFileSync(envPath, 'utf8');
      for (const line of envTxt.split(/\r?\n/)) {
        const m = line.match(/^\s*(DATABASE_URL|API_KEY|JWT_SECRET|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|SUPABASE_URL)\s*=\s*(.+)\s*$/);
        if (m) {
          const val = m[2].replace(/^['"]|['"]$/g, '').trim();
          if (val.length >= 10) secrets.push(val);
        }
      }
    }
    for (const secret of secrets) {
      assert.ok(!content.includes(secret), 'Secret leaked in .env.example');
    }
  });

  it('F3-T2-02: docker-compose.yml and backend/Dockerfile contain zero stale port 3000 or .env.production refs', () => {
    const compose = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8');
    const backendDocker = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'Dockerfile'), 'utf8');
    for (const text of [compose, backendDocker]) {
      assert.ok(!text.includes('3000'), 'Stale port 3000 found');
      assert.ok(!text.includes('.env.production'), 'Stale .env.production reference found');
    }
  });

  it('F3-T2-03: environment.js rejects empty DATABASE_URL, short API_KEY, short JWT_SECRET, and invalid NODE_ENV', () => {
    const envModPath = path.join(REPO_ROOT, 'backend', 'src', 'config', 'environment.js');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entelso-f3-badenv-'));
    try {
      const baseValid = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/entelso_test',
        API_KEY: 'valid-api-key-12345',
        JWT_SECRET: 'valid-jwt-secret-12345',
      };
      const badCases = [
        { label: 'empty DATABASE_URL', overrides: { DATABASE_URL: '' } },
        { label: 'short API_KEY', overrides: { API_KEY: 'short' } },
        { label: 'short JWT_SECRET', overrides: { JWT_SECRET: 'short' } },
        { label: 'invalid NODE_ENV', overrides: { NODE_ENV: 'staging' } },
      ];
      for (const tc of badCases) {
        const res = spawnSync(
          process.execPath,
          ['-e', `require(${JSON.stringify(envModPath)})`],
          { cwd: tempDir, env: buildIsolatedEnv({ ...baseValid, ...tc.overrides }), encoding: 'utf8' }
        );
        assert.notEqual(res.status, 0, `Expected non-zero exit for ${tc.label}`);
        assert.ok(res.stderr.trim().length > 0, `Expected stderr error for ${tc.label}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('F3-T2-04: backend/.dockerignore excludes sensitive and bulky artifacts', () => {
    const txt = fs.readFileSync(path.join(REPO_ROOT, 'backend', '.dockerignore'), 'utf8');
    for (const entry of ['.env', '.env.*', 'node_modules', '.git', 'Dockerfile', 'coverage']) {
      assert.ok(
        txt.split(/\r?\n/).some((l) => l.trim() === entry),
        `Missing ${entry} in backend/.dockerignore`
      );
    }
  });

  it('F3-T2-05: resolveApiBase() normalizes trailing /api/ override and script.js has zero sslip.io', async () => {
    const scriptText = fs.readFileSync(path.join(REPO_ROOT, 'dashboard', 'script.js'), 'utf8');
    assert.ok(!scriptText.includes('sslip.io'), 'Hardcoded sslip.io URL must not remain in dashboard/script.js');

    const srv = await startDashboardServer();
    let sb;
    try {
      sb = await createDashboardSandbox({
        dashboardUrl: srv.url,
        apiUrl: 'http://127.0.0.1:4567',
        injectApiBase: false,
        initialLocalStorage: { entelso_api_base: 'http://127.0.0.1:4567/api/' },
      });
      assert.equal(sb.window.resolveApiBase(), 'http://127.0.0.1:4567');
    } finally {
      if (sb) sb.close();
      await srv.close();
    }
  });

  it('F3-T2-06: backend/package.json entrypoint, scripts, engines, and declared dependencies match backend/src/', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'backend', 'package.json'), 'utf8'));
    assert.equal(pkg.main, 'src/server.js');
    assert.equal(pkg.scripts.start, 'node src/server.js');
    assert.ok(pkg.engines && pkg.engines.node, 'Expected engines.node in backend/package.json');

    const declaredDeps = new Set(Object.keys(pkg.dependencies || {}));
    const builtins = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));
    const reqRe = /require\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g;
    const files = walkJs(path.join(REPO_ROOT, 'backend', 'src'));

    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = reqRe.exec(text)) !== null) {
        const mod = m[1];
        if (mod.startsWith('node:') || builtins.has(mod)) continue;
        const pkgName = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
        assert.ok(declaredDeps.has(pkgName), `Undeclared dependency "${pkgName}" imported in ${f}`);
      }
    }
  });
});
