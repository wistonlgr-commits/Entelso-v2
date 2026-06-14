const db     = require('../../config/database');
const bcrypt = require('bcrypt');

/**
 * Devuelve todos los usuarios (sin pin_hash ni datos sensibles).
 */
exports.getAll = async () => {
  const { rows } = await db.query(
    `SELECT id, nombre, telefono_whatsapp, email, rol, team, activo, en_terreno, fecha_registro
     FROM usuarios
     WHERE activo = TRUE
     ORDER BY nombre ASC`
  );
  return rows;
};

exports.getById = async (id) => {
  const { rows } = await db.query(
    `SELECT id, nombre, telefono_whatsapp, email, rol, team, activo, en_terreno, fecha_registro
     FROM usuarios WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

exports.getAssets = async (id) => {
  const { rows } = await db.query(
    `SELECT a.id, a.numero_serie, a.estado, a.fecha_prox_cali, a.fecha_prox_tag,
            i.nombre AS nombre_item
     FROM activos a JOIN items i ON a.item_id = i.id
     WHERE a.usuario_actual_id = $1 ORDER BY i.nombre ASC`,
    [id]
  );
  return rows;
};

/**
 * Crea un usuario nuevo.
 * Acepta 'pin' o 'password' como campo de contraseña (ambos se hashean).
 */
exports.create = async ({ nombre, telefono_whatsapp, email, rol, team, pin, password }) => {
  // Acepta 'pin' o 'password' (compatibilidad con el frontend dashboard)
  const rawPin = pin || password || null;
  const pin_hash = rawPin ? await bcrypt.hash(String(rawPin), 10) : null;

  const { rows } = await db.query(
    `INSERT INTO usuarios (nombre, telefono_whatsapp, email, rol, team, pin_hash, en_terreno)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, nombre, telefono_whatsapp, email, rol, team, activo, en_terreno, fecha_registro`,
    [nombre, telefono_whatsapp || null, email || null, rol || 'trabajador', team || null, pin_hash, false]
  );
  return rows[0];
};

exports.update = async (id, data) => {
  const fields = [];
  const values = [];
  let idx = 1;

  // Handle regular fields
  for (const [k, v] of Object.entries(data)) {
    if (['nombre','telefono_whatsapp','email','rol','team','activo', 'en_terreno'].includes(k)) {
      fields.push(`${k} = $${idx}`);
      values.push(v === '' ? null : v);
      idx++;
    }
  }

  // Handle PIN update
  const rawPin = data.pin || data.password;
  if (rawPin) {
    const newHash = await bcrypt.hash(String(rawPin), 10);
    fields.push(`pin_hash = $${idx}`);
    values.push(newHash);
    idx++;
  }

  if (fields.length === 0) return exports.getById(id);
  values.push(id);
  const query = `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, nombre, email, rol, team, activo`;
  const { rows } = await db.query(query, values);
  return rows[0];
};

exports.remove = async (id) => {
  // Soft delete: deactivate instead of destroying to preserve audit trail
  const { rows } = await db.query(
    `UPDATE usuarios SET activo = FALSE WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!rows[0]) throw Object.assign(new Error('Usuario no encontrado.'), { isOperational: true, statusCode: 404 });
  return true;
};


