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
exports.update = async (req, reply, next) => {
  try {
    const updated = await svc.update(req.params.id, req.body);
    if (!updated) return reply.status(404).json(res.error('Item no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(updated));
  } catch (e) { next(e); }
};
exports.updateStock = async (req, reply, next) => {
  try { reply.json(res.success(await svc.updateStock(req.params.id, req.body.cantidad, req.body.operacion))); }
  catch (e) { next(e); }
};

exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Categoria eliminada.'));
  } catch (e) { next(e); }
};

exports.getCategorias = async (req, reply, next) => {
  try {
    reply.json(res.success(await svc.getCategorias()));
  } catch (e) { next(e); }
};

exports.createCategoria = async (req, reply, next) => {
  try {
    const created = await svc.createCategoria(req.body);
    reply.status(201).json(res.success(created, 'Categoría creada.'));
  } catch (e) { next(e); }
};

exports.renameCategoria = async (req, reply, next) => {
  try {
    const updated = await svc.renameCategoria(req.params.nombre, req.body);
    reply.json(res.success(updated, 'Categoría actualizada.'));
  } catch (e) { next(e); }
};

exports.deleteCategoria = async (req, reply, next) => {
  try {
    const result = await svc.deleteCategoria(req.params.nombre);
    reply.json(res.success(result, 'Categoría eliminada.'));
  } catch (e) { next(e); }
};
