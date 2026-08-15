const db = require('../../config/database');
const bcrypt = require('bcrypt');

const throwOpError = (msg, status = 400) => {
  throw Object.assign(new Error(msg), { isOperational: true, statusCode: status });
};

const getUserByTelefono = async (telefono) => {
  // Sanitizar extrayendo estrictamente dígitos numéricos para evitar SQL Injection (%, _, etc)
  const cleanPhone = String(telefono).replace(/\D/g, '');
  if (cleanPhone.length < 8) {
    throwOpError('Número de teléfono inválido o muy corto.', 400);
  }
  
  const { rows } = await db.query(
    "SELECT id, nombre, pin_hash, activo, en_terreno FROM usuarios WHERE regexp_replace(telefono_whatsapp, '\\D', '', 'g') LIKE $1 LIMIT 1",
    [`%${cleanPhone}`]
  );
  if (!rows[0]) throwOpError('Usuario no registrado o teléfono no encontrado.', 404);
  if (!rows[0].activo) throwOpError('Usuario inactivo.', 403);
  return rows[0];
};

const validatePin = async (user, pin) => {
  if (!user.pin_hash) throwOpError('El usuario no tiene PIN configurado. Contacta al admin.', 403);
  const isValid = await bcrypt.compare(String(pin), user.pin_hash);
  if (!isValid) throwOpError('PIN incorrecto.', 401);
};

const getActivoByInventario = async (numero_inventario) => {
  const { rows } = await db.query(
    `SELECT 
       a.id, 
       a.numero_serie as numero_inventario, 
       a.estado, 
       a.item_id,
       a.usuario_actual_id,
       u.nombre_ubicacion as sitio,
       u.nombre_ubicacion as zona,
       i.nombre as equipo_nombre
     FROM activos a
     JOIN items i ON a.item_id = i.id
     LEFT JOIN ubicaciones u ON a.ubicacion_actual_id = u.id
     WHERE a.numero_serie = $1 LIMIT 1`,
    [numero_inventario]
  );
  if (!rows[0]) throwOpError('Número de inventario no existe.', 404);
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
    zona_actual: activo.zona
  };
};

exports.asignarEquipo = async (telefono, pin, numero_inventario, zonaInput) => {
  const user = await getUserByTelefono(telefono);
  await validatePin(user, pin);

  const activo = await getActivoByInventario(numero_inventario);

  if (activo.estado === 'en_mantenimiento' || activo.estado === 'fuera_de_servicio' || activo.estado === 'danado') {
    throwOpError(`No se puede asignar un equipo en estado: ${activo.estado}`);
  }

  const zona = zonaInput || activo.zona || 'Terreno';

  // Registrar el movimiento
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Buscar la primera ubicación para origen/destino temporalmente
    const { rows: uRows } = await client.query('SELECT id FROM ubicaciones LIMIT 1');
    const ubiId = uRows[0] ? uRows[0].id : null;

    // Crear movimiento (Asignacion / Despacho)
    const movQuery = `
      INSERT INTO movimientos (item_id, activo_id, usuario_id, cantidad, tipo_movimiento, ubicacion_origen_id, ubicacion_destino_id, observacion)
      VALUES (
        (SELECT item_id FROM activos WHERE id = $1),
        $1, $2, 1, 'despacho', $3, NULL, $4
      ) RETURNING id
    `;
    await client.query(movQuery, [activo.id, user.id, ubiId, `Asignado vía WhatsApp a zona: ${zona}`]);

    // Actualizar estado del activo (Asignado a usuario, limpiando ubicación física)
    await client.query(
      "UPDATE activos SET estado = 'en_uso', usuario_actual_id = $1, ubicacion_actual_id = NULL WHERE id = $2",
      [user.id, activo.id]
    );

    // Actualizar usuario a en_terreno = true
    await client.query("UPDATE usuarios SET en_terreno = true WHERE id = $1", [user.id]);

    await client.query('COMMIT');
    return { success: true, equipo: activo.equipo_nombre, asignado_a: user.nombre };
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
    throw Object.assign(new Error('Límite máximo de 5 fotos alcanzado para este equipo.'), { isOperational: true });
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
    throw Object.assign(new Error(`El equipo no está asignado a ti.`), { isOperational: true });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO movimientos (item_id, activo_id, usuario_id, tipo_movimiento, observacion) VALUES ($1, $2, $3, $4, $5)',
      [activo.item_id, activo.id, user.id, 'devolucion', 'Devuelto vía WhatsApp']
    );
    await client.query("UPDATE activos SET estado = 'disponible', usuario_actual_id = NULL WHERE id = $1", [activo.id]);
    await client.query('COMMIT');
    return { success: true, equipo: activo.equipo_nombre, mensaje: 'Equipo devuelto correctamente.' };
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
    throw Object.assign(new Error(`Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}`), { isOperational: true });
  }

  await db.query("UPDATE activos SET estado = $1 WHERE id = $2", [nuevo_estado, activo.id]);
  return { success: true, equipo: activo.equipo_nombre, nuevo_estado, mensaje: 'Estado actualizado correctamente.' };
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
    return { success: true, equipo: activo.equipo_nombre, notas: activo.notas, contenido: [], mensaje: 'El kit no tiene ítems registrados o no es un kit.' };
  }

  return { 
    success: true, 
    equipo: activo.equipo_nombre, 
    notas: activo.notas,
    contenido: childRows 
  };
};
