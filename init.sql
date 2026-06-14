-- ==============================================================================
-- INIT.SQL - Sistema Inteligente de Inventario y Asset Tracking (PLAN A)
-- Mantiene columna 'team' en usuarios y activos.
-- Incluye datos de prueba completos para todas las funcionalidades.
-- ==============================================================================

-- 0. LIMPIEZA DE ESTRUCTURA ANTERIOR
DROP VIEW  IF EXISTS v_alertas_inventario CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS mantenimientos CASCADE;
DROP TABLE IF EXISTS movimientos CASCADE;
DROP TABLE IF EXISTS activos CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS ubicaciones CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TYPE  IF EXISTS tipo_item_enum CASCADE;
DROP TYPE  IF EXISTS estado_activo_enum CASCADE;
DROP TYPE  IF EXISTS tipo_movimiento_enum CASCADE;

-- 1. ENUMS
CREATE TYPE tipo_item_enum AS ENUM ('herramienta', 'consumible');
CREATE TYPE estado_activo_enum AS ENUM (
  'disponible',
  'en_uso',
  'en_mantenimiento',
  'calibracion_pendiente',
  'fuera_de_servicio',
  'calibrado',
  'danado',
  'en_funcionamiento',
  'desconocido'
);
CREATE TYPE tipo_movimiento_enum AS ENUM ('ingreso', 'despacho', 'traspaso', 'devolucion');

-- ==============================================================================
-- 2. TABLAS
-- ==============================================================================

