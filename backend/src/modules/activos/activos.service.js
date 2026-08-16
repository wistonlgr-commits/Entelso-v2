const db = require('../../config/database');

const ASSET_SELECT = `
  SELECT a.id, a.numero_serie, a.original_serial, a.estado, a.team, a.parent_activo_id,
         a.fecha_registro,
         a.fecha_ultima_cali, a.fecha_prox_cali,
         a.fecha_ultimo_tag,  a.fecha_prox_tag,
         a.fotos, a.notas,
         i.id   AS item_id,       i.nombre AS nombre_item, i.tipo AS tipo, i.categoria_padre AS categoria_padre, i.marca AS marca,
         u.id   AS usuario_id,    u.nombre AS nombre_usuario, u.telefono_whatsapp, u.team AS usuario_team,
         ub.id  AS ubicacion_id,  ub.nombre_ubicacion
  FROM   activos a
  JOIN   items     i  ON a.item_id             = i.id
  LEFT JOIN usuarios  u  ON a.usuario_actual_id    = u.id
  LEFT JOIN ubicaciones ub ON a.ubicacion_actual_id = ub.id
`;

const PREFIX_MAP = {
  'power tools': 'PT',
  'hand tools': 'HT',
  'consumables': 'CO',
  'walktest kits': 'WK',
  'testing equipment': 'TE',
  'safety & ppe': 'SA',
  'cam keys': 'CK',
};

