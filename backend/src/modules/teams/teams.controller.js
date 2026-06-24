const svc = require('./teams.service');
const res = require('../../common/utils/apiResponse');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll())); } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try {
    if (!req.body.nombre) return reply.status(400).json(res.error('Team name is required.'));
    reply.status(201).json(res.success(await svc.create(req.body.nombre)));
  } catch (e) { next(e); }
};
exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Team deleted.'));
  } catch (e) { next(e); }
};