-- Usuarios del sistema (dashboard + WhatsApp bot)
CREATE TABLE usuarios (
    id                SERIAL PRIMARY KEY,
    nombre            VARCHAR(100) NOT NULL,
    telefono_whatsapp VARCHAR(20)  UNIQUE,
    email             VARCHAR(150) UNIQUE,
    rol               VARCHAR(50)  NOT NULL DEFAULT 'trabajador',
    team              VARCHAR(80),          -- Transmission, Energy, Networks, etc.
    pin_hash          VARCHAR(255),         -- PIN/contraseña hasheado con bcrypt
    secret_2fa        VARCHAR(64),
    is_2fa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    en_terreno        BOOLEAN NOT NULL DEFAULT FALSE,
    preferencias      JSONB DEFAULT '{"alertas_calibracion": true, "alertas_asignacion": true, "resumen_semanal": false}',
    fecha_registro    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ubicaciones/Zonas físicas o geográficas
CREATE TABLE ubicaciones (
    id                SERIAL PRIMARY KEY,
    nombre_ubicacion  VARCHAR(100) UNIQUE NOT NULL,
    descripcion       TEXT
);

-- Catálogo de tipos de ítems
CREATE TABLE items (
    id                       SERIAL PRIMARY KEY,
    nombre                   VARCHAR(150) UNIQUE NOT NULL,
    tipo                     tipo_item_enum NOT NULL,
    stock_global_consumibles INT DEFAULT 0,
    CONSTRAINT chk_stock_consumible CHECK (
        (tipo = 'consumible' AND stock_global_consumibles >= 0) OR
        (tipo = 'herramienta')
    )
);

-- Activos físicos individualizados
CREATE TABLE activos (
    id                  SERIAL PRIMARY KEY,
    item_id             INT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    numero_serie        VARCHAR(100) UNIQUE NOT NULL,
    usuario_actual_id   INT REFERENCES usuarios(id) ON DELETE SET NULL,
    ubicacion_actual_id INT REFERENCES ubicaciones(id) ON DELETE SET NULL,
    team                VARCHAR(80),         -- Team responsable del activo
    fecha_ultima_cali   DATE,
    fecha_prox_cali     DATE,
    fecha_ultimo_tag    DATE,
    fecha_prox_tag      DATE,
    estado              estado_activo_enum NOT NULL DEFAULT 'disponible',
    CONSTRAINT chk_ubicacion_usuario CHECK (
        (usuario_actual_id IS NOT NULL AND ubicacion_actual_id IS NULL) OR
        (usuario_actual_id IS NULL     AND ubicacion_actual_id IS NOT NULL) OR
        (usuario_actual_id IS NULL     AND ubicacion_actual_id IS NULL)
    )
);

-- Historial completo de movimientos
CREATE TABLE movimientos (
    id                  SERIAL PRIMARY KEY,
    item_id             INT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    activo_id           INT REFERENCES activos(id) ON DELETE SET NULL,
    usuario_id          INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    ubicacion_origen_id INT REFERENCES ubicaciones(id) ON DELETE SET NULL,
    ubicacion_destino_id INT REFERENCES ubicaciones(id) ON DELETE SET NULL,
    cantidad            INT NOT NULL DEFAULT 1,
    tipo_movimiento     tipo_movimiento_enum NOT NULL,
    fecha_movimiento    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observacion         TEXT,
    CONSTRAINT chk_movimiento_cantidad CHECK (cantidad > 0)
);

-- Tabla para el historial y gestión de mantenimientos reales
CREATE TABLE mantenimientos (
    id SERIAL PRIMARY KEY,
    activo_id INTEGER NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
    fecha_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_estimada_retorno TIMESTAMP,
    motivo VARCHAR(255) NOT NULL,
    notas TEXT,
    estado VARCHAR(50) DEFAULT 'En Proceso', -- 'En Proceso', 'Atendido'
    creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para logs de auditoría general
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    accion VARCHAR(255) NOT NULL,
    detalles TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 3. ÍNDICES
-- ==============================================================================
CREATE INDEX idx_activos_numero_serie       ON activos(numero_serie);
CREATE INDEX idx_activos_estado             ON activos(estado);
CREATE INDEX idx_activos_fechas             ON activos(fecha_prox_cali, fecha_prox_tag);
CREATE INDEX idx_activos_usuario_id         ON activos(usuario_actual_id);
CREATE INDEX idx_activos_ubicacion_id       ON activos(ubicacion_actual_id);
CREATE INDEX idx_movimientos_activo_id      ON movimientos(activo_id);
CREATE INDEX idx_movimientos_item_id        ON movimientos(item_id);
CREATE INDEX idx_movimientos_fecha          ON movimientos(fecha_movimiento DESC);
CREATE INDEX idx_movimientos_usuario_id     ON movimientos(usuario_id);
CREATE INDEX idx_usuarios_whatsapp          ON usuarios(telefono_whatsapp);
CREATE INDEX idx_usuarios_team              ON usuarios(team);

-- ==============================================================================
-- 4. VISTA DE ALERTAS
-- ==============================================================================
CREATE OR REPLACE VIEW v_alertas_inventario AS
-- Alertas de Calibración (ventana 30 días)
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

-- Alertas de Tag/Inspección (ventana 7 días)
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
  AND a.estado NOT IN ('en_mantenimiento', 'fuera_de_servicio', 'danado', 'desconocido');

-- ==============================================================================
-- 5. DATOS DE PRUEBA COMPLETOS
-- ==============================================================================

-- ─── USUARIOS ───────────────────────────────────────────────
-- PIN de todos los usuarios de prueba: 1234  (hash bcrypt)
-- Admin tiene además email para login en el dashboard
-- Hash generado con bcrypt.hash('1234', 10)
INSERT INTO usuarios (nombre, telefono_whatsapp, email, rol, team, pin_hash) VALUES
('Carlos Admin',          '+584121000001', 'admin@entelso.com',     'admin',      NULL,            '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Juan Pérez',            '+584121234567', 'juan@entelso.com',      'trabajador', 'Transmission',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('María González',        '+584127654321', 'maria@entelso.com',     'trabajador', 'Energy',        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Pedro Ramírez',         '+584129876543', NULL,                    'supervisor', 'Calibration',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Ana Torres',            '+584120001111', NULL,                    'trabajador', 'Networks',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Luis Rodríguez',        '+584120002222', NULL,                    'trabajador', 'Maintenance',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Supervisor NSW',        '+614001112222', 'super.nsw@entelso.com', 'supervisor', 'Instrumentation','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');

-- ─── UBICACIONES ────────────────────────────────────────────
INSERT INTO ubicaciones (nombre_ubicacion, descripcion) VALUES
('Almacén Central',          'Bodega principal — acceso restringido'),
('Taller de Calibración',    'Área de calibración y mantenimiento especializado'),
('Obra Norte - Faena 1',     'Proyecto activo en terreno norte'),
('Obra Sur - Proyecto B',    'Proyecto activo en terreno sur'),
('NSW',                      'New South Wales'),
('TAS',                      'Tasmania'),
('QLD',                      'Queensland'),
('ATC',                      'Australian Capital Territory'),
('NT',                       'Northern Territory'),
('SA',                       'South Australia'),
('VIC',                      'Victoria'),
('WA',                       'Western Australia');

-- ─── ITEMS (CATÁLOGO) ───────────────────────────────────────
INSERT INTO items (nombre, tipo, stock_global_consumibles) VALUES
-- Consumibles
('Cinta Aislante 3M',                   'consumible', 150),
('Guantes de Seguridad Nivel 5',        'consumible', 45),
('Bridas de Plástico (Pack 100)',        'consumible', 20),
('Lubricante WD-40 (350ml)',            'consumible', 30),
-- Herramientas
('Analizador de Espectro Keysight',     'herramienta', 0),
('Taladro Percutor DeWalt 20V',        'herramienta', 0),
('Multímetro Digital Fluke 87V',       'herramienta', 0),
('Fusionadora de Fibra Fujikura 90S',  'herramienta', 0),
('Osciloscopio Tektronix TBS1104',     'herramienta', 0),
('Escalera Fibra de Vidrio 6m',        'herramienta', 0),
('Detector de Cámara Térmica FLIR',    'herramienta', 0),
('Reflectómetro OTDR Yokogawa',        'herramienta', 0);

-- ─── ACTIVOS (herramientas individualizadas) ─────────────────
-- 1. Disponible en Almacén Central - calibración y tag OK
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, team, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Analizador de Espectro Keysight'),
    'AE-KS-2024-001',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Almacén Central'),
    'Calibration',
    CURRENT_DATE - INTERVAL '6 months',
    CURRENT_DATE + INTERVAL '6 months',
    CURRENT_DATE - INTERVAL '1 month',
    CURRENT_DATE + INTERVAL '5 months',
    'disponible'
);

-- 2. En uso por Juan Pérez - calibración vence en 10 días (alerta amarilla)
INSERT INTO activos (item_id, numero_serie, usuario_actual_id, team, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Taladro Percutor DeWalt 20V'),
    'DW-20V-459-XT',
    (SELECT id FROM usuarios WHERE nombre = 'Juan Pérez'),
    'Transmission',
    CURRENT_DATE - INTERVAL '11 months',
    CURRENT_DATE + INTERVAL '10 days',
    CURRENT_DATE - INTERVAL '2 months',
    CURRENT_DATE + INTERVAL '4 months',
    'en_uso'
);

-- 3. En uso por María - tag vencido hace 5 días (alerta roja)
INSERT INTO activos (item_id, numero_serie, usuario_actual_id, team, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Analizador de Espectro Keysight'),
    'AE-KS-2023-002',
    (SELECT id FROM usuarios WHERE nombre = 'María González'),
    'Energy',
    CURRENT_DATE - INTERVAL '6 months',
    CURRENT_DATE + INTERVAL '6 months',
    CURRENT_DATE - INTERVAL '7 months',
    CURRENT_DATE - INTERVAL '5 days',
    'calibracion_pendiente'
);

-- 4. Fluke Multímetro en NSW - sin fechas de calibración (dato incompleto de prueba)
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, team, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Multímetro Digital Fluke 87V'),
    'FLK-87V-9901',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'NSW'),
    'Networks',
    'disponible'
);

