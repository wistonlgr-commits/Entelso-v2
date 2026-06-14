const svc = require('./ingest.service');
const res = require('../../common/utils/apiResponse');

exports.handleWhatsapp = async (req, reply, next) => {
  try {
    const data = await svc.processWhatsappReport(req.body);
    reply.status(201).json(res.success(data));
  } catch (err) { next(err); }
};
