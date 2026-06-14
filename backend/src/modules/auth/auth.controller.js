const svc = require('./auth.service');
const res = require('../../common/utils/apiResponse');

/**
 * POST /api/auth/login
 * Body: { email, pin }
 */
exports.login = async (req, reply) => {
  try {
    const { email, pin } = req.body ?? {};

    if (!email || !pin) {
      return reply
        .status(400)
        .json(res.error('Email y PIN son obligatorios.', 'VALIDATION_ERROR'));
    }

    const data = await svc.login(email, pin);
    return reply.json(res.success(data));
  } catch (err) {
    if (err.isOperational) {
      return reply
        .status(err.statusCode ?? 401)
        .json(res.error(err.message, 'AUTH_ERROR'));
    }
    throw err; // el error handler global lo maneja
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
    const userId = req.user.sub;
    const updated = await svc.updateMe(userId, req.body);
    reply.json(res.success(updated, 'Perfil actualizado correctamente.'));
  } catch (e) {
    next(e);
  }
};

exports.changePassword = async (req, reply, next) => {
  try {
    const userId = req.user.sub;
    const { oldPassword, newPassword } = req.body;
    await svc.changePassword(userId, oldPassword, newPassword);
    reply.json(res.success(null, 'Contraseña actualizada correctamente.'));
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
    const { token } = req.body;
    const success = await svc.verify2FA(userId, token);
    reply.json(res.success({ success }, '2FA verificado y activado.'));
  } catch (e) {
    next(e);
  }
};
