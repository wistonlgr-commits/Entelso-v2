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


exports.update = async (req, reply, next) => {
  try {
    const updated = await svc.update(req.params.id, req.body);
    if (!updated) return reply.status(404).json(res.error('Ubicación no encontrada.', 'NOT_FOUND'));
    reply.json(res.success(updated));
  } catch (e) { next(e); }
};

exports.delete = async (req, reply, next) => {
  try {
    const deleted = await svc.delete(req.params.id);
    if (!deleted) return reply.status(404).json(res.error('Ubicación no encontrada.', 'NOT_FOUND'));
    reply.json(res.success({ deleted: true }));
  } catch (e) {
    if (e.code === '23503') {
      return reply.status(400).json(res.error('No se puede eliminar la zona porque tiene equipos asignados.', 'FOREIGN_KEY_VIOLATION'));
    }
    next(e);
  }
};
