const db = require('../../config/database');
const bcrypt = require('bcrypt');

const throwOpError = (msg, status = 400) => {
  throw Object.assign(new Error(msg), { isOperational: true, statusCode: status });
};

const getUserByTelefono = async (telefono) => {
  // Sanitizar extrayendo estrictamente dígitos numéricos para evitar SQL Injection (%, _, etc)
  const cleanPhone = String(telefono).replace(/\D/g, '');
  if (cleanPhone.length < 8) {
    throwOpError('Invalid or too short phone number.', 400);
  }
  
  const { rows } = await db.query(
    "SELECT id, nombre, pin_hash, activo, en_terreno, rol, team, default_zona FROM usuarios WHERE regexp_replace(telefono_whatsapp, '\\D', '', 'g') LIKE $1 LIMIT 1",
    [`%${cleanPhone}`]
  );
  if (!rows[0]) throwOpError('User not registered or phone not found.', 404);
  if (!rows[0].activo) throwOpError('Inactive user.', 403);
  return rows[0];
};

const validatePin = async (user, pin) => {
  return true; // Bypass PIN verification
};

const getActivoByInventario = async (numero_inventario) => {
  const { rows } = await db.query(
    `SELECT 
       a.id, 
       a.numero_serie as numero_inventario, 
       a.estado, 
       a.item_id,
       a.usuario_actual_id,
       a.ubicacion_actual_id,
       a.notas,
       u.nombre_ubicacion as sitio,
       u.nombre_ubicacion as zona,
       usr.nombre as nombre_usuario,
       i.nombre as equipo_nombre
     FROM activos a
     JOIN items i ON a.item_id = i.id
     LEFT JOIN ubicaciones u ON a.ubicacion_actual_id = u.id
     LEFT JOIN usuarios usr ON a.usuario_actual_id = usr.id
     WHERE LOWER(a.numero_serie) = LOWER($1) OR LOWER(a.original_serial) = LOWER($1) LIMIT 1`,
    [numero_inventario.trim()]
  );
  if (!rows[0]) throwOpError('Inventory number does not exist.', 404);
  return rows[0];
};

exports.consultarEquipo = async (telefono, numero_inventario) => {
  const user = await getUserByTelefono(telefono); // Solo verificar que el teléfono existe en la DB
  const activo = await getActivoByInventario(numero_inventario);
  
  return {
    equipo: activo.equipo_nombre,
    inventario: activo.numero_inventario,
    estado: activo.estado,
    sitio_actual: activo.sitio,
    zona_actual: activo.zona,
    asignado_a: activo.nombre_usuario || 'Unassigned'
  };
};

