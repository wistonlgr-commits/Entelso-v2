const jwt = require('jsonwebtoken');
const env  = require('../../config/environment');
const res  = require('../utils/apiResponse');

/**
 * Valida cabecera X-API-Key o X-Ingest-Secret.
 * Usado por n8n para llamar a /api/ingest/whatsapp.
 */
const requireApiKey = (req, reply, next) => {
  const key = req.headers['x-api-key'] || req.headers['x-ingest-secret'];
  if (!key)           return reply.status(401).json(res.error('Clave de API no provista.',  'UNAUTHORIZED'));
  if (key !== env.API_KEY) return reply.status(403).json(res.error('Clave de API inválida.', 'FORBIDDEN'));
  next();
};

/**
 * Autenticación JWT para rutas del dashboard.
 * En desarrollo permite pasar sin token para facilitar pruebas locales.
 */
const requireAuth = (req, reply, next) => {
  const header = req.headers['authorization'];
  
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).json(res.error('Token de acceso no provisto.', 'UNAUTHORIZED'));
  }

  const token = header.slice(7); // quitar "Bearer "
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = payload; // { sub, nombre, email, rol }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return reply.status(401).json(res.error('La sesión expiró. Vuelve a iniciar sesión.', 'TOKEN_EXPIRED'));
    }
    return reply.status(401).json(res.error('Token inválido.', 'INVALID_TOKEN'));
  }
};

const requireAdmin = (req, reply, next) => {
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    return reply.status(403).json(res.error('Acceso denegado. Se requieren privilegios de administrador.', 'FORBIDDEN'));
  }
};

module.exports = { requireApiKey, requireAuth, requireAdmin };
