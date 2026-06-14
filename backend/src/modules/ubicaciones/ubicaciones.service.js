const db = require('../../config/database');

exports.getAll = async () => {
  const { rows } = await db.query(
    'SELECT id, nombre_ubicacion, descripcion FROM ubicaciones ORDER BY nombre_ubicacion ASC'
  );
  return rows;
};

exports.getById = async (id) => {
  const { rows } = await db.query(
    'SELECT id, nombre_ubicacion, descripcion FROM ubicaciones WHERE id=$1', [id]
  );
  return rows[0] ?? null;
};

exports.getAssets = async (id) => {
  const { rows } = await db.query(
    `SELECT a.id, a.numero_serie, a.estado, a.fecha_prox_cali, a.fecha_prox_tag,
            i.nombre AS nombre_item
     FROM activos a JOIN items i ON a.item_id=i.id
     WHERE a.ubicacion_actual_id=$1 ORDER BY i.nombre ASC`,
    [id]
  );
  return rows;
};

exports.create = async ({ nombre_ubicacion, descripcion }) => {
  const { rows } = await db.query(
    'INSERT INTO ubicaciones (nombre_ubicacion, descripcion) VALUES ($1,$2) RETURNING *',
    [nombre_ubicacion, descripcion ?? '']
  );
  return rows[0];
};
