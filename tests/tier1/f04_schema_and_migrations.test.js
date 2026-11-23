'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');
const BACKEND_MODULES = path.join(REPO_ROOT, 'backend', 'node_modules');

const { Pool } = require(path.join(BACKEND_MODULES, 'pg'));
const bcrypt = require(path.join(BACKEND_MODULES, 'bcrypt'));
const { startIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

describe('F4 Tier 1: Unified PostgreSQL Schema & Startup Migrations', () => {
  it('F4-T1-01: All 8 canonical tables and v_alertas_inventario view exist and respond cleanly', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      const relations = [
        'usuarios',
        'ubicaciones',
        'items',
        'activos',
        'movimientos',
        'mantenimientos',
        'audit_logs',
        'teams',
        'v_alertas_inventario',
      ];
      for (const rel of relations) {
        const res = await pool.query(`SELECT * FROM ${rel} LIMIT 1`);
        assert.ok(Array.isArray(res.rows), `Expected array rows from ${rel}`);
      }
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T1-02: Unified columns (teams, meta, categoria_padre, marca, fotos, notas, parent_activo_id, original_serial, cantidad, default_zona) and kit/sin_stock enums work', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await pool.query('SELECT id, nombre, created_at FROM teams LIMIT 0');
      await pool.query('SELECT id, meta FROM audit_logs LIMIT 0');
      await pool.query('SELECT id, categoria_padre, marca FROM items LIMIT 0');
      await pool.query('SELECT id, fotos, notas, parent_activo_id, original_serial, cantidad FROM activos LIMIT 0');
      await pool.query('SELECT id, fotos FROM mantenimientos LIMIT 0');
      await pool.query('SELECT id, default_zona FROM usuarios LIMIT 0');

      const itemRes = await pool.query(
        "INSERT INTO items (nombre, tipo, stock_global_consumibles, categoria_padre, marca) VALUES ('F4 Probe Kit', 'kit', 0, 'WalkTest Kits', 'Entelso') RETURNING id, tipo"
      );
      assert.equal(itemRes.rows[0].tipo, 'kit');

      const actRes = await pool.query(
        "INSERT INTO activos (item_id, numero_serie, original_serial, estado, fotos, notas, cantidad) VALUES ($1, 'F4-KIT-001', 'ORIG-99', 'sin_stock', $2::jsonb, 'Kit notes', 3) RETURNING estado, fotos, notas, original_serial, cantidad",
        [itemRes.rows[0].id, JSON.stringify(['https://127.0.0.1/a.png'])]
      );
      assert.equal(actRes.rows[0].estado, 'sin_stock');
      assert.deepEqual(actRes.rows[0].fotos, ['https://127.0.0.1/a.png']);
      assert.equal(actRes.rows[0].notas, 'Kit notes');
      assert.equal(actRes.rows[0].original_serial, 'ORIG-99');
      assert.equal(actRes.rows[0].cantidad, 3);
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T1-03: Seeded data populates expected baseline counts and admin bcrypt password hash', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      const counts = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS c FROM usuarios'),
        pool.query('SELECT COUNT(*)::int AS c FROM teams'),
        pool.query('SELECT COUNT(*)::int AS c FROM ubicaciones'),
        pool.query('SELECT COUNT(*)::int AS c FROM items'),
        pool.query('SELECT COUNT(*)::int AS c FROM activos'),
        pool.query('SELECT COUNT(*)::int AS c FROM movimientos'),
      ]);
      assert.ok(counts[0].rows[0].c >= 7, 'usuarios >= 7');
      assert.equal(counts[1].rows[0].c, 8, 'teams === 8');
      assert.equal(counts[2].rows[0].c, 12, 'ubicaciones === 12');
      assert.equal(counts[3].rows[0].c, 12, 'items === 12');
      assert.equal(counts[4].rows[0].c, 10, 'activos === 10');
      assert.equal(counts[5].rows[0].c, 7, 'movimientos === 7');

      const adminRes = await pool.query("SELECT pin_hash FROM usuarios WHERE email = 'admin@entelso.com'");
      assert.equal(adminRes.rows.length, 1);
      const valid = await bcrypt.compare('password', adminRes.rows[0].pin_hash);
      assert.equal(valid, true);
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T1-04: Empty DB bootstrap (loadInitSql: false) creates all 8 tables, view, and 8 default teams via migrations', async () => {
    const env = await startIsolatedEnv({ loadInitSql: false });
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      const health = await fetch(`${env.apiUrl}/health`);
      assert.equal(health.status, 200);
      const body = await health.json();
      assert.equal(body.status, 'UP');

      for (const rel of ['usuarios', 'ubicaciones', 'items', 'activos', 'movimientos', 'mantenimientos', 'audit_logs', 'teams', 'v_alertas_inventario']) {
        await pool.query(`SELECT * FROM ${rel} LIMIT 0`);
      }

      const teamCnt = await pool.query('SELECT COUNT(*)::int AS c FROM teams');
      assert.equal(teamCnt.rows[0].c, 8);
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it('F4-T1-05: Legacy schema DB upgrades cleanly on startup migrations (adds columns/tables/enums and normalizes categories/brands)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entelso-legacy-sql-'));
    const legacySqlPath = path.join(tmpDir, 'legacy.sql');
    const legacySql = `
      CREATE TYPE tipo_item_enum AS ENUM ('herramienta', 'consumible');
      CREATE TYPE estado_activo_enum AS ENUM (
        'disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente',
        'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido'
      );
      CREATE TYPE tipo_movimiento_enum AS ENUM ('ingreso', 'despacho', 'traspaso', 'devolucion');
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        telefono_whatsapp VARCHAR(20) UNIQUE,
        email VARCHAR(150) UNIQUE,
        rol VARCHAR(50) NOT NULL DEFAULT 'trabajador',
        team VARCHAR(80),
        pin_hash VARCHAR(255),
        secret_2fa TEXT,
        is_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        en_terreno BOOLEAN NOT NULL DEFAULT FALSE,
        preferencias JSONB DEFAULT '{}'::jsonb,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE ubicaciones (
        id SERIAL PRIMARY KEY,
        nombre_ubicacion VARCHAR(100) UNIQUE NOT NULL,
        descripcion TEXT
      );
      CREATE TABLE items (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(150) UNIQUE NOT NULL,
        tipo tipo_item_enum NOT NULL,
        stock_global_consumibles INT DEFAULT 0,
        categoria_padre VARCHAR(100)
      );
      CREATE TABLE activos (
        id SERIAL PRIMARY KEY,
        item_id INT NOT NULL REFERENCES items(id),
        numero_serie VARCHAR(100) UNIQUE NOT NULL,
        usuario_actual_id INT REFERENCES usuarios(id),
        ubicacion_actual_id INT REFERENCES ubicaciones(id),
        team VARCHAR(80),
        fecha_registro DATE DEFAULT CURRENT_DATE,
        fecha_ultima_cali DATE,
        fecha_prox_cali DATE,
        fecha_ultimo_tag DATE,
        fecha_prox_tag DATE,
        estado estado_activo_enum NOT NULL DEFAULT 'disponible'
      );
      CREATE TABLE movimientos (
        id SERIAL PRIMARY KEY,
        item_id INT NOT NULL REFERENCES items(id),
        activo_id INT REFERENCES activos(id),
        usuario_id INT NOT NULL REFERENCES usuarios(id),
        ubicacion_origen_id INT REFERENCES ubicaciones(id),
        ubicacion_destino_id INT REFERENCES ubicaciones(id),
        cantidad INT NOT NULL DEFAULT 1,
        tipo_movimiento tipo_movimiento_enum NOT NULL,
        fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        observacion TEXT
      );
      CREATE TABLE mantenimientos (
        id SERIAL PRIMARY KEY,
        activo_id INTEGER NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
        fecha_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_estimada_retorno TIMESTAMP,
        motivo VARCHAR(255) NOT NULL,
        notas TEXT,
        estado VARCHAR(50) DEFAULT 'En Proceso',
        creado_por INTEGER REFERENCES usuarios(id),
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE audit_logs (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        accion VARCHAR(255) NOT NULL,
        detalles TEXT,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO items (nombre, tipo, categoria_padre) VALUES
        ('Fluke 87V Meter', 'herramienta', 'PIM Testers'),
        ('DeWalt 20V Cordless Drill', 'herramienta', 'Handy Tools'),
        ('Legacy WalkTest Bundle', 'herramienta', 'WalkTest Kits');
    `;
    fs.writeFileSync(legacySqlPath, legacySql, 'utf8');

    const env = await startIsolatedEnv({ initSqlPath: legacySqlPath });
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      await pool.query('SELECT id, nombre FROM teams LIMIT 0');
      await pool.query('SELECT meta FROM audit_logs LIMIT 0');
      await pool.query('SELECT default_zona FROM usuarios LIMIT 0');
      await pool.query('SELECT fotos FROM mantenimientos LIMIT 0');
      await pool.query('SELECT fotos, notas, parent_activo_id, original_serial, cantidad FROM activos LIMIT 0');

      const itemsRes = await pool.query('SELECT nombre, tipo, categoria_padre, marca FROM items ORDER BY id');
      const byName = Object.fromEntries(itemsRes.rows.map((r) => [r.nombre, r]));
      assert.equal(byName['Fluke 87V Meter'].marca, 'Fluke');
      assert.equal(byName['Fluke 87V Meter'].categoria_padre, 'Testing Equipment');
      assert.equal(byName['DeWalt 20V Cordless Drill'].marca, 'DeWalt');
      assert.equal(byName['DeWalt 20V Cordless Drill'].categoria_padre, 'Power Tools');
      assert.equal(byName['Legacy WalkTest Bundle'].tipo, 'kit');

      // sin_stock enum value should work after migration
      await pool.query(
        "INSERT INTO activos (item_id, numero_serie, estado) VALUES ($1, 'LEG-SS-1', 'sin_stock')",
        [itemsRes.rows[0].id || 1]
      );
    } finally {
      await pool.end();
      await env.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('F4-T1-06: All 19 expected schema indexes exist via PRAGMA index_list and unified DDL', async () => {
    const env = await startIsolatedEnv();
    const pool = new Pool({ connectionString: env.pgUrl });
    try {
      const tables = ['activos', 'movimientos', 'mantenimientos', 'audit_logs', 'items', 'usuarios'];
      const foundIndexes = new Set();
      for (const tbl of tables) {
        const res = await pool.query(`PRAGMA index_list(${tbl})`);
        for (const row of res.rows) {
          if (row.name) foundIndexes.add(row.name);
        }
      }

      const expectedIndexes = [
        'idx_activos_numero_serie',
        'idx_activos_estado',
        'idx_activos_fechas',
        'idx_activos_usuario_id',
        'idx_activos_ubicacion_id',
        'idx_activos_item_id',
        'idx_activos_team',
        'idx_activos_parent_activo_id',
        'idx_activos_original_serial',
        'idx_movimientos_activo_id',
        'idx_movimientos_item_id',
        'idx_movimientos_fecha',
        'idx_movimientos_usuario_id',
        'idx_mantenimientos_activo_id',
        'idx_audit_logs_usuario_id',
        'idx_audit_logs_creado_en',
        'idx_items_categoria_padre',
        'idx_usuarios_whatsapp',
        'idx_usuarios_team',
      ];
      assert.equal(expectedIndexes.length, 19);
      for (const idxName of expectedIndexes) {
        assert.ok(foundIndexes.has(idxName), `Missing expected index: ${idxName}`);
      }
    } finally {
      await pool.end();
      await env.close();
    }
  });
});
