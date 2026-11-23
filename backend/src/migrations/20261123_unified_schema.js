const db = require('../config/database');

async function createEnumIfMissing(ddl) {
  try {
    await db.query(ddl);
  } catch (err) {
    if (err.code !== '42710') throw err;
  }
}

async function addEnumValueIfMissing(typeName, value) {
  try {
    await db.query(`ALTER TYPE ${typeName} ADD VALUE IF NOT EXISTS '${value}'`);
  } catch (err) {
    if (err.code !== '42710') throw err;
  }
}

module.exports = async function runUnifiedSchemaMigration() {
  console.log('[Migration] Running 20261123_unified_schema...');

  // 1. Ensure ENUM types and values exist
  await createEnumIfMissing(`CREATE TYPE tipo_item_enum AS ENUM ('herramienta', 'consumible', 'kit')`);
  await addEnumValueIfMissing('tipo_item_enum', 'kit');

  await createEnumIfMissing(`CREATE TYPE estado_activo_enum AS ENUM (
    'disponible',
    'en_uso',
    'en_mantenimiento',
    'calibracion_pendiente',
    'fuera_de_servicio',
    'calibrado',
    'danado',
    'en_funcionamiento',
    'desconocido',
    'sin_stock'
  )`);
  await addEnumValueIfMissing('estado_activo_enum', 'sin_stock');

  await createEnumIfMissing(`CREATE TYPE tipo_movimiento_enum AS ENUM ('ingreso', 'despacho', 'traspaso', 'devolucion')`);

  // 2. Create base tables if missing (clean empty-DB boot without prior init.sql)
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id                SERIAL PRIMARY KEY,
      nombre            VARCHAR(100) NOT NULL,
      telefono_whatsapp VARCHAR(20)  UNIQUE,
      email             VARCHAR(150) UNIQUE,
      rol               VARCHAR(50)  NOT NULL DEFAULT 'trabajador',
      team              VARCHAR(80),
      default_zona      VARCHAR(100),
      pin_hash          VARCHAR(255),
      secret_2fa        TEXT,
      is_2fa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
      activo            BOOLEAN NOT NULL DEFAULT TRUE,
      en_terreno        BOOLEAN NOT NULL DEFAULT FALSE,
      preferencias      JSONB DEFAULT '{"alertas_calibracion": true, "alertas_asignacion": true, "resumen_semanal": false}',
      fecha_registro    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ubicaciones (
      id                SERIAL PRIMARY KEY,
      nombre_ubicacion  VARCHAR(100) UNIQUE NOT NULL,
      descripcion       TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS items (
      id                       SERIAL PRIMARY KEY,
      nombre                   VARCHAR(150) UNIQUE NOT NULL,
      tipo                     tipo_item_enum NOT NULL,
      stock_global_consumibles INT DEFAULT 0,
      categoria_padre          VARCHAR(100),
      marca                    VARCHAR(100),
      CONSTRAINT chk_stock_consumible CHECK (
        (tipo = 'consumible' AND stock_global_consumibles >= 0) OR
        (tipo = 'herramienta') OR
        (tipo = 'kit')
      )
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS activos (
      id                  SERIAL PRIMARY KEY,
      item_id             INT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      numero_serie        VARCHAR(100) UNIQUE NOT NULL,
      original_serial     VARCHAR(255),
      parent_activo_id    INT REFERENCES activos(id) ON DELETE SET NULL,
      usuario_actual_id   INT REFERENCES usuarios(id) ON DELETE SET NULL,
      ubicacion_actual_id INT REFERENCES ubicaciones(id) ON DELETE SET NULL,
      team                VARCHAR(80),
      fecha_registro      DATE DEFAULT CURRENT_DATE,
      fecha_ultima_cali   DATE,
      fecha_prox_cali     DATE,
      fecha_ultimo_tag    DATE,
      fecha_prox_tag      DATE,
      estado              estado_activo_enum NOT NULL DEFAULT 'disponible',
      fotos               JSONB DEFAULT '[]'::jsonb,
      notas               TEXT,
      cantidad            INT NOT NULL DEFAULT 1
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id                   SERIAL PRIMARY KEY,
      item_id              INT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      activo_id            INT REFERENCES activos(id) ON DELETE SET NULL,
      usuario_id           INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      ubicacion_origen_id  INT REFERENCES ubicaciones(id) ON DELETE SET NULL,
      ubicacion_destino_id INT REFERENCES ubicaciones(id) ON DELETE SET NULL,
      cantidad             INT NOT NULL DEFAULT 1,
      tipo_movimiento      tipo_movimiento_enum NOT NULL,
      fecha_movimiento     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      observacion          TEXT,
      CONSTRAINT chk_movimiento_cantidad CHECK (cantidad > 0)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS mantenimientos (
      id                     SERIAL PRIMARY KEY,
      activo_id              INTEGER NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
      fecha_envio            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_estimada_retorno TIMESTAMP,
      motivo                 VARCHAR(255) NOT NULL,
      notas                  TEXT,
      fotos                  JSONB DEFAULT '[]'::jsonb,
      estado                 VARCHAR(50) DEFAULT 'En Proceso',
      creado_por             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      accion     VARCHAR(255) NOT NULL,
      detalles   TEXT,
      meta       JSONB,
      creado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id         SERIAL PRIMARY KEY,
      nombre     VARCHAR(80) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Idempotent legacy column upgrades
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS default_zona VARCHAR(100)`);
  await db.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS categoria_padre VARCHAR(100)`);
  await db.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS marca VARCHAR(100)`);
  await db.query(`ALTER TABLE activos ADD COLUMN IF NOT EXISTS original_serial VARCHAR(255)`);
  await db.query(`ALTER TABLE activos ADD COLUMN IF NOT EXISTS parent_activo_id INT REFERENCES activos(id) ON DELETE SET NULL`);
  await db.query(`ALTER TABLE activos ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb`);
  await db.query(`ALTER TABLE activos ADD COLUMN IF NOT EXISTS notas TEXT`);
  await db.query(`ALTER TABLE activos ADD COLUMN IF NOT EXISTS cantidad INT NOT NULL DEFAULT 1`);
  await db.query(`ALTER TABLE mantenimientos ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb`);
  await db.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS meta JSONB`);

  // Widen secret_2fa on existing PostgreSQL databases (ignored on SQLite where TEXT is unbounded)
  try {
    await db.query(`ALTER TABLE usuarios ALTER COLUMN secret_2fa TYPE TEXT`);
  } catch (_) {
    // Ignored on SQLite test harness or when already TEXT
  }

  // Upgrade legacy chk_stock_consumible on PostgreSQL if missing 'kit'
  try {
    const { rows: chkRows } = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'items' AND c.conname = 'chk_stock_consumible'`
    );
    if (chkRows[0] && !String(chkRows[0].def || '').includes("'kit'")) {
      await db.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_stock_consumible`);
      await db.query(`
        ALTER TABLE items ADD CONSTRAINT chk_stock_consumible CHECK (
          (tipo = 'consumible' AND stock_global_consumibles >= 0) OR
          (tipo = 'herramienta') OR
          (tipo = 'kit')
        )
      `);
    }
  } catch (_) {
    // Ignored when pg_constraint is unavailable (e.g. pg_sqlite_adapter)
  }

  // 4. Indexes
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_numero_serie       ON activos(numero_serie)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_estado             ON activos(estado)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_fechas             ON activos(fecha_prox_cali, fecha_prox_tag)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_usuario_id         ON activos(usuario_actual_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_ubicacion_id       ON activos(ubicacion_actual_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_item_id            ON activos(item_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_team               ON activos(team)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_parent_activo_id   ON activos(parent_activo_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activos_original_serial    ON activos(original_serial)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_movimientos_activo_id      ON movimientos(activo_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_movimientos_item_id        ON movimientos(item_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_movimientos_fecha          ON movimientos(fecha_movimiento DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_movimientos_usuario_id     ON movimientos(usuario_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_mantenimientos_activo_id   ON mantenimientos(activo_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario_id      ON audit_logs(usuario_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_creado_en       ON audit_logs(creado_en DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_items_categoria_padre      ON items(categoria_padre)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp          ON usuarios(telefono_whatsapp)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_team              ON usuarios(team)`);

  // 5. Ensure v_alertas_inventario view exists
  await db.query(`
    CREATE OR REPLACE VIEW v_alertas_inventario AS
    SELECT
      a.id            AS activo_id,
      a.numero_serie,
      a.team,
      i.nombre        AS nombre_item,
      CASE
        WHEN a.fecha_prox_cali < CURRENT_DATE THEN 'Calibración Vencida'
        ELSE 'Calibración Próxima'
      END AS tipo_alerta,
      a.fecha_prox_cali AS fecha_vencimiento,
      CAST(EXTRACT(EPOCH FROM (a.fecha_prox_cali::timestamp - CURRENT_DATE::timestamp)) / 86400 AS INTEGER) AS dias_restantes
    FROM activos a
    JOIN items i ON a.item_id = i.id
    WHERE a.fecha_prox_cali <= CURRENT_DATE + INTERVAL '30 days'
      AND a.estado NOT IN ('en_mantenimiento', 'fuera_de_servicio', 'danado', 'desconocido')

    UNION ALL

    SELECT
      a.id            AS activo_id,
      a.numero_serie,
      a.team,
      i.nombre        AS nombre_item,
      CASE
        WHEN a.fecha_prox_tag < CURRENT_DATE THEN 'Tag Vencido'
        ELSE 'Tag Próximo'
      END AS tipo_alerta,
      a.fecha_prox_tag AS fecha_vencimiento,
      CAST(EXTRACT(EPOCH FROM (a.fecha_prox_tag::timestamp - CURRENT_DATE::timestamp)) / 86400 AS INTEGER) AS dias_restantes
    FROM activos a
    JOIN items i ON a.item_id = i.id
    WHERE a.fecha_prox_tag <= CURRENT_DATE + INTERVAL '7 days'
      AND a.estado NOT IN ('en_mantenimiento', 'fuera_de_servicio', 'danado', 'desconocido')
  `);

  // 6. Seed default teams only when empty
  const { rows: teamCountRows } = await db.query(`SELECT COUNT(*)::int AS cnt FROM teams`);
  if ((teamCountRows[0]?.cnt ?? 0) === 0) {
    await db.query(`
      INSERT INTO teams (nombre) VALUES
      ('Transmission'),
      ('Energy'),
      ('Networks'),
      ('Maintenance'),
      ('Calibration'),
      ('Instrumentation'),
      ('Civil Works'),
      ('IT / Infrastructure')
      ON CONFLICT (nombre) DO NOTHING
    `);
  }

  console.log('[Migration] 20261123_unified_schema completed successfully.');
};
