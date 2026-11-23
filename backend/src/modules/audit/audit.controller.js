const auditService = require('./audit.service');
const res = require('../../common/utils/apiResponse');

const getLogs = async (req, reply) => {
  try {
    const logs = await auditService.getLogs(50);
    reply.json(res.success(logs));
  } catch (err) {
    reply.status(500).json(res.error('Error fetching audit logs'));
  }
};

const createLog = async (req, reply) => {
  try {
    const { accion, detalles, meta } = req.body;
    const log = await auditService.createLog(req.user.sub, accion, detalles, meta);
    reply.json(res.success(log));
  } catch (err) {
    reply.status(500).json(res.error('Error creating audit log'));
  }
};

module.exports = { getLogs, createLog };
