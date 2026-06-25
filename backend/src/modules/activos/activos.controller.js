const svc = require('./activos.service');
const res = require('../../common/utils/apiResponse');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll(req.query))); } catch (e) { next(e); }
};
exports.getById = async (req, reply, next) => {
  try {
    const item = await svc.getById(req.params.id);
    if (!item) return reply.status(404).json(res.error('Activo no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.getBySerial = async (req, reply, next) => {
  try {
    const item = await svc.getBySerial(req.params.serial);
    if (!item) return reply.status(404).json(res.error('Activo no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.create(req.body))); } catch (e) { next(e); }
};
exports.update = async (req, reply, next) => {
  try { reply.json(res.success(await svc.update(req.params.id, req.body))); } catch (e) { next(e); }
};
exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Activo eliminado.'));
  } catch (e) { next(e); }
};
exports.removeAll = async (req, reply, next) => {
  try {
    const result = await svc.removeAll();
    reply.json(res.success(result, 'All equipment deleted.'));
  } catch (e) { next(e); }
};

exports.bulkCreate = async (req, reply, next) => {
  try { 
    reply.status(201).json(res.success(await svc.bulkCreate(req.body.activos))); 
  } catch (e) { 
    next(e); 
  }
};
