const auditService = require('./audit.service');
const res = require('../../common/utils/apiResponse');

const getLogs = async (req, reply) => {
  try {
    const logs = await auditService.getLogs(50);
    reply.json(res.success(logs));
  } catch (err) {
    reply.status(500).json(res.error('Error al obtener logs de auditoría'));
  }
};

const createLog = async (req, reply) => {
  try {
    const { accion, detalles } = req.body;
    const log = await auditService.createLog(req.user.sub, accion, detalles);
    reply.json(res.success(log));
  } catch (err) {
    reply.status(500).json(res.error('Error al registrar auditoría'));
  }
};

module.exports = { getLogs, createLog };
