const db = require('../../config/database');

exports.getAll = async () => {
  const { rows } = await db.query('SELECT * FROM teams ORDER BY nombre ASC');
  return rows;
};

exports.create = async (nombre) => {
  const { rows } = await db.query(
    'INSERT INTO teams (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING RETURNING *',
    [nombre.trim()]
  );
  if (!rows.length) throw Object.assign(new Error('Team already exists.'), { isOperational: true });
  return rows[0];
};

exports.remove = async (id) => {
  await db.query('DELETE FROM teams WHERE id = $1', [id]);
  return { deleted: true };
};
