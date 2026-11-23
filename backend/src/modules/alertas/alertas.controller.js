const svc = require('./alertas.service');
const res = require('../../common/utils/apiResponse');

const wrap = fn => async (req, reply, next) => {
  try { reply.json(res.success(await fn())); } catch (e) { next(e); }
};

exports.getAll         = wrap(svc.getAll);
exports.getCalibracion = wrap(svc.getCalibracion);
exports.getTag         = wrap(svc.getTag);
