'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');
const BACKEND_MODULES = path.join(REPO_ROOT, 'backend', 'node_modules');

const { Pool } = require(path.join(BACKEND_MODULES, 'pg'));
const { startIsolatedEnv, buildIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

describe('F4 Tier 2: Schema Constraints, FK Cascades & Migration Idempotency', () => {
  it('F4-T2-01: chk_stock_consumible rejects negative consumible stock (23514) while allowing 0 and kit', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await assert.rejects(
        () => pool.query("INSERT INTO items (nombre, tipo, stock_global_consumibles) VALUES ('BadStock', 'consumible', -1)"),
        (err) => err.code === '23514'
      );
      await pool.query("INSERT INTO items (nombre, tipo, stock_global_consumibles) VALUES ('ZeroStock', 'consumible', 0)");
      await pool.query("INSERT INTO items (nombre, tipo, stock_global_consumibles) VALUES ('KitA', 'kit', 0)");
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T2-02: Invalid enum values for items.tipo and activos.estado fail with SQLSTATE 23514', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await assert.rejects(
        () => pool.query("INSERT INTO items (nombre, tipo) VALUES ('InvalidTipo', 'invalid_tipo')"),
        (err) => err.code === '23514'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO activos (item_id, numero_serie, estado) VALUES (5, 'INV-BAD-ENUM', 'invalid_estado')"),
        (err) => err.code === '23514'
      );
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T2-03: chk_movimiento_cantidad rejects cantidad <= 0 with SQLSTATE 23514', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await assert.rejects(
        () => pool.query("INSERT INTO movimientos (item_id, usuario_id, cantidad, tipo_movimiento) VALUES (1, 1, 0, 'ingreso')"),
        (err) => err.code === '23514'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO movimientos (item_id, usuario_id, cantidad, tipo_movimiento) VALUES (1, 1, -5, 'despacho')"),
        (err) => err.code === '23514'
      );
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T2-04: UNIQUE constraints reject duplicates across all 6 unique columns with SQLSTATE 23505', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await assert.rejects(
        () => pool.query("INSERT INTO usuarios (nombre, email, rol) VALUES ('DupEmail', 'admin@entelso.com', 'trabajador')"),
        (err) => err.code === '23505'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO usuarios (nombre, telefono_whatsapp, rol) VALUES ('DupPhone', '+584121000001', 'trabajador')"),
        (err) => err.code === '23505'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO ubicaciones (nombre_ubicacion) VALUES ('NSW')"),
        (err) => err.code === '23505'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO items (nombre, tipo) VALUES ('Cinta Aislante 3M', 'consumible')"),
        (err) => err.code === '23505'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO activos (item_id, numero_serie) VALUES (5, 'AE-KS-2024-001')"),
        (err) => err.code === '23505'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO teams (nombre) VALUES ('Transmission')"),
        (err) => err.code === '23505'
      );
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T2-05: Foreign keys enforce 23503 on invalid references and ON DELETE SET NULL / CASCADE behaviors', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await assert.rejects(
        () => pool.query("INSERT INTO activos (item_id, numero_serie) VALUES (999999, 'NO-ITEM-999')"),
        (err) => err.code === '23503'
      );
      await assert.rejects(
        () => pool.query("INSERT INTO activos (item_id, numero_serie, parent_activo_id) VALUES (5, 'NO-PARENT-999', 999999)"),
        (err) => err.code === '23503'
      );

      const parentRes = await pool.query("INSERT INTO activos (item_id, numero_serie) VALUES (5, 'PARENT-KIT-FK') RETURNING id");
      const parentId = parentRes.rows[0].id;
      const childRes = await pool.query(
        "INSERT INTO activos (item_id, numero_serie, parent_activo_id) VALUES (5, 'CHILD-FK-1', $1) RETURNING id",
        [parentId]
      );
      const childId = childRes.rows[0].id;

      await pool.query("INSERT INTO mantenimientos (activo_id, motivo) VALUES ($1, 'FK cascade probe')", [childId]);

      // Delete parent -> child.parent_activo_id SET NULL
      await pool.query('DELETE FROM activos WHERE id = $1', [parentId]);
      const childAfter = await pool.query('SELECT parent_activo_id FROM activos WHERE id = $1', [childId]);
      assert.equal(childAfter.rows[0].parent_activo_id, null);

      // Delete child -> mantenimientos CASCADE deleted
      await pool.query('DELETE FROM activos WHERE id = $1', [childId]);
      const maintAfter = await pool.query('SELECT id FROM mantenimientos WHERE activo_id = $1', [childId]);
      assert.equal(maintAfter.rows.length, 0);
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T2-06: Re-running all 3 startup migrations against an already-booted DB is 100% idempotent', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entelso-f4-idem-'));
    try {
      const m1 = path.join(REPO_ROOT, 'backend', 'src', 'migrations', '20261123_unified_schema.js');
      const m2 = path.join(REPO_ROOT, 'backend', 'src', 'migrations', '20260812_corrections.js');
      const m3 = path.join(REPO_ROOT, 'backend', 'src', 'migrations', '20261008_add_cantidad_sin_stock.js');
      const dbPath = path.join(REPO_ROOT, 'backend', 'src', 'config', 'database.js');

      const childEnv = buildIsolatedEnv({
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: env.pgUrl,
        API_KEY: env.apiKey,
        JWT_SECRET: env.jwtSecret,
      });

      const script = `
        (async () => {
          await require(${JSON.stringify(m1)})();
          await require(${JSON.stringify(m2)})();
          await require(${JSON.stringify(m3)})();
          await require(${JSON.stringify(dbPath)}).pool.end();
        })().catch((err) => { console.error(err); process.exit(1); });
      `;
      const res = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', script], {
          cwd: tmpDir,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', (status) => resolve({ status, stdout, stderr }));
      });
      assert.equal(res.status, 0, `Second migration pass failed: ${res.stderr}`);

      const teamCnt = await pool.query('SELECT COUNT(*)::int AS c FROM teams');
      assert.equal(teamCnt.rows[0].c, 8);
    } finally {
      await pool.end();
      await env.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
