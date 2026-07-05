const db = require('../../config/database');

const ASSET_SELECT = `
  SELECT a.id, a.numero_serie, a.estado, a.team,
         a.fecha_ultima_cali, a.fecha_prox_cali,
         a.fecha_ultimo_tag,  a.fecha_prox_tag,
         i.id   AS item_id,       i.nombre AS nombre_item, i.tipo AS tipo,
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
  let { item_id, descripcion, numero_serie, usuario_actual_id, ubicacion_actual_id,
          fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado, team } = data;
  if (usuario_actual_id && ubicacion_actual_id)
    throw Object.assign(new Error('An asset cannot have both a user and a location simultaneously.'), { isOperational: true });

  if (!item_id && descripcion) {
    const descTrimmed = descripcion.trim();
    const itemRows = await db.query('SELECT id FROM items WHERE LOWER(nombre) = LOWER($1)', [descTrimmed]);
    if (itemRows.rows.length > 0) {
      item_id = itemRows.rows[0].id;
    } else {
      const newItem = await db.query('INSERT INTO items (nombre, tipo) VALUES ($1, $2) RETURNING id', [descTrimmed, 'tool']);
      item_id = newItem.rows[0].id;
    }
  }

  if (!item_id) {
    throw Object.assign(new Error('Must provide item_id or descripcion.'), { isOperational: true });
  }

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

exports.removeAll = async () => {
  await db.query('DELETE FROM movimientos');
  await db.query('DELETE FROM mantenimientos');
  await db.query('DELETE FROM activos');
  await db.query('DELETE FROM items');
  return { deleted: true };
};

/**
 * Safely parse date strings from Excel into YYYY-MM-DD format.
 * Handles: '7/1/2026', '2026-01-15', 'sept-20', 'Jan 2025', etc.
 */
function parseDateStr(dateStr) {
  if (!dateStr) return null;
  let ds = String(dateStr).trim();
  if (!ds || ds === '-' || ds === '—' || ds.toLowerCase() === 'n/a') return null;

  // Handle "sept-20", "jan-25" style (month abbreviation + 2-digit year)
  const monthYearMatch = ds.match(/^([a-z]{3,9})-(\d{2})$/i);
  if (monthYearMatch) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',sept:'09',oct:'10',nov:'11',dec:'12' };
    const m = months[monthYearMatch[1].toLowerCase()] || '01';
    ds = `20${monthYearMatch[2]}-${m}-01`;
  }

  // Handle DD/MM/YYYY or D/M/YY
  const dmyMatch = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, '0');
    let month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    ds = year + '-' + month + '-' + day;
  }

  const d = new Date(ds);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

exports.bulkCreate = async (activosData) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;

    for (const item of activosData) {
      // 1. Resolve or create Item Category (by name)
      let item_id;
      const { rows: itemRows } = await client.query('SELECT id FROM items WHERE LOWER(nombre) = LOWER($1)', [item.descripcion.trim()]);
      if (itemRows.length > 0) {
        item_id = itemRows[0].id;
      } else {
        const { rows: newItem } = await client.query('INSERT INTO items (nombre, tipo) VALUES ($1, $2) RETURNING id', [item.descripcion.trim(), 'tool']);
        item_id = newItem[0].id;
      }

      // 2. Resolve Zone ID (by name)
      let ubicacion_actual_id = null;
      if (item.zona) {
        const { rows: zoneRows } = await client.query('SELECT id FROM ubicaciones WHERE LOWER(nombre_ubicacion) = LOWER($1)', [item.zona.trim()]);
        if (zoneRows.length > 0) ubicacion_actual_id = zoneRows[0].id;
        else {
          const { rows: newZone } = await client.query('INSERT INTO ubicaciones (nombre_ubicacion) VALUES ($1) RETURNING id', [item.zona.trim()]);
          ubicacion_actual_id = newZone[0].id;
        }
      }

      // 3. Resolve Team
      const team = item.team ? item.team.trim() : null;

      // 4. Normalize Status
      let rawStatus = (item.estado || '').toLowerCase().trim();
      const statusMap = {
        'available': 'disponible', 'in use': 'en_uso', 'maintenance': 'en_mantenimiento',
        'under maintenance': 'en_mantenimiento', 'damaged': 'danado', 'broken': 'danado',
        'out of service': 'fuera_de_servicio', 'calibration pending': 'calibracion_pendiente',
        'calibrated': 'calibrado', 'good': 'disponible', 'fair': 'disponible', 'poor': 'danado'
      };
      let normalizedStatus = statusMap[rawStatus] || rawStatus;
      const validStatuses = new Set(['disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente', 'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido']);
      if (!validStatuses.has(normalizedStatus)) {
        normalizedStatus = 'desconocido';
      }

      // 5. Parse dates from Excel
      const fecha_ultima_cali = parseDateStr(item.fecha_ultima_cali);
      const fecha_prox_cali   = parseDateStr(item.fecha_prox_cali);
      const fecha_ultimo_tag  = parseDateStr(item.fecha_ultimo_tag);
      const fecha_prox_tag    = parseDateStr(item.fecha_prox_tag);

      // 6. Insert into activos (with dates)
      await client.query(`
        INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, estado, team,
            fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (numero_serie) DO UPDATE SET
          item_id = EXCLUDED.item_id,
          ubicacion_actual_id = EXCLUDED.ubicacion_actual_id,
          estado = EXCLUDED.estado,
          team = EXCLUDED.team,
          fecha_ultima_cali = COALESCE(EXCLUDED.fecha_ultima_cali, activos.fecha_ultima_cali),
          fecha_prox_cali   = COALESCE(EXCLUDED.fecha_prox_cali, activos.fecha_prox_cali),
          fecha_ultimo_tag  = COALESCE(EXCLUDED.fecha_ultimo_tag, activos.fecha_ultimo_tag),
          fecha_prox_tag    = COALESCE(EXCLUDED.fecha_prox_tag, activos.fecha_prox_tag)
      `, [item_id, item.numero_serie.trim(), ubicacion_actual_id, normalizedStatus, team,
          fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag]);

      inserted++;
    }

    await client.query('COMMIT');
    return { inserted, total: activosData.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.bulkRemoveSelected = async (ids) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query('DELETE FROM activos WHERE id = ANY($1::int[])', [ids]);
  return rowCount;
};

exports.bulkUpdateCategory = async (ids, item_id) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query('UPDATE activos SET item_id = $1 WHERE id = ANY($2::int[])', [item_id, ids]);
  return rowCount;
};

exports.bulkUpdateStatus = async (ids, status) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query('UPDATE activos SET estado = $1 WHERE id = ANY($2::int[])', [status, ids]);
  return rowCount;
};

exports.bulkUpdateZona = async (ids, zona_id) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query('UPDATE activos SET ubicacion_actual_id = $1 WHERE id = ANY($2::int[])', [zona_id, ids]);
  return rowCount;
};

exports.bulkUpdateTeam = async (ids, team) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query('UPDATE activos SET team = $1 WHERE id = ANY($2::int[])', [team, ids]);
  return rowCount;
};
