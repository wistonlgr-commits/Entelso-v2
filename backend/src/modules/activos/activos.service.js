const db = require('../../config/database');

const ASSET_SELECT = `
  SELECT a.id, a.numero_serie, a.estado,
         a.fecha_ultima_cali, a.fecha_prox_cali,
         a.fecha_ultimo_tag,  a.fecha_prox_tag,
         i.id   AS item_id,       i.nombre AS nombre_item,
         u.id   AS usuario_id,    u.nombre AS nombre_usuario, u.telefono_whatsapp, u.team AS usuario_team,
         ub.id  AS ubicacion_id,  ub.nombre_ubicacion
  FROM   activos a
  JOIN   items     i  ON a.item_id             = i.id
  LEFT JOIN usuarios  u  ON a.usuario_actual_id    = u.id
  LEFT JOIN ubicaciones ub ON a.ubicacion_actual_id = ub.id
`;

exports.getAll = async (filters = {}) => {
  const { estado, item_id, usuario_actual_id, ubicacion_actual_id, search } = filters;
  const conds = ['1=1']; const params = [];
  const add = (cond, val) => { params.push(val); conds.push(`${cond}$${params.length}`); };

  if (estado)              add('a.estado = ',             estado);
  if (item_id)             add('a.item_id = ',            Number(item_id));
  if (usuario_actual_id)   add('a.usuario_actual_id = ',  Number(usuario_actual_id));
  if (ubicacion_actual_id) add('a.ubicacion_actual_id = ', Number(ubicacion_actual_id));
  if (search) {
    params.push(`%${search}%`);
    conds.push(`(LOWER(a.numero_serie) LIKE LOWER($${params.length}) OR LOWER(i.nombre) LIKE LOWER($${params.length}))`);
  }

  const { rows } = await db.query(`${ASSET_SELECT} WHERE ${conds.join(' AND ')} ORDER BY a.id DESC`, params);
  return rows;
};

exports.getById = async (id) => {
  const { rows } = await db.query(`${ASSET_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
};

exports.getBySerial = async (serial) => {
  const { rows } = await db.query(`${ASSET_SELECT} WHERE LOWER(a.numero_serie) = LOWER($1)`, [serial.trim()]);
  return rows[0] ?? null;
};

exports.create = async (data) => {
  const { item_id, numero_serie, usuario_actual_id, ubicacion_actual_id,
          fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado, team } = data;
  if (usuario_actual_id && ubicacion_actual_id)
    throw Object.assign(new Error('Un activo no puede tener usuario y ubicación simultáneamente.'), { isOperational: true });

  const { rows } = await db.query(
    `INSERT INTO activos (item_id, numero_serie, usuario_actual_id, ubicacion_actual_id,
       fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado, team)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [item_id, numero_serie.trim(), usuario_actual_id ?? null, ubicacion_actual_id ?? null,
     fecha_ultima_cali ?? null, fecha_prox_cali ?? null,
     fecha_ultimo_tag  ?? null, fecha_prox_tag  ?? null,
     estado ?? 'disponible', team ?? null]
  );
  return rows[0];
};

exports.update = async (id, patch) => {
  const allowed = ['usuario_actual_id','ubicacion_actual_id','estado','team',
                   'fecha_ultima_cali','fecha_prox_cali','fecha_ultimo_tag','fecha_prox_tag'];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) { params.push(patch[k] === '' ? null : patch[k]); sets.push(`${k}=$${params.length}`); }
  }
  if (!sets.length) return exports.getById(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE activos SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params
  );
  return rows[0];
};

exports.remove = async (id) => {
  // Check for dependencies first
  const { rows } = await db.query('SELECT id FROM movimientos WHERE activo_id = $1 LIMIT 1', [id]);
  if (rows.length > 0) {
    // Soft delete: mark as fuera_de_servicio if has history
    await db.query(`UPDATE activos SET estado='fuera_de_servicio', usuario_actual_id=NULL WHERE id=$1`, [id]);
    return { soft: true };
  }
  await db.query('DELETE FROM activos WHERE id=$1', [id]);
  return { soft: false };
};
