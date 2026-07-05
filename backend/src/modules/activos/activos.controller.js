const svc = require('./activos.service');
const res = require('../../common/utils/apiResponse');

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll(req.query))); } catch (e) { next(e); }
};
exports.getById = async (req, reply, next) => {
  try {
    const item = await svc.getById(req.params.id);
    if (!item) return reply.status(404).json(res.error('Activo no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.getBySerial = async (req, reply, next) => {
  try {
    const item = await svc.getBySerial(req.params.serial);
    if (!item) return reply.status(404).json(res.error('Activo no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.create(req.body))); } catch (e) { next(e); }
};
exports.update = async (req, reply, next) => {
  try { reply.json(res.success(await svc.update(req.params.id, req.body))); } catch (e) { next(e); }
};
exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Activo eliminado.'));
  } catch (e) { next(e); }
};
exports.removeAll = async (req, reply, next) => {
  try {
    const result = await svc.removeAll();
    reply.json(res.success({ deleted: result }, 'Todos los activos eliminados.'));
  } catch (e) { next(e); }
};
exports.bulkCreate = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.bulkCreate(req.body.activos))); } catch (e) { next(e); }
};
exports.bulkRemoveSelected = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids)) {
      return reply.status(400).json(res.error('Se requiere un array de IDs.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkRemoveSelected(req.body.ids);
    reply.json(res.success({ deleted: result }, 'Activos seleccionados eliminados.'));
  } catch (e) { next(e); }
};
exports.bulkUpdateCategory = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids) || !req.body.item_id) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateCategory(req.body.ids, req.body.item_id);
    reply.json(res.success({ updated: result }, 'Categoría actualizada para los equipos.'));
  } catch (e) { next(e); }
};

exports.bulkUpdateStatus = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids) || !req.body.status) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateStatus(req.body.ids, req.body.status);
    reply.json(res.success({ updated: result }, 'Estado actualizado.'));
  } catch (e) { next(e); }
};

exports.bulkUpdateZona = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids)) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateZona(req.body.ids, req.body.zona_id);
    reply.json(res.success({ updated: result }, 'Zona actualizada.'));
  } catch (e) { next(e); }
};

exports.bulkUpdateTeam = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids)) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateTeam(req.body.ids, req.body.team_id);
    reply.json(res.success({ updated: result }, 'Equipo actualizado.'));
  } catch (e) { next(e); }
};