exports.asignarEquipo = async (telefono, pin, numero_inventario, zonaInput) => {
  const user = await getUserByTelefono(telefono);
  await validatePin(user, pin);

  const activo = await getActivoByInventario(numero_inventario);

  if (activo.estado === 'en_mantenimiento' || activo.estado === 'fuera_de_servicio' || activo.estado === 'danado') {
    throwOpError(`Cannot assign equipment in status: ${activo.estado}`);
  }

  const zona = (zonaInput && zonaInput.trim()) || activo.zona || user.default_zona || 'Unassigned';

  // Registrar el movimiento
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let destUbiId = activo.ubicacion_actual_id || null;
    if (zonaInput && zonaInput.trim()) {
      const { rows: zRows } = await client.query(
        `INSERT INTO ubicaciones (nombre_ubicacion, descripcion)
         VALUES ($1, $2)
         ON CONFLICT (nombre_ubicacion) DO UPDATE SET nombre_ubicacion = EXCLUDED.nombre_ubicacion
         RETURNING id`,
        [zonaInput.trim(), `Zone (${zonaInput.trim()})`]
      );
      if (zRows[0]) destUbiId = zRows[0].id;
    }

    // Crear movimiento (Asignacion / Despacho)
    const movQuery = `
      INSERT INTO movimientos (item_id, activo_id, usuario_id, cantidad, tipo_movimiento, ubicacion_origen_id, ubicacion_destino_id, observacion)
      VALUES (
        (SELECT item_id FROM activos WHERE id = $1),
        $1, $2, 1, 'despacho', $3, $4, $5
      ) RETURNING id
    `;
    await client.query(movQuery, [activo.id, user.id, activo.ubicacion_actual_id || null, destUbiId, `Assigned via WhatsApp to ${user.nombre} (zone: ${zona})`]);

    // Actualizar estado del activo (Asignado a usuario y manteniendo su ubicación/zona física)
    await client.query(
      "UPDATE activos SET estado = 'en_uso', usuario_actual_id = $1, ubicacion_actual_id = COALESCE($2, ubicacion_actual_id) WHERE id = $3",
      [user.id, destUbiId, activo.id]
    );

    // Actualizar usuario a en_terreno = true
    await client.query("UPDATE usuarios SET en_terreno = true WHERE id = $1", [user.id]);

    await client.query('COMMIT');
    return { success: true, equipo: activo.equipo_nombre, asignado_a: user.nombre, zona_actual: zona };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.reportarMantenimiento = async (telefono, pin, numero_inventario, descripcion) => {
  const user = await getUserByTelefono(telefono);
  await validatePin(user, pin);
  const activo = await getActivoByInventario(numero_inventario);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Registrar la falla en mantenimientos
    const mantQuery = `
      INSERT INTO mantenimientos (activo_id, motivo, estado, creado_por)
      VALUES ($1, $2, 'En Proceso', $3)
      RETURNING id
    `;
    const { rows } = await client.query(mantQuery, [activo.id, descripcion, user.id]);

    // Actualizar el estado del activo a 'en_mantenimiento'
    await client.query("UPDATE activos SET estado = 'en_mantenimiento' WHERE id = $1", [activo.id]);

    await client.query('COMMIT');
    return { success: true, reporte_id: rows[0].id, equipo: activo.equipo_nombre };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const storageSvc = require('../storage/storage.service');

exports.subirFoto = async (telefono, pin, numero_inventario, base64_image, mimetype = 'image/jpeg') => {
  const user = await getUserByTelefono(telefono);
  await validatePin(user, pin);
  const activo = await getActivoByInventario(numero_inventario);

  // Verificar límite de fotos
  const countRes = await db.query('SELECT jsonb_array_length(COALESCE(fotos, \'[]\'::jsonb)) as count FROM activos WHERE id = $1', [activo.id]);
  if (countRes.rows[0].count >= 5) {
    throw Object.assign(new Error('Maximum limit of 5 photos reached for this equipment.'), { isOperational: true });
  }

  // Convertir base64 a buffer
  const base64Data = base64_image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Subir a Supabase
  const url = await storageSvc.uploadImage(buffer, `whatsapp_${numero_inventario}.jpg`, mimetype);

  // Guardar en la DB (Añadir al array de JSONB)
  await db.query(`
    UPDATE activos 
    SET fotos = COALESCE(fotos, '[]'::jsonb) || $1::jsonb 
    WHERE id = $2
  `, [JSON.stringify([url]), activo.id]);

  return { success: true, url, equipo: activo.equipo_nombre };
};

exports.devolverEquipo = async (telefono, pin, numero_inventario) => {
  const user = await getUserByTelefono(telefono);
  await validatePin(user, pin);
  const activo = await getActivoByInventario(numero_inventario);

  if (activo.usuario_actual_id !== user.id && user.rol !== 'admin') {
    throw Object.assign(new Error(`This equipment is not assigned to you.`), { isOperational: true });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO movimientos (item_id, activo_id, usuario_id, cantidad, tipo_movimiento, observacion) VALUES ($1, $2, $3, 1, $4, $5)',
      [activo.item_id, activo.id, user.id, 'devolucion', 'Returned via WhatsApp']
    );
    await client.query("UPDATE activos SET estado = 'disponible', usuario_actual_id = NULL WHERE id = $1", [activo.id]);
    await client.query('COMMIT');
    return { success: true, equipo: activo.equipo_nombre, mensaje: 'Equipment returned successfully.' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.cambiarEstado = async (telefono, pin, numero_inventario, nuevo_estado) => {
  const user = await getUserByTelefono(telefono);
  await validatePin(user, pin);
  const activo = await getActivoByInventario(numero_inventario);

  const estadosValidos = ['disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente', 'fuera_de_servicio', 'calibrado', 'danado'];
  if (!estadosValidos.includes(nuevo_estado)) {
    throw Object.assign(new Error(`Invalid status. Allowed values: ${estadosValidos.join(', ')}`), { isOperational: true });
  }

  await db.query("UPDATE activos SET estado = $1 WHERE id = $2", [nuevo_estado, activo.id]);
  return { success: true, equipo: activo.equipo_nombre, nuevo_estado, mensaje: 'Status updated successfully.' };
};

exports.consultarKit = async (numero_inventario) => {
  const activo = await getActivoByInventario(numero_inventario);
  
  const { rows: childRows } = await db.query(`
    SELECT a.numero_serie, a.estado, a.notas, i.nombre as equipo_nombre
    FROM activos a
    JOIN items i ON a.item_id = i.id
    WHERE a.parent_activo_id = $1
  `, [activo.id]);

  if (childRows.length === 0) {
    return { success: true, equipo: activo.equipo_nombre, notas: activo.notas, contenido: [], mensaje: 'The kit has no registered items or is not a kit.' };
  }

  return { 
    success: true, 
    equipo: activo.equipo_nombre, 
    notas: activo.notas,
    contenido: childRows 
  };
};
