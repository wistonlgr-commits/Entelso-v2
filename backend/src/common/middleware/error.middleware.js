const logger = require('../utils/logger');
const res    = require('../utils/apiResponse');

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, reply, next) => {
  logger.error(`${req.method} ${req.originalUrl}`, err);

  // Zod — errores de validación del request
  if (err.name === 'ZodError') {
    return reply.status(400).json(
      res.error('Datos inválidos en la solicitud.', 'VALIDATION_ERROR',
        err.errors.map(e => ({ campo: e.path.join('.'), mensaje: e.message }))
      )
    );
  }

  // PostgreSQL — clave duplicada (unique constraint)
  if (err.code === '23505') {
    return reply.status(409).json(res.error('Ya existe un registro con ese identificador único.', 'DUPLICATE_KEY', err.detail));
  }

  // PostgreSQL — llave foránea inexistente
  if (err.code === '23503') {
    return reply.status(400).json(res.error('El ID referenciado no existe.', 'FOREIGN_KEY_ERROR', err.detail));
  }

  // PostgreSQL — check constraint violado
  if (err.code === '23514') {
    return reply.status(400).json(res.error('La operación viola una restricción de integridad.', 'CONSTRAINT_ERROR', err.detail));
  }

  // Error de negocio lanzado manualmente (new Error('mensaje'))
  if (err.isOperational) {
    return reply.status(err.statusCode || 400).json(res.error(err.message, 'BUSINESS_ERROR'));
  }

  // Error genérico — no exponer detalles internos en producción
  const isProd = process.env.NODE_ENV === 'production';
  reply.status(500).json(
    res.error(
      isProd ? 'Error interno del servidor.' : err.message,
      'INTERNAL_SERVER_ERROR',
      isProd ? null : err.stack
    )
  );
};

module.exports = errorMiddleware;
