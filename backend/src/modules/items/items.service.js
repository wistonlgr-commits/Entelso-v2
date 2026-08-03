const db = require('../../config/database');

exports.getAll = async (tipo = null) => {
  const { rows } = await db.query(
    `SELECT id, nombre, tipo, stock_global_consumibles, categoria_padre FROM items
     ${tipo ? 'WHERE tipo=$1' : ''} ORDER BY nombre ASC`,
    tipo ? [tipo] : []
  );
  return rows;
};

exports.getById = async (id) => {
  const { rows } = await db.query(
    'SELECT id, nombre, tipo, stock_global_consumibles, categoria_padre FROM items WHERE id=$1', [id]
  );
  return rows[0] ?? null;
};

exports.create = async ({ nombre, tipo, stock_global_consumibles }) => {
  const { rows } = await db.query(
    'INSERT INTO items (nombre, tipo, stock_global_consumibles) VALUES ($1,$2,$3) RETURNING *',
    [nombre, tipo, tipo === 'consumible' ? (stock_global_consumibles ?? 0) : 0]
  );
  return rows[0];
};

exports.update = async (id, { nombre, tipo }) => {
  const { rows } = await db.query(
    'UPDATE items SET nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo) WHERE id = $3 RETURNING *',
    [nombre, tipo, id]
  );
  return rows[0];
};

exports.updateStock = async (id, cantidad, operacion) => {
  const item = await exports.getById(id);
  if (!item) throw Object.assign(new Error('Item no encontrado.'), { isOperational: true, statusCode: 404 });
  if (item.tipo !== 'consumible')
    throw Object.assign(new Error('Solo se puede actualizar stock de consumibles.'), { isOperational: true });

  const op = operacion === 'restar' ? '-' : '+';
  const { rows } = await db.query(
    `UPDATE items SET stock_global_consumibles = stock_global_consumibles ${op} $1 WHERE id=$2 RETURNING *`,
    [cantidad, id]
  );
  return rows[0];
};

exports.remove = async (id) => {
  const check = await db.query('SELECT id FROM activos WHERE item_id = $1 LIMIT 1', [id]);
  if (check.rows.length > 0) throw Object.assign(new Error('No se puede eliminar porque hay equipos asignados a esta categoría.'), { isOperational: true });
  await db.query('DELETE FROM items WHERE id = $1', [id]);
};