-- 5. Fusionadora en Mantenimiento en Taller
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, team, fecha_ultima_cali, fecha_prox_cali, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Fusionadora de Fibra Fujikura 90S'),
    'FJK-90S-001',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Taller de Calibración'),
    'Instrumentation',
    CURRENT_DATE - INTERVAL '1 year',
    CURRENT_DATE + INTERVAL '2 months',
    'en_mantenimiento'
);

-- 6. Osciloscopio disponible en VIC - calibración vence en 29 días (alerta verde)
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, team, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Osciloscopio Tektronix TBS1104'),
    'TEK-TBS1104-007',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'VIC'),
    'Calibration',
    CURRENT_DATE - INTERVAL '11 months',
    CURRENT_DATE + INTERVAL '29 days',
    CURRENT_DATE - INTERVAL '1 month',
    CURRENT_DATE + INTERVAL '6 days',
    'disponible'
);

-- 7. Escalera dañada fuera de servicio
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, team, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Escalera Fibra de Vidrio 6m'),
    'ESC-FV-QLD-003',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'QLD'),
    'Civil Works',
    'danado'
);

-- 8. Cámara térmica disponible - en terreno WA
INSERT INTO activos (item_id, numero_serie, usuario_actual_id, team, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Detector de Cámara Térmica FLIR'),
    'FLIR-E86-WA-001',
    (SELECT id FROM usuarios WHERE nombre = 'Luis Rodríguez'),
    'Maintenance',
    CURRENT_DATE - INTERVAL '3 months',
    CURRENT_DATE + INTERVAL '9 months',
    CURRENT_DATE - INTERVAL '2 months',
    CURRENT_DATE + INTERVAL '10 months',
    'en_uso'
);

