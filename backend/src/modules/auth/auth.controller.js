const svc = require('./auth.service');
const res = require('../../common/utils/apiResponse');
const auditService = require('../audit/audit.service');

/**
 * POST /api/auth/login
 * Body: { email, pin }
 */
exports.login = async (req, reply, next) => {
  try {
    const { email, pin, totpCode, code, token, otp } = req.body ?? {};
    const rawTotp = totpCode ?? code ?? token ?? otp ?? null;

    if (
      typeof email !== 'string' ||
      !email.trim() ||
      (typeof pin !== 'string' && typeof pin !== 'number') ||
      !String(pin).trim()
    ) {
      return reply
        .status(400)
        .json(res.error('Email y PIN válidos son obligatorios.', 'VALIDATION_ERROR'));
    }

    if (rawTotp !== null && rawTotp !== undefined && typeof rawTotp !== 'string' && typeof rawTotp !== 'number') {
      return reply
        .status(400)
        .json(res.error('Código 2FA inválido.', 'VALIDATION_ERROR'));
    }

    const data = await svc.login(email, pin, rawTotp);
    reply.json(res.success(data));
    void auditService.logSafe({
      userId: data.usuario?.id ?? null,
      accion: 'auth.login',
      detalles: `${data.usuario?.email || email.trim()}${data.usuario?.is_2fa_enabled ? ' (2FA)' : ''}`,
      meta: {
        module: 'security',
        severity: 'security',
        source: 'web',
        email: data.usuario?.email || email.trim(),
        twoFactor: Boolean(data.usuario?.is_2fa_enabled),
      },
    });
    return;
  } catch (err) {
    if (err.isOperational) {
      reply
        .status(err.statusCode ?? 401)
        .json(res.error(err.message, err.code || 'AUTH_ERROR', err.details || null));
      if (err.code && err.code !== '2FA_REQUIRED') {
        void auditService.logSafe({
          userId: null,
          accion: 'auth.login_failed',
          detalles: `${typeof email === 'string' ? email.trim() : 'unknown'} (${err.code})`,
          meta: {
            module: 'security',
            severity: 'warning',
            source: 'web',
            email: typeof email === 'string' ? email.trim() : null,
            reason: err.code,
          },
        });
      }
      return;
    }
    next(err); // el error handler global lo maneja
  }
};
exports.getMe = async (req, reply, next) => {
  try {
    const userId = req.user.sub;
    const user = await svc.getMe(userId);
    reply.json(res.success(user));
  } catch (e) {
    next(e);
  }
};

exports.updateMe = async (req, reply, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return reply.status(400).json(res.error('Cuerpo de solicitud inválido.', 'VALIDATION_ERROR'));
    }
    const { nombre, email, telefono_whatsapp } = req.body;
    if (
      (nombre !== undefined && typeof nombre !== 'string') ||
      (email !== undefined && typeof email !== 'string') ||
      (telefono_whatsapp !== undefined && telefono_whatsapp !== null && typeof telefono_whatsapp !== 'string')
    ) {
      return reply.status(400).json(res.error('Tipos de datos inválidos en el perfil.', 'VALIDATION_ERROR'));
    }
    const userId = req.user.sub;
    const updated = await svc.updateMe(userId, req.body);
    reply.json(res.success(updated, 'Perfil actualizado correctamente.'));
    const updatedFields = Object.keys(req.body || {}).filter((k) => ['nombre', 'email', 'telefono_whatsapp', 'preferencias'].includes(k));
    void auditService.logSafe({
      userId,
      accion: 'auth.profile_updated',
      detalles: updatedFields.join(', '),
      meta: { module: 'security', severity: 'update', source: 'web', fields: updatedFields },
    });
  } catch (e) {
    next(e);
  }
};

exports.changePassword = async (req, reply, next) => {
  try {
    const userId = req.user.sub;
    const { oldPassword, newPassword } = req.body ?? {};
    if (
      (oldPassword !== undefined && oldPassword !== null && typeof oldPassword !== 'string' && typeof oldPassword !== 'number') ||
      (typeof newPassword !== 'string' && typeof newPassword !== 'number') ||
      !String(newPassword).trim()
    ) {
      return reply.status(400).json(res.error('Contraseña inválida.', 'VALIDATION_ERROR'));
    }
    await svc.changePassword(userId, oldPassword, newPassword);
    reply.json(res.success(null, 'Contraseña actualizada correctamente.'));
    void auditService.logSafe({
      userId,
      accion: 'auth.password_changed',
      detalles: req.user?.email || '',
      meta: { module: 'security', severity: 'security', source: 'web' },
    });
  } catch (e) {
    next(e);
  }
};

exports.setup2FA = async (req, reply, next) => {
  try {
    const userId = req.user.sub;
    const data = await svc.setup2FA(userId, req.user.email);
    reply.json(res.success(data, '2FA configurado temporalmente. Por favor verifica.'));
  } catch (e) {
    next(e);
  }
};

exports.verify2FA = async (req, reply, next) => {
  try {
    const userId = req.user.sub;
    const token = req.body?.token ?? req.body?.totpCode ?? req.body?.code;
    if (token !== undefined && token !== null && typeof token !== 'string' && typeof token !== 'number') {
      return reply.status(400).json(res.error('Token 2FA inválido.', 'VALIDATION_ERROR'));
    }
    const success = await svc.verify2FA(userId, token);
    reply.json(res.success({ success }, '2FA verificado y activado.'));
    void auditService.logSafe({
      userId,
      accion: 'auth.2fa_enabled',
      detalles: req.user?.email || '',
      meta: { module: 'security', severity: 'security', source: 'web' },
    });
  } catch (e) {
    next(e);
  }
};

exports.disable2FA = async (req, reply, next) => {
  try {
    const userId = req.user.sub;
    const token = req.body?.token ?? req.body?.totpCode ?? req.body?.code;
    if (token !== undefined && token !== null && typeof token !== 'string' && typeof token !== 'number') {
      return reply.status(400).json(res.error('Token 2FA inválido.', 'VALIDATION_ERROR'));
    }
    const success = await svc.disable2FA(userId, token);
    reply.json(res.success({ success }, '2FA desactivado correctamente.'));
    void auditService.logSafe({
      userId,
      accion: 'auth.2fa_disabled',
      detalles: req.user?.email || '',
      meta: { module: 'security', severity: 'warning', source: 'web' },
    });
  } catch (e) {
    next(e);
  }
};