async function generateAutoId(categoria) {
  const categoryStr = (categoria || '').toLowerCase().trim();
  const prefix = PREFIX_MAP[categoryStr] || 'EQ';
  
  let seq = 1;
  const res = await db.query(`
    SELECT numero_serie 
    FROM activos 
    WHERE numero_serie LIKE $1
  `, [prefix + '-%']);
  
  if (res.rows.length > 0) {
    let maxNum = 0;
    for (const row of res.rows) {
      const suffix = row.numero_serie.substring(prefix.length + 1);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
    seq = maxNum + 1;
  }
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

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
    conds.push(`(LOWER(a.numero_serie) LIKE LOWER($${params.length}) OR LOWER(i.nombre) LIKE LOWER($${params.length}) OR LOWER(a.original_serial) LIKE LOWER($${params.length}))`);
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
  let { item_id, descripcion, tipo, numero_serie, usuario_actual_id, ubicacion_actual_id,
          fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado, team, notas, original_serial } = data;
  if (usuario_actual_id && ubicacion_actual_id)
    throw Object.assign(new Error('An asset cannot have both a user and a location simultaneously.'), { isOperational: true });

  const existingAsset = await exports.getBySerial(numero_serie || '');
  if (existingAsset && numero_serie) {
    throw Object.assign(new Error(`Ya existe un equipo registrado con el serial: ${numero_serie}`), { isOperational: true });
  }

  const categoria = data.categoria || '';

  if (!item_id && descripcion) {
    const descTrimmed = descripcion.trim();
    // Derive the correct item tipo from the category name
    const derivedTipo = categoria.toLowerCase().includes('kit') ? 'kit'
                      : categoria.toLowerCase().includes('consumab') ? 'consumible'
                      : 'herramienta'; // Always default — frontend sends category name, not valid enum
    const itemRows = await db.query('SELECT id FROM items WHERE LOWER(nombre) = LOWER($1)', [descTrimmed]);
    if (itemRows.rows.length > 0) {
      item_id = itemRows.rows[0].id;
      // Update the existing item's categoria_padre and tipo if needed
      if (categoria) {
        await db.query('UPDATE items SET categoria_padre = COALESCE($1, categoria_padre), tipo = COALESCE($2, tipo), marca = COALESCE($3, marca) WHERE id = $4', [categoria, derivedTipo, data.marca || null, item_id]);
      }
    } else {
      const newItem = await db.query(
        'INSERT INTO items (nombre, tipo, categoria_padre, marca) VALUES ($1, $2, $3, $4) RETURNING id',
        [descTrimmed, derivedTipo, categoria || null, data.marca || null]
      );
      item_id = newItem.rows[0].id;
    }
  }

  if (!item_id) {
    throw Object.assign(new Error('Must provide item_id or descripcion.'), { isOperational: true });
  }

  let finalNumeroSerie = numero_serie ? numero_serie.trim() : null;
  let finalOriginalSerial = original_serial ? original_serial.trim() : null;

  // Si no hay numero_serie, o si no cumple con el formato estándar, autogeneramos
  if (!finalNumeroSerie || !/^[A-Z]{2,4}-\d{4,6}$/i.test(finalNumeroSerie)) {
    if (finalNumeroSerie) {
      finalOriginalSerial = finalNumeroSerie; // guardamos el serial viejo/csv
    }
    finalNumeroSerie = await generateAutoId(categoria);
  }

  const { rows } = await db.query(
    `INSERT INTO activos (item_id, numero_serie, original_serial, usuario_actual_id, ubicacion_actual_id,
       fecha_registro, fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag, estado, team, fotos, notas)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6, CURRENT_DATE),$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [item_id, finalNumeroSerie, finalOriginalSerial, usuario_actual_id ?? null, ubicacion_actual_id ?? null,
     data.fecha_registro ?? null,
     fecha_ultima_cali ?? null, fecha_prox_cali ?? null,
     fecha_ultimo_tag  ?? null, fecha_prox_tag  ?? null,
     estado ?? 'disponible', team ?? null, data.fotos ? JSON.stringify(data.fotos) : null, notas ?? null]
  );
  return rows[0];
};

exports.update = async (id, patch) => {
  // Resolve item_id: either from descripcion change or from the existing asset
  if (patch.descripcion) {
    const descTrimmed = patch.descripcion.trim();
    const categoria = patch.categoria || '';
    const derivedTipo = categoria.toLowerCase().includes('kit') ? 'kit'
                      : categoria.toLowerCase().includes('consumab') ? 'consumible'
                      : 'herramienta';

    const itemRows = await db.query('SELECT id FROM items WHERE LOWER(nombre) = LOWER($1)', [descTrimmed]);
    if (itemRows.rows.length > 0) {
      patch.item_id = itemRows.rows[0].id;
      if (categoria) {
        await db.query('UPDATE items SET categoria_padre = COALESCE($1, categoria_padre), tipo = COALESCE($2, tipo), marca = COALESCE($3, marca) WHERE id = $4', [categoria, derivedTipo, patch.marca || null, patch.item_id]);
      }
    } else {
      const newItem = await db.query(
        'INSERT INTO items (nombre, tipo, categoria_padre, marca) VALUES ($1, $2, $3, $4) RETURNING id',
        [descTrimmed, derivedTipo, categoria || null, patch.marca || null]
      );
      patch.item_id = newItem.rows[0].id;
    }
  } else if (patch.marca !== undefined || patch.categoria) {
    // No descripcion change, but marca or categoria changed — resolve item_id from existing asset
    const existing = await db.query('SELECT item_id FROM activos WHERE id = $1', [id]);
    if (existing.rows.length > 0 && existing.rows[0].item_id) {
      const existingItemId = existing.rows[0].item_id;
      const updates = [];
      const vals = [];
      if (patch.marca !== undefined) { vals.push(patch.marca || null); updates.push(`marca = $${vals.length}`); }
      if (patch.categoria) {
        vals.push(patch.categoria);
        updates.push(`categoria_padre = $${vals.length}`);
        const derivedTipo = patch.categoria.toLowerCase().includes('kit') ? 'kit'
                          : patch.categoria.toLowerCase().includes('consumab') ? 'consumible'
                          : 'herramienta';
        vals.push(derivedTipo);
        updates.push(`tipo = $${vals.length}`);
      }
      if (updates.length > 0) {
        vals.push(existingItemId);
        await db.query(`UPDATE items SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals);
      }
    }
  }

  const allowed = ['numero_serie', 'original_serial', 'item_id', 'usuario_actual_id','ubicacion_actual_id','estado','team',
                   'fecha_ultima_cali','fecha_prox_cali','fecha_ultimo_tag','fecha_prox_tag', 'fotos', 'notas', 'parent_activo_id'];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) { 
      let val = patch[k] === '' ? null : patch[k];
      if (k === 'fotos' && val !== null) {
        val = JSON.stringify(val);
      }
      params.push(val); 
      sets.push(`${k}=$${params.length}`); 
    }
  }
  if (!sets.length) return exports.getById(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE activos SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params
  );

  // Update children recursively if location/team changes
  if (patch.team !== undefined || patch.ubicacion_actual_id !== undefined || patch.usuario_actual_id !== undefined) {
    const childSets = [];
    const childParams = [];
    if (patch.team !== undefined) { childParams.push(patch.team === '' ? null : patch.team); childSets.push(`team=$${childParams.length}`); }
    if (patch.ubicacion_actual_id !== undefined) { childParams.push(patch.ubicacion_actual_id === '' ? null : patch.ubicacion_actual_id); childSets.push(`ubicacion_actual_id=$${childParams.length}`); }
    if (patch.usuario_actual_id !== undefined) { childParams.push(patch.usuario_actual_id === '' ? null : patch.usuario_actual_id); childSets.push(`usuario_actual_id=$${childParams.length}`); }
    
    if (childSets.length > 0) {
      childParams.push(id);
      await db.query(`
        WITH RECURSIVE kit_hierarchy AS (
          SELECT id FROM activos WHERE parent_activo_id = $${childParams.length}
          UNION
          SELECT a.id FROM activos a INNER JOIN kit_hierarchy k ON a.parent_activo_id = k.id
        )
        UPDATE activos SET ${childSets.join(',')} WHERE id IN (SELECT id FROM kit_hierarchy)
      `, childParams);
    }
  }

  return rows[0];
};

