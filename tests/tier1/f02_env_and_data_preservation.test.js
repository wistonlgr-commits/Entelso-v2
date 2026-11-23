'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');
const BACKEND_MODULES = path.join(REPO_ROOT, 'backend', 'node_modules');

const { Pool } = require(path.join(BACKEND_MODULES, 'pg'));
const bcrypt = require(path.join(BACKEND_MODULES, 'bcrypt'));
const { startIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

const EXPECTED_ARCHIVE_ENV_SHA256 = '41E7F23417F900BBBAC6EC88B1E04095BC8456292977F439D34F281346A5E7CD';
const EXPECTED_BACKEND_ENV_SHA256 = '39EC26397FD3DF27A331930911F02BFE884421FA22E100D41D2AF7FEB1B51EAE';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

describe('F2 Tier 1: Immutable .env & Real Data Preservation', () => {
  const archiveEnv = path.join(WORKSPACE_ROOT, '_archive_backups', '.env');
  const backendEnv = path.join(REPO_ROOT, 'backend', '.env');
  const backupJsonPath = path.join(WORKSPACE_ROOT, '_archive_backups', 'backups', 'db_backup_2026-10-30.json');

  it('F2-T1-01: _archive_backups/.env SHA-256 matches original untouched hash', () => {
    assert.equal(sha256(archiveEnv), EXPECTED_ARCHIVE_ENV_SHA256);
  });

  it('F2-T1-02: entelso-inventory/backend/.env SHA-256 matches original untouched hash', () => {
    assert.equal(sha256(backendEnv), EXPECTED_BACKEND_ENV_SHA256);
  });

  it('F2-T1-03: db_backup_2026-10-30.json parses cleanly with required non-empty arrays', () => {
    const raw = fs.readFileSync(backupJsonPath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(data.timestamp, 'Expected backup timestamp');
    for (const key of ['activos', 'items', 'usuarios', 'ubicaciones']) {
      assert.ok(Array.isArray(data[key]) && data[key].length > 0, `Expected non-empty array ${key}`);
    }
  });

  it('F2-T1-04: _real_data/ subfolders and revisar/*.xlsx remain populated and intact', () => {
    const expectedCounts = {
      Calibration: 5,
      Inventory: 10,
      'New folder': 7,
      'Proyecto subir fotos': 15,
    };
    for (const [sub, minCount] of Object.entries(expectedCounts)) {
      const dir = path.join(WORKSPACE_ROOT, '_real_data', sub);
      assert.ok(fs.existsSync(dir), `Missing _real_data/${sub}`);
      const items = fs.readdirSync(dir);
      assert.ok(items.length >= minCount, `Expected >=${minCount} entries in _real_data/${sub}, got ${items.length}`);
    }

    const revisarDir = path.join(WORKSPACE_ROOT, '_reports_and_review', 'revisar');
    const xlsx = fs.readdirSync(revisarDir).filter((f) => f.endsWith('.xlsx'));
    assert.ok(xlsx.length >= 2);
    for (const f of xlsx) {
      assert.ok(fs.statSync(path.join(revisarDir, f)).size > 1000, `Expected non-empty xlsx: ${f}`);
    }
  });

  it('F2-T1-05: Isolated runtime execution + API writes leave .env and backup hashes unchanged', async () => {
    const beforeArchive = sha256(archiveEnv);
    const beforeBackend = sha256(backendEnv);
    const beforeBackup = sha256(backupJsonPath);

    const env = await startIsolatedEnv();
    try {
      const pool = new Pool({ connectionString: env.pgUrl });
      try {
        const hash = await bcrypt.hash('PreservPass123!', 4);
        await pool.query(
          "INSERT INTO usuarios (nombre, email, rol, pin_hash) VALUES ('F2 Admin', 'f2.admin@entelso.test', 'admin', $1)",
          [hash]
        );
      } finally {
        await pool.end();
      }

      const loginRes = await fetch(`${env.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'f2.admin@entelso.test', pin: 'PreservPass123!' }),
      });
      assert.equal(loginRes.status, 200);
      const token = (await loginRes.json()).data.token;

      const writeRes = await fetch(`${env.apiUrl}/api/ubicaciones`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre_ubicacion: 'Isolated-F2-Zone', descripcion: 'Safe test write' }),
      });
      assert.equal(writeRes.status, 201);
    } finally {
      await env.close();
    }

    assert.equal(sha256(archiveEnv), beforeArchive);
    assert.equal(sha256(backendEnv), beforeBackend);
    assert.equal(sha256(backupJsonPath), beforeBackup);
  });
});
