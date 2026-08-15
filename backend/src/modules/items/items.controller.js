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
  try { reply.json(res.success(await svc.update(req.params.id, req.body))); } catch (e) { next(e); }
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
    const db = require('../../config/database');
    const { rows } = await db.query('SELECT DISTINCT categoria_padre FROM items WHERE categoria_padre IS NOT NULL');
    const categorias = rows.map(r => ({
      id: r.categoria_padre, // Use name as ID for frontend
      nombre: r.categoria_padre,
      tipo: 'herramienta' // Just default for UI
    }));
    reply.json(res.success(categorias));
  } catch (e) { next(e); }
};