exports.remove = async (id) => {
  await db.query('DELETE FROM mantenimientos WHERE activo_id=$1', [id]);
  await db.query('DELETE FROM movimientos WHERE activo_id=$1', [id]);
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
        const { rows: newItem } = await client.query('INSERT INTO items (nombre, tipo) VALUES ($1, $2) RETURNING id', [item.descripcion.trim(), 'herramienta']);
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

      let finalNumeroSerie = item.numero_serie ? item.numero_serie.trim() : null;
      let finalOriginalSerial = null;
      let categoriaPadre = '';

      // Get categoria_padre to determine prefix
      const { rows: itemInfo } = await client.query('SELECT categoria_padre FROM items WHERE id = $1', [item_id]);
      if (itemInfo.length > 0) {
        categoriaPadre = itemInfo[0].categoria_padre || '';
      }

      if (!finalNumeroSerie || !/^[A-Z]{2,3}-?\d+$/i.test(finalNumeroSerie)) {
        if (finalNumeroSerie) {
          finalOriginalSerial = finalNumeroSerie;
        }
        finalNumeroSerie = await generateAutoId(categoriaPadre);
      } else {
         // If we get an explicit well-formatted serial, we still need to check for conflicts, but ON CONFLICT will handle it.
      }

      // 6. Insert into activos (with dates and original_serial)
      await client.query(`
        INSERT INTO activos (item_id, numero_serie, original_serial, ubicacion_actual_id, estado, team,
            fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (numero_serie) DO UPDATE SET
          item_id = EXCLUDED.item_id,
          ubicacion_actual_id = EXCLUDED.ubicacion_actual_id,
          estado = EXCLUDED.estado,
          team = EXCLUDED.team,
          original_serial = COALESCE(EXCLUDED.original_serial, activos.original_serial),
          fecha_ultima_cali = COALESCE(EXCLUDED.fecha_ultima_cali, activos.fecha_ultima_cali),
          fecha_prox_cali   = COALESCE(EXCLUDED.fecha_prox_cali, activos.fecha_prox_cali),
          fecha_ultimo_tag  = COALESCE(EXCLUDED.fecha_ultimo_tag, activos.fecha_ultimo_tag),
          fecha_prox_tag    = COALESCE(EXCLUDED.fecha_prox_tag, activos.fecha_prox_tag)
      `, [item_id, finalNumeroSerie, finalOriginalSerial, ubicacion_actual_id, normalizedStatus, team,
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
  const { rowCount } = await db.query(`
    WITH RECURSIVE kit_hierarchy AS (
      SELECT id FROM activos WHERE id = ANY($2::int[])
      UNION
      SELECT a.id FROM activos a INNER JOIN kit_hierarchy k ON a.parent_activo_id = k.id
    )
    UPDATE activos SET estado = $1 WHERE id IN (SELECT id FROM kit_hierarchy)
  `, [status, ids]);
  return rowCount;
};

exports.bulkUpdateZona = async (ids, zona_id) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query(`
    WITH RECURSIVE kit_hierarchy AS (
      SELECT id FROM activos WHERE id = ANY($2::int[])
      UNION
      SELECT a.id FROM activos a INNER JOIN kit_hierarchy k ON a.parent_activo_id = k.id
    )
    UPDATE activos SET ubicacion_actual_id = $1 WHERE id IN (SELECT id FROM kit_hierarchy)
  `, [zona_id, ids]);
  return rowCount;
};

exports.bulkUpdateTeam = async (ids, team) => {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await db.query(`
    WITH RECURSIVE kit_hierarchy AS (
      SELECT id FROM activos WHERE id = ANY($2::int[])
      UNION
      SELECT a.id FROM activos a INNER JOIN kit_hierarchy k ON a.parent_activo_id = k.id
    )
    UPDATE activos SET team = $1 WHERE id IN (SELECT id FROM kit_hierarchy)
  `, [team, ids]);
  return rowCount;
};
