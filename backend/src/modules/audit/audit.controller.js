const auditService = require('./audit.service');
const res = require('../../common/utils/apiResponse');

const getLogs = async (req, reply) => {
  try {
    const { limit, offset, module: mod, usuario_id, q, from, to } = req.query || {};
    const result = await auditService.getLogs({
      limit,
      offset,
      module: mod,
      usuario_id,
      q,
      from,
      to,
    });
    // Support both new { rows, pagination } and stubbed array return (e.g. unit security tests)
    if (Array.isArray(result)) {
      return reply.json(res.success(result));
    }
    return reply.json(res.success(result.rows, result.pagination));
  } catch (err) {
    reply.status(500).json(res.error('Error fetching audit logs'));
  }
};

const createLog = async (req, reply) => {
  try {
    const { accion, detalles, meta } = req.body || {};
    if (!accion || typeof accion !== 'string' || !accion.trim()) {
      return reply.status(400).json(res.error('Audit action is required.', 'VALIDATION_ERROR'));
    }
    const log = await auditService.createLog(req.user.sub, accion, detalles, meta);
    reply.json(res.success(log));
  } catch (err) {
    reply.status(500).json(res.error('Error creating audit log'));
  }
};

module.exports = { getLogs, createLog };
