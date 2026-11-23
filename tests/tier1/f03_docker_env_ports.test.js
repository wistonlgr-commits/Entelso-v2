'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');

const { startDashboardServer } = require(path.join(HARNESS_DIR, 'dashboard_server'));
const { createDashboardSandbox } = require(path.join(HARNESS_DIR, 'dom_sandbox'));
const { buildIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

function parseDotEnv(content) {
  const map = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    assert.ok(eq > 0, `Malformed env line: ${rawLine}`);
    map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return map;
}

describe('F3 Tier 1: Port (3001), Docker Compose, Dockerfiles & .env.example Alignment', () => {
  it('F3-T1-01: docker-compose.yml has valid indentation and aligns backend:3001 and frontend:80', () => {
    const composePath = path.join(REPO_ROOT, 'docker-compose.yml');
    const raw = fs.readFileSync(composePath, 'utf8');
    const lines = raw.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      assert.ok(!line.includes('\t'), `Tab character forbidden in YAML at line ${i + 1}`);
      if (line.trim() && !line.trim().startsWith('#')) {
        const leadingSpaces = line.match(/^ */)[0].length;
        assert.equal(leadingSpaces % 2, 0, `Odd indentation at line ${i + 1}: ${line}`);
      }
    }

    assert.match(raw, /^services:/m);
    assert.match(raw, /^ {2}backend:/m);
    assert.match(raw, /^ {2}frontend:/m);
    assert.match(raw, /^networks:\s*\r?\n {2}entelso_network:/m);
    assert.match(raw, /"3001:3001"/);
    assert.match(raw, /"80:80"/);
    assert.match(raw, /\.\/backend\/\.env/);
    assert.match(raw, /condition:\s*service_healthy/);
  });

  it('F3-T1-02: docker-compose.yml and backend/Dockerfile both healthcheck :3001/health and expose 3001', () => {
    const compose = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8');
    const backendDocker = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'Dockerfile'), 'utf8');

    assert.match(compose, /http:\/\/localhost:3001\/health/);
    assert.match(backendDocker, /^EXPOSE 3001$/m);
    assert.match(backendDocker, /HEALTHCHECK[\s\S]*http:\/\/127\.0\.0\.1:(?:3001|\$\{PORT:-3001\})\/health/);
  });

  it('F3-T1-03: backend/Dockerfile uses deterministic multi-stage build with non-root USER node', () => {
    const dockerfile = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /FROM\s+node:22-alpine\s+AS\s+builder/i);
    assert.match(dockerfile, /npm\s+ci\s+--omit=dev/);
    assert.match(dockerfile, /FROM\s+node:22-alpine\s+AS\s+runner/i);
    assert.match(dockerfile, /COPY\s+--from=builder[\s\S]*\/node_modules/);
    assert.match(dockerfile, /^USER\s+node$/m);
    assert.match(dockerfile, /CMD\s+\["node",\s*"src\/server\.js"\]/);
  });

  it('F3-T1-04: dashboard/Dockerfile, nginx.conf, and .dockerignore align Nginx proxy & security headers', () => {
    const dashDocker = fs.readFileSync(path.join(REPO_ROOT, 'dashboard', 'Dockerfile'), 'utf8');
    const nginxConf = fs.readFileSync(path.join(REPO_ROOT, 'dashboard', 'nginx.conf'), 'utf8');
    const dashIgnore = fs.readFileSync(path.join(REPO_ROOT, 'dashboard', '.dockerignore'), 'utf8');

    assert.match(dashDocker, /FROM\s+nginx:alpine/i);
    assert.match(dashDocker, /^EXPOSE\s+80$/m);
    assert.match(dashDocker, /COPY\s+nginx\.conf\s+\/etc\/nginx\/conf\.d\/default\.conf/);
    assert.match(dashDocker, /rm\s+-f\s+\/usr\/share\/nginx\/html\/nginx\.conf/);

    assert.match(nginxConf, /resolver\s+127\.0\.0\.11/);
    assert.match(nginxConf, /location\s*=\s*\/health\s*\{[\s\S]*backend:3001[\s\S]*proxy_pass\s+\$backend_upstream\/health;/);
    assert.match(nginxConf, /location\s+\/api\/\s*\{[\s\S]*backend:3001[\s\S]*proxy_pass\s+\$backend_upstream\$request_uri;/);
    assert.match(nginxConf, /try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/);
    assert.match(nginxConf, /X-Content-Type-Options/);
    assert.match(nginxConf, /X-Frame-Options/);
    assert.match(nginxConf, /Referrer-Policy/);

    assert.match(dashIgnore, /^Dockerfile$/m);
    assert.match(dashIgnore, /^\.dockerignore$/m);
    assert.match(dashIgnore, /^\.git$/m);
  });

  it('F3-T1-05: .env.example defines PORT=3001 and all required configuration keys', () => {
    const envExample = parseDotEnv(fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8'));
    assert.equal(envExample.PORT, '3001');
    for (const key of [
      'PORT',
      'NODE_ENV',
      'DATABASE_URL',
      'API_KEY',
      'JWT_SECRET',
      'CORS_ORIGIN',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
    ]) {
      assert.ok(Object.prototype.hasOwnProperty.call(envExample, key), `Missing ${key} in .env.example`);
    }
  });

  it('F3-T1-06: environment.js defaults PORT=3001 and resolveApiBase() resolves localhost:3001 vs port 80 proxy', async () => {
    const envModPath = path.join(REPO_ROOT, 'backend', 'src', 'config', 'environment.js');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entelso-f3-env-'));
    try {
      const childEnv = buildIsolatedEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/entelso_test',
        API_KEY: 'test-api-key-123456',
        JWT_SECRET: 'test-jwt-secret-123456',
      });
      const res = spawnSync(
        process.execPath,
        ['-e', `const e = require(${JSON.stringify(envModPath)}); console.log(JSON.stringify({ port: e.PORT, type: typeof e.PORT }));`],
        { cwd: tempDir, env: childEnv, encoding: 'utf8' }
      );
      assert.equal(res.status, 0, res.stderr);
      const parsed = JSON.parse(res.stdout.trim());
      assert.equal(parsed.port, 3001);
      assert.equal(parsed.type, 'number');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const srv = await startDashboardServer();
    let sb1;
    let sb2;
    try {
      sb1 = await createDashboardSandbox({
        dashboardUrl: srv.url,
        apiUrl: 'http://127.0.0.1:3001',
        injectApiBase: false,
        originUrl: 'http://localhost:8080/',
      });
      assert.equal(sb1.window.resolveApiBase(), 'http://localhost:3001');

      sb2 = await createDashboardSandbox({
        dashboardUrl: srv.url,
        apiUrl: 'http://127.0.0.1:3001',
        injectApiBase: false,
        originUrl: 'http://localhost/',
      });
      assert.equal(sb2.window.resolveApiBase(), '');
    } finally {
      if (sb1) sb1.close();
      if (sb2) sb2.close();
      await srv.close();
    }
  });
});
