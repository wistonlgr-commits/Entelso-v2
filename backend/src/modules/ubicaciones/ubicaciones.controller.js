const svc = require('./ubicaciones.service');
const res = require('../../common/utils/apiResponse');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll())); } catch (e) { next(e); }
};
exports.getById = async (req, reply, next) => {
  try {
    const u = await svc.getById(req.params.id);
    if (!u) return reply.status(404).json(res.error('Ubicación no encontrada.', 'NOT_FOUND'));
    reply.json(res.success(u));
  } catch (e) { next(e); }
};
exports.getAssets = async (req, reply, next) => {
  try {
    const u = await svc.getById(req.params.id);
    if (!u) return reply.status(404).json(res.error('Ubicación no encontrada.', 'NOT_FOUND'));
    reply.json(res.success(await svc.getAssets(req.params.id)));
  } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.create(req.body))); } catch (e) { next(e); }
};
