const svc = require('./teams.service');
const res = require('../../common/utils/apiResponse');
const auditService = require('../audit/audit.service');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll())); } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try {
    if (!req.body.nombre) return reply.status(400).json(res.error('Team name is required.', 'VALIDATION_ERROR'));
    const created = await svc.create(req.body.nombre);
    reply.status(201).json(res.success(created));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.team_created',
      detalles: created?.nombre || req.body.nombre,
      meta: { module: 'config', severity: 'create', source: 'web', target: created?.nombre || req.body.nombre, targetId: created?.id ?? null },
    });
  } catch (e) { next(e); }
};
exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Team deleted.'));
    void auditService.logSafe({
      userId: req.user?.sub ?? null,
      accion: 'config.team_deleted',
      detalles: `Team #${req.params.id}`,
      meta: { module: 'config', severity: 'danger', source: 'web', targetId: Number(req.params.id) || null },
    });
  } catch (e) { next(e); }
};
