const crypto = require('crypto');
const db     = require('../../config/database');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const env    = require('../../config/environment');

function get2FAKey() {
  return crypto.createHash('sha256').update(`entelso-2fa:${env.JWT_SECRET}`).digest();
}

function encrypt2FASecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', get2FAKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decrypt2FASecret(stored) {
  if (!stored) return null;
  if (!String(stored).startsWith('enc:v1:')) return stored; // legacy plaintext fallback
  try {
    const raw = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
    if (raw.length < 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', get2FAKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

function verifyTotpCode(rawCode, secret) {
  const cleanCode = String(rawCode ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const { authenticator } = require('otplib');
  // ±1 step (±30s) tolerance handles normal clock drift on mobile authenticator apps
  authenticator.options = { window: 1 };
  try {
    return Boolean(authenticator.verify({ token: cleanCode, secret }));
  } catch (_) {
    return false;
  }
}

/**
 * Intenta hacer login con email + PIN (y código 2FA si está habilitado).
 * Devuelve un JWT firmado si las credenciales son válidas.
 */
exports.login = async (email, pin, totpCode = null) => {
  const { rows } = await db.query(
    `SELECT id, nombre, email, rol, pin_hash, activo, is_2fa_enabled, secret_2fa
     FROM usuarios
     WHERE LOWER(email) = LOWER($1) AND activo = TRUE`,
    [email.trim()]
  );

  const usuario = rows[0];

  if (!usuario) {
    throw Object.assign(
      new Error('Credenciales incorrectas.'),
      { isOperational: true, statusCode: 401, code: 'INVALID_CREDENTIALS' }
    );
  }

  if (!usuario.pin_hash) {
    throw Object.assign(
      new Error('Este usuario no tiene acceso al dashboard configurado. Contacta al administrador.'),
      { isOperational: true, statusCode: 403, code: 'NO_DASHBOARD_ACCESS' }
    );
  }

  const pinValido = await bcrypt.compare(String(pin), usuario.pin_hash);
  if (!pinValido) {
    throw Object.assign(
      new Error('Credenciales incorrectas.'),
      { isOperational: true, statusCode: 401, code: 'INVALID_CREDENTIALS' }
    );
  }

  // Verificar 2FA si está habilitado para el usuario
  if (Boolean(usuario.is_2fa_enabled)) {
    const code = totpCode !== null && totpCode !== undefined ? String(totpCode).replace(/\s+/g, '') : '';
    if (!code) {
      throw Object.assign(
        new Error('Se requiere código de verificación 2FA.'),
        { isOperational: true, statusCode: 401, code: '2FA_REQUIRED', details: { requires2FA: true } }
      );
    }
    const secret = decrypt2FASecret(usuario.secret_2fa);
    if (!secret) {
      throw Object.assign(
        new Error('Configuración 2FA inválida. Contacta al administrador.'),
        { isOperational: true, statusCode: 500, code: '2FA_MISCONFIGURED' }
      );
    }
    if (!verifyTotpCode(code, secret)) {
      throw Object.assign(
        new Error('Código 2FA inválido.'),
        { isOperational: true, statusCode: 401, code: 'INVALID_2FA_TOKEN' }
      );
    }
  }

  const token = jwt.sign(
    {
      sub:    usuario.id,
      nombre: usuario.nombre,
      email:  usuario.email,
      rol:    usuario.rol,
    },
    env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  return {
    token,
    usuario: {
      id:             usuario.id,
      nombre:         usuario.nombre,
      email:          usuario.email,
      rol:            usuario.rol,
      is_2fa_enabled: Boolean(usuario.is_2fa_enabled),
    },
  };
};

// GET PROFILE INFO
exports.getMe = async (userId) => {
  const { rows } = await db.query(
    'SELECT id, nombre, email, telefono_whatsapp, team, rol, activo, en_terreno, is_2fa_enabled, preferencias, fecha_registro FROM usuarios WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw Object.assign(new Error('Usuario no encontrado.'), { isOperational: true, statusCode: 404 });
  return {
    ...rows[0],
    is_2fa_enabled: Boolean(rows[0].is_2fa_enabled),
  };
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
  const query = `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, nombre, email, telefono_whatsapp, team, rol, activo, en_terreno, is_2fa_enabled, preferencias`;
  const { rows } = await db.query(query, values);
  return rows[0] ? { ...rows[0], is_2fa_enabled: Boolean(rows[0].is_2fa_enabled) } : null;
};

// CHANGE PASSWORD / PIN
exports.changePassword = async (userId, oldPassword, newPassword) => {
  const { rows } = await db.query('SELECT pin_hash FROM usuarios WHERE id = $1', [userId]);
  const usuario = rows[0];
  if (!usuario) throw Object.assign(new Error('Usuario no encontrado.'), { isOperational: true, statusCode: 404 });

  if (usuario.pin_hash) {
    const pinValido = await bcrypt.compare(String(oldPassword), usuario.pin_hash);
    if (!pinValido) {
      throw Object.assign(new Error('La contraseña actual es incorrecta.'), {
        isOperational: true,
        statusCode: 401,
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }
  }

  if (!newPassword || String(newPassword).length < 4) {
    throw Object.assign(new Error('La nueva contraseña debe tener al menos 4 caracteres.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const newHash = await bcrypt.hash(String(newPassword), 10);
  await db.query('UPDATE usuarios SET pin_hash = $1 WHERE id = $2', [newHash, userId]);
  return true;
};

// 2FA SETUP (Google Authenticator / Authy / Microsoft Authenticator TOTP)
exports.setup2FA = async (userId, email) => {
  const { rows: existing } = await db.query(
    'SELECT is_2fa_enabled FROM usuarios WHERE id = $1',
    [userId]
  );
  if (existing[0] && Boolean(existing[0].is_2fa_enabled)) {
    throw Object.assign(
      new Error('La autenticación 2FA ya está activada. Desactívala primero antes de volver a configurarla.'),
      { isOperational: true, statusCode: 400, code: '2FA_ALREADY_ENABLED' }
    );
  }

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

    await db.query('UPDATE usuarios SET secret_2fa = $1 WHERE id = $2', [encrypt2FASecret(secret), userId]);
    return { secret, otpauth, qrCode: qrDataUrl };
  } catch (e) {
    console.error(e);
    throw Object.assign(new Error('Error generando 2FA: ' + e.message), { isOperational: true, statusCode: 500 });
  }
};

// 2FA VERIFY
exports.verify2FA = async (userId, token) => {
  const cleanToken = token !== undefined && token !== null ? String(token).replace(/\s+/g, '') : '';
  if (!cleanToken) {
    throw Object.assign(new Error('El código 2FA es obligatorio.'), { isOperational: true, statusCode: 400, code: 'VALIDATION_ERROR' });
  }
  const { rows } = await db.query('SELECT secret_2fa FROM usuarios WHERE id = $1', [userId]);
  const secret = decrypt2FASecret(rows[0]?.secret_2fa);
  if (!secret) {
    throw Object.assign(new Error('No hay secreto 2FA configurado.'), { isOperational: true, statusCode: 400, code: '2FA_NOT_SETUP' });
  }

  if (!verifyTotpCode(cleanToken, secret)) {
    throw Object.assign(new Error('Token 2FA inválido.'), { isOperational: true, statusCode: 401, code: 'INVALID_2FA_TOKEN' });
  }

  await db.query('UPDATE usuarios SET is_2fa_enabled = TRUE WHERE id = $1', [userId]);
  return true;
};

// 2FA DISABLE (requires valid current 6-digit TOTP code)
exports.disable2FA = async (userId, token) => {
  const cleanToken = token !== undefined && token !== null ? String(token).replace(/\s+/g, '') : '';
  if (!cleanToken) {
    throw Object.assign(new Error('El código 2FA es obligatorio.'), { isOperational: true, statusCode: 400, code: 'VALIDATION_ERROR' });
  }
  const { rows } = await db.query('SELECT is_2fa_enabled, secret_2fa FROM usuarios WHERE id = $1', [userId]);
  if (!rows[0] || !Boolean(rows[0].is_2fa_enabled)) {
    throw Object.assign(new Error('2FA no está activado.'), { isOperational: true, statusCode: 400, code: '2FA_NOT_SETUP' });
  }
  const secret = decrypt2FASecret(rows[0].secret_2fa);
  if (!secret || !verifyTotpCode(cleanToken, secret)) {
    throw Object.assign(new Error('Token 2FA inválido.'), { isOperational: true, statusCode: 401, code: 'INVALID_2FA_TOKEN' });
  }

  await db.query('UPDATE usuarios SET is_2fa_enabled = FALSE, secret_2fa = NULL WHERE id = $1', [userId]);
  return true;
};
