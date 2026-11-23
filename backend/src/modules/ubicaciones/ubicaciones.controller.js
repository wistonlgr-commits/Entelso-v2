const svc = require('./ubicaciones.service');
const res = require('../../common/utils/apiResponse');
const auditService = require('../audit/audit.service');

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
  try {
    const created = await svc.create(req.body);
    reply.status(201).json(res.success(created));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.zone_created',
      detalles: created?.nombre_ubicacion || req.body?.nombre_ubicacion || '',
      meta: { module: 'config', severity: 'create', source: 'web', target: created?.nombre_ubicacion || null, targetId: created?.id ?? null },
    });
  } catch (e) { next(e); }
};


exports.update = async (req, reply, next) => {
  try {
    const updated = await svc.update(req.params.id, req.body);
    if (!updated) return reply.status(404).json(res.error('Ubicación no encontrada.', 'NOT_FOUND'));
    reply.json(res.success(updated));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.zone_updated',
      detalles: updated?.nombre_ubicacion || `#${req.params.id}`,
      meta: { module: 'config', severity: 'update', source: 'web', target: updated?.nombre_ubicacion || null, targetId: updated?.id ?? Number(req.params.id) ?? null },
    });
  } catch (e) { next(e); }
};

exports.delete = async (req, reply, next) => {
  try {
    let before = null;
    try { before = await svc.getById(req.params.id); } catch (_) {}
    const deleted = await svc.delete(req.params.id);
    if (!deleted) return reply.status(404).json(res.error('Ubicación no encontrada.', 'NOT_FOUND'));
    reply.json(res.success({ deleted: true }));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.zone_deleted',
      detalles: before?.nombre_ubicacion || `Zone #${req.params.id}`,
      meta: { module: 'config', severity: 'danger', source: 'web', target: before?.nombre_ubicacion || null, targetId: Number(req.params.id) || null },
    });
  } catch (e) {
    if (e.code === '23503') {
      return reply.status(400).json(res.error('No se puede eliminar la zona porque tiene equipos asignados.', 'FOREIGN_KEY_VIOLATION'));
    }
    next(e);
  }
};