-- 9. OTDR disponible en Almacén
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, team, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Reflectómetro OTDR Yokogawa'),
    'YOK-AQ7280-SA-01',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'SA'),
    'Networks',
    CURRENT_DATE - INTERVAL '4 months',
    CURRENT_DATE + INTERVAL '8 months',
    CURRENT_DATE - INTERVAL '3 months',
    CURRENT_DATE + INTERVAL '9 months',
    'disponible'
);

-- 10. Activo sin equipo asignado (para probar filtro "Sin Equipo")
INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, estado)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Multímetro Digital Fluke 87V'),
    'FLK-87V-TAS-002',
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'TAS'),
    'desconocido'
);

-- ─── MOVIMIENTOS (historial auditable) ──────────────────────

-- Ingreso inicial del Analizador de Espectro al Almacén
INSERT INTO movimientos (item_id, activo_id, usuario_id, ubicacion_destino_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Analizador de Espectro Keysight'),
    (SELECT id FROM activos WHERE numero_serie = 'AE-KS-2024-001'),
    (SELECT id FROM usuarios WHERE nombre = 'Carlos Admin'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Almacén Central'),
    1, 'ingreso', NOW() - INTERVAL '6 months', 'Ingreso inicial vía compra. Equipo nuevo certificado.'
);

-- Despacho del Taladro a Juan Pérez
INSERT INTO movimientos (item_id, activo_id, usuario_id, ubicacion_origen_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Taladro Percutor DeWalt 20V'),
    (SELECT id FROM activos WHERE numero_serie = 'DW-20V-459-XT'),
    (SELECT id FROM usuarios WHERE nombre = 'Juan Pérez'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Almacén Central'),
    1, 'despacho', NOW() - INTERVAL '20 days', 'Despacho para Proyecto Norte Faena 1.'
);

-- Ingreso del segundo analizador a taller con calibración pendiente
INSERT INTO movimientos (item_id, activo_id, usuario_id, ubicacion_destino_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Analizador de Espectro Keysight'),
    (SELECT id FROM activos WHERE numero_serie = 'AE-KS-2023-002'),
    (SELECT id FROM usuarios WHERE nombre = 'Carlos Admin'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Taller de Calibración'),
    1, 'ingreso', NOW() - INTERVAL '7 months', 'Ingreso inicial — pendiente certificado de calibración.'
);

-- Despacho a María
INSERT INTO movimientos (item_id, activo_id, usuario_id, ubicacion_origen_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Analizador de Espectro Keysight'),
    (SELECT id FROM activos WHERE numero_serie = 'AE-KS-2023-002'),
    (SELECT id FROM usuarios WHERE nombre = 'María González'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Taller de Calibración'),
    1, 'despacho', NOW() - INTERVAL '2 months', 'Despacho a técnico de campo. Pendiente calibración.'
);

-- Ingreso de consumibles al almacén
INSERT INTO movimientos (item_id, usuario_id, ubicacion_destino_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Cinta Aislante 3M'),
    (SELECT id FROM usuarios WHERE nombre = 'Carlos Admin'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Almacén Central'),
    150, 'ingreso', NOW() - INTERVAL '10 days', 'Compra de reposición de stock.'
);

-- Despacho de consumibles a obra norte
INSERT INTO movimientos (item_id, usuario_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Cinta Aislante 3M'),
    (SELECT id FROM usuarios WHERE nombre = 'Juan Pérez'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Almacén Central'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Obra Norte - Faena 1'),
    25, 'despacho', NOW() - INTERVAL '5 days', 'Despacho para trabajo de campo Faena 1.'
);

-- Devolución de equipo en mantenimiento
INSERT INTO movimientos (item_id, activo_id, usuario_id, ubicacion_destino_id, cantidad, tipo_movimiento, fecha_movimiento, observacion)
VALUES (
    (SELECT id FROM items WHERE nombre = 'Fusionadora de Fibra Fujikura 90S'),
    (SELECT id FROM activos WHERE numero_serie = 'FJK-90S-001'),
    (SELECT id FROM usuarios WHERE nombre = 'Pedro Ramírez'),
    (SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Taller de Calibración'),
    1, 'devolucion', NOW() - INTERVAL '3 days', 'Enviado a taller: falla en arco de fusión. Requiere revisión técnica.'
);

-- ==============================================================================
-- CREDENCIALES DE ACCESO AL DASHBOARD
-- ==============================================================================
-- Email:    admin@entelso.com
-- Password: 123456  (el hash de arriba corresponde a '123456' de bcrypt)
-- ⚠️  CAMBIAR EL PIN DEL ADMIN EN EL PRIMER LOGIN desde Perfil > Seguridad
-- ==============================================================================
