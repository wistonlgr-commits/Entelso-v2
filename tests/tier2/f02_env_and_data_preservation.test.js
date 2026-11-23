'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');
const BACKEND_MODULES = path.join(REPO_ROOT, 'backend', 'node_modules');

const { Pool } = require(path.join(BACKEND_MODULES, 'pg'));
const bcrypt = require(path.join(BACKEND_MODULES, 'bcrypt'));
const { startIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function snapshotTree(dir) {
  const snap = new Map();
  for (const f of walkFiles(dir)) {
    const st = fs.statSync(f);
    snap.set(f, `${st.size}:${st.mtimeMs}`);
  }
  return snap;
}

describe('F2 Tier 2: .env Isolation & Real Data Protection Negative Checks', () => {
  it('F2-T2-01: Root Entelso/.env and entelso-inventory/.env do not exist', () => {
    assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, '.env')), false);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, '.env')), false);
  });

  it('F2-T2-02: .gitignore and backend/.dockerignore exclude .env files while keeping .env.example', () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    const dockerignore = fs.readFileSync(path.join(REPO_ROOT, 'backend', '.dockerignore'), 'utf8');

    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);

    assert.match(dockerignore, /^\.env$/m);
    assert.match(dockerignore, /^\.env\.\*$/m);
  });

  it('F2-T2-03: Isolated cwd prevents dotenv from loading backend/.env Supabase credentials on upload', async () => {
    const env = await startIsolatedEnv({ enableStorageMock: false });
    try {
      const pool = new Pool({ connectionString: env.pgUrl });
      try {
        const hash = await bcrypt.hash('NoSupabase123', 4);
        await pool.query(
          "INSERT INTO usuarios (nombre, email, rol, pin_hash) VALUES ('NoSB2', 'nosb2@entelso.test', 'admin', $1)",
          [hash]
        );
      } finally {
        await pool.end();
      }

      const loginRes = await fetch(`${env.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nosb2@entelso.test', pin: 'NoSupabase123' }),
      });
      assert.equal(loginRes.status, 200);
      const token = (await loginRes.json()).data.token;

      const fd = new FormData();
      fd.append('foto', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'probe.png');
      const upRes = await fetch(`${env.apiUrl}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      assert.equal(upRes.status, 500);
      const body = await upRes.text();
      assert.ok(!body.includes('supabase.co'), 'Must not leak or contact real supabase.co');
    } finally {
      await env.close();
    }
  });

  it('F2-T2-04: Zero hardcoded production secrets in backend/src/ or dashboard/, and zero sslip.io in backend/src/ or script.js', () => {
    const secretPatterns = ['eyJhbGciOi'];
    const envPath = path.join(REPO_ROOT, 'backend', '.env');
    if (fs.existsSync(envPath)) {
      const envTxt = fs.readFileSync(envPath, 'utf8');
      for (const line of envTxt.split(/\r?\n/)) {
        const m = line.match(/^\s*(DATABASE_URL|API_KEY|JWT_SECRET|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|SUPABASE_URL)\s*=\s*(.+)\s*$/);
        if (m) {
          const val = m[2].replace(/^['"]|['"]$/g, '').trim();
          if (val.length >= 10) secretPatterns.push(val);
        }
      }
    }
    const files = [
      ...walkFiles(path.join(REPO_ROOT, 'backend', 'src')),
      ...walkFiles(path.join(REPO_ROOT, 'dashboard')),
    ].filter((f) => /\.(js|html|css|conf)$/i.test(f));

    for (const f of files) {
      const txt = fs.readFileSync(f, 'utf8');
      for (const pat of secretPatterns) {
        assert.ok(!txt.includes(pat), `Leaked secret pattern in ${f}`);
      }
      if (!f.endsWith(`${path.sep}config.js`)) {
        assert.ok(!txt.includes('sslip.io'), `Hardcoded sslip.io must stay isolated to dashboard/config.js, found in ${f}`);
      }
    }
  });

  it('F2-T2-05: Failed auth & error API calls never create, delete, or alter _real_data/ or _archive_backups/', async () => {
    const realDir = path.join(WORKSPACE_ROOT, '_real_data');
    const archiveDir = path.join(WORKSPACE_ROOT, '_archive_backups');
    const beforeReal = snapshotTree(realDir);
    const beforeArchive = snapshotTree(archiveDir);

    const env = await startIsolatedEnv();
    try {
      const r1 = await fetch(`${env.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'bad@entelso.test', pin: 'wrong' }),
      });
      assert.equal(r1.status, 401);

      const r2 = await fetch(`${env.apiUrl}/api/activos`);
      assert.equal(r2.status, 401);
    } finally {
      await env.close();
    }

    assert.deepEqual(snapshotTree(realDir), beforeReal);
    assert.deepEqual(snapshotTree(archiveDir), beforeArchive);
  });
});
