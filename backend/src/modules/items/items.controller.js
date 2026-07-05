const svc = require('./items.service');
const res = require('../../common/utils/apiResponse');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll(req.query.tipo))); } catch (e) { next(e); }
};
exports.getById = async (req, reply, next) => {
  try {
    const item = await svc.getById(req.params.id);
    if (!item) return reply.status(404).json(res.error('Item no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.create(req.body))); } catch (e) { next(e); }
};
exports.updateStock = async (req, reply, next) => {
  try { reply.json(res.success(await svc.updateStock(req.params.id, req.body.cantidad, req.body.operacion))); }
  catch (e) { next(e); }
};

exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Categoría eliminada.'));
  } catch (e) { next(e); }
};

