const db     = require('../../config/database');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const env    = require('../../config/environment');

/**
 * Intenta hacer login con email + PIN.
 * Devuelve un JWT firmado si las credenciales son válidas.
 */
exports.login = async (email, pin) => {
  // Buscar usuario por email (solo admins y managers pueden entrar al dashboard)
  const { rows } = await db.query(
    `SELECT id, nombre, email, rol, pin_hash, activo
     FROM usuarios
     WHERE LOWER(email) = LOWER($1) AND activo = TRUE`,
    [email.trim()]
  );

  const usuario = rows[0];

  // Usuario no existe o no está activo
  if (!usuario) {
    throw Object.assign(
      new Error('Credenciales incorrectas.'),
      { isOperational: true, statusCode: 401 }
    );
  }

  // El usuario no tiene PIN configurado
  if (!usuario.pin_hash) {
    throw Object.assign(
      new Error('Este usuario no tiene acceso al dashboard configurado. Contacta al administrador.'),
      { isOperational: true, statusCode: 403 }
    );
  }

  // Verificar PIN con bcrypt
  const pinValido = await bcrypt.compare(String(pin), usuario.pin_hash);
  if (!pinValido) {
    throw Object.assign(
      new Error('Credenciales incorrectas.'),
      { isOperational: true, statusCode: 401 }
    );
  }

  // Generar JWT con 8 horas de vida (una jornada laboral)
  const token = jwt.sign(
    {
      sub:    usuario.id,
      nombre: usuario.nombre,
      email:  usuario.email,
      rol:    usuario.rol,
    },
    env.JWT_SECRET,
    { expiresIn: '2h' }  // 2h: reduce la ventana de tokens de usuarios desactivados
  );

  return {
    token,
    usuario: {
      id:     usuario.id,
      nombre: usuario.nombre,
      email:  usuario.email,
      rol:    usuario.rol,
    },
  };
};

// GET PROFILE INFO
exports.getMe = async (userId) => {
  const { rows } = await db.query(
    'SELECT id, nombre, email, telefono_whatsapp, team, rol, activo, en_terreno, preferencias, fecha_registro FROM usuarios WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw Object.assign(new Error('Usuario no encontrado.'), { isOperational: true, statusCode: 404 });
  return rows[0];
};

// UPDATE PROFILE INFO
exports.updateMe = async (userId, data) => {
  const fields = [];
  const values = [];
  let idx = 1;

  if (data.nombre !== undefined) { fields.push(`nombre = $${idx++}`); values.push(data.nombre); }
  if (data.email !== undefined) { fields.push(`email = $${idx++}`); values.push(data.email); }
  if (data.telefono_whatsapp !== undefined) { fields.push(`telefono_whatsapp = $${idx++}`); values.push(data.telefono_whatsapp); }
  if (data.preferencias !== undefined) { fields.push(`preferencias = $${idx++}`); values.push(data.preferencias); }

  if (fields.length === 0) return await exports.getMe(userId);

  values.push(userId);
  const query = `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, nombre, email, telefono_whatsapp, team, rol, activo, en_terreno, preferencias`;
  const { rows } = await db.query(query, values);
  return rows[0];
};

// CHANGE PASSWORD / PIN
exports.changePassword = async (userId, oldPassword, newPassword) => {
  const { rows } = await db.query('SELECT pin_hash FROM usuarios WHERE id = $1', [userId]);
  const usuario = rows[0];
  if (!usuario) throw Object.assign(new Error('Usuario no encontrado.'), { isOperational: true, statusCode: 404 });

  // If user has no PIN yet, skip the old password check (first-time setup)
  if (usuario.pin_hash) {
    const pinValido = await bcrypt.compare(String(oldPassword), usuario.pin_hash);
    if (!pinValido) throw Object.assign(new Error('La contraseña actual es incorrecta.'), { isOperational: true, statusCode: 401 });
  }

  if (!newPassword || String(newPassword).length < 4) {
    throw Object.assign(new Error('La nueva contraseña debe tener al menos 4 caracteres.'), { isOperational: true, statusCode: 400 });
  }

  const newHash = await bcrypt.hash(String(newPassword), 10);
  await db.query('UPDATE usuarios SET pin_hash = $1 WHERE id = $2', [newHash, userId]);
  return true;
};

// 2FA SETUP
exports.setup2FA = async (userId, email) => {
  let authenticator, qrcode;
  try {
    authenticator = require('otplib').authenticator;
    qrcode = require('qrcode');
  } catch (e) {
    throw Object.assign(
      new Error('2FA no disponible. Las dependencias (otplib, qrcode) no están instaladas. Ejecuta "npm install" en el backend.'),
      { isOperational: true, statusCode: 501 }
    );
  }

  try {
    const secret = authenticator.generateSecret();
    const userIdentifier = email || `User${userId}`;
    const otpauth = authenticator.keyuri(userIdentifier, 'Entelso', secret);
    const qrDataUrl = await qrcode.toDataURL(otpauth);

    await db.query('UPDATE usuarios SET secret_2fa = $1 WHERE id = $2', [secret, userId]);
    return { secret, qrCode: qrDataUrl };
  } catch (e) {
    console.error(e);
    throw Object.assign(new Error('Error generando 2FA: ' + e.message), { isOperational: true, statusCode: 500 });
  }
};

// 2FA VERIFY
exports.verify2FA = async (userId, token) => {
  const { rows } = await db.query('SELECT secret_2fa FROM usuarios WHERE id = $1', [userId]);
  const secret = rows[0]?.secret_2fa;
  if (!secret) throw new Error('No hay secreto 2FA configurado');

  try {
    const { authenticator } = require('otplib');
    const isValid = authenticator.verify({ token, secret });
    if (!isValid) throw new Error('Token 2FA inválido');
    
    await db.query('UPDATE usuarios SET is_2fa_enabled = TRUE WHERE id = $1', [userId]);
    return true;
  } catch (err) {
    throw new Error('Token 2FA inválido o error en librería');
  }
};
