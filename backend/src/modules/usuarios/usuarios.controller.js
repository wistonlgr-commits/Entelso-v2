const svc = require('./usuarios.service');
const res = require('../../common/utils/apiResponse');
const auditService = require('../audit/audit.service');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll())); } catch (e) { next(e); }
};
exports.getAssignables = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAssignables())); } catch (e) { next(e); }
};
exports.getById = async (req, reply, next) => {
  try {
    const u = await svc.getById(req.params.id);
    if (!u) return reply.status(404).json(res.error('Usuario no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(u));
  } catch (e) { next(e); }
};
exports.getAssets = async (req, reply, next) => {
  try {
    const u = await svc.getById(req.params.id);
    if (!u) return reply.status(404).json(res.error('Usuario no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(await svc.getAssets(req.params.id)));
  } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try {
    const created = await svc.create(req.body);
    reply.status(201).json(res.success(created));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'user.created',
      detalles: `${created?.nombre || req.body?.nombre || ''} (${created?.rol || req.body?.rol || ''})`.trim(),
      meta: {
        module: 'users',
        severity: 'create',
        source: 'web',
        target: created?.email || req.body?.email || created?.nombre || null,
        targetId: created?.id ?? null,
        role: created?.rol || req.body?.rol || null,
      },
    });
  } catch (e) { next(e); }
};
exports.update = async (req, reply, next) => {
  try {
    const u = await svc.update(req.params.id, req.body);
    if (!u) return reply.status(404).json(res.error('Usuario no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(u));
    const safeFields = Object.keys(req.body || {}).filter((k) => !/^(pin|pin_hash|password|secret_2fa)$/i.test(k));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'user.updated',
      detalles: `${u.nombre || ''} (${u.rol || ''})`.trim(),
      meta: {
        module: 'users',
        severity: 'update',
        source: 'web',
        target: u.email || u.nombre || null,
        targetId: u.id ?? Number(req.params.id) ?? null,
        fields: safeFields,
      },
    });
  } catch (e) { next(e); }
};
exports.remove = async (req, reply, next) => {
  try {
    let before = null;
    try { before = await svc.getById(req.params.id); } catch (_) {}
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'user.deleted',
      detalles: before?.nombre ? `${before.nombre}${before.email ? ` (${before.email})` : ''}` : `User #${req.params.id}`,
      meta: {
        module: 'users',
        severity: 'danger',
        source: 'web',
        target: before?.email || before?.nombre || `#${req.params.id}`,
        targetId: Number(req.params.id) || null,
      },
    });
  } catch (e) { next(e); }
};
exports.removeAllOthers = async (req, reply, next) => {
  try {
    await svc.removeAllOthers(req.user.sub);
    reply.json(res.success({ deleted: true, kept: req.user.sub }));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'user.bulk_deleted',
      detalles: 'Removed all other users',
      meta: { module: 'users', severity: 'danger', source: 'web' },
    });
  } catch (e) { next(e); }
};
