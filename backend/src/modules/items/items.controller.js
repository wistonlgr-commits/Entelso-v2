const svc = require('./items.service');
const res = require('../../common/utils/apiResponse');
const auditService = require('../audit/audit.service');

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
  try {
    const updated = await svc.updateStock(req.params.id, req.body.cantidad, req.body.operacion);
    reply.json(res.success(updated));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'equipment.stock_updated',
      detalles: `${updated?.nombre || `Item #${req.params.id}`} · ${req.body.operacion} ${req.body.cantidad}`,
      meta: { module: 'equipment', severity: 'update', source: 'web', targetId: Number(req.params.id) || null, count: req.body.cantidad },
    });
  }
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
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.category_created',
      detalles: created?.nombre || req.body?.nombre || '',
      meta: { module: 'config', severity: 'create', source: 'web', target: created?.nombre || req.body?.nombre || null },
    });
  } catch (e) { next(e); }
};

exports.renameCategoria = async (req, reply, next) => {
  try {
    const updated = await svc.renameCategoria(req.params.nombre, req.body);
    reply.json(res.success(updated, 'Categoría actualizada.'));
    const nextName = updated?.nombre || req.body?.nuevo_nombre || req.body?.nombre || req.params.nombre;
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.category_updated',
      detalles: `${req.params.nombre} → ${nextName}`,
      meta: {
        module: 'config',
        severity: 'update',
        source: 'web',
        target: nextName,
        changes: [{ field: 'categoria', from: req.params.nombre, to: nextName }],
      },
    });
  } catch (e) { next(e); }
};

exports.deleteCategoria = async (req, reply, next) => {
  try {
    const result = await svc.deleteCategoria(req.params.nombre);
    reply.json(res.success(result, 'Categoría eliminada.'));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.category_deleted',
      detalles: req.params.nombre,
      meta: { module: 'config', severity: 'danger', source: 'web', target: req.params.nombre },
    });
  } catch (e) { next(e); }
};
