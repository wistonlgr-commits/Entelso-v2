-- Tabla para el historial y gestión de mantenimientos reales
CREATE TABLE IF NOT EXISTS mantenimientos (
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

-- Vista para alertas dinámicas de inventario
DROP VIEW IF EXISTS v_alertas_inventario;
CREATE OR REPLACE VIEW v_alertas_inventario AS
SELECT 
    a.id AS activo_id,
    a.numero_serie,
    i.nombre AS nombre_item,
    CASE 
        WHEN a.fecha_prox_cali < CURRENT_DATE THEN 'Calibración Vencida'
        WHEN a.fecha_prox_cali <= CURRENT_DATE + INTERVAL '15 days' THEN 'Calibración Próxima'
        WHEN a.fecha_prox_tag < CURRENT_DATE THEN 'Tag Vencido'
        WHEN a.fecha_prox_tag <= CURRENT_DATE + INTERVAL '7 days' THEN 'Tag Próximo'
        ELSE 'Ok'
    END AS tipo_alerta,
    LEAST(a.fecha_prox_cali, a.fecha_prox_tag) AS fecha_vencimiento,
    EXTRACT(DAY FROM (LEAST(a.fecha_prox_cali, a.fecha_prox_tag) - CURRENT_TIMESTAMP)) AS dias_restantes
FROM activos a
JOIN items i ON a.item_id = i.id
WHERE 
    (a.fecha_prox_cali <= CURRENT_DATE + INTERVAL '15 days') OR
    (a.fecha_prox_tag <= CURRENT_DATE + INTERVAL '7 days');
