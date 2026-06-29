const svc = require('./whatsapp.service');
const res = require('../../common/utils/apiResponse');

exports.consultar = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario } = req.body;
    if (!telefono || !numero_inventario) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono y numero_inventario.'));
    }
    const data = await svc.consultarEquipo(telefono, numero_inventario);
    reply.json(res.success(data));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};

exports.asignar = async (req, reply, next) => {
  try {
    const { telefono, pin, numero_inventario, zona } = req.body;
    if (!telefono || !pin || !numero_inventario) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono, pin, numero_inventario.'));
    }
    const data = await svc.asignarEquipo(telefono, pin, numero_inventario, zona);
    reply.json(res.success(data, 'Equipo asignado correctamente.'));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};

exports.reportarMantenimiento = async (req, reply, next) => {
  try {
    const { telefono, pin, numero_inventario, descripcion } = req.body;
    if (!telefono || !pin || !numero_inventario || !descripcion) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono, pin, numero_inventario, descripcion.'));
    }
    const data = await svc.reportarMantenimiento(telefono, pin, numero_inventario, descripcion);
    reply.json(res.success(data, 'Falla reportada correctamente.'));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};

exports.agregar = async (req, reply, next) => {
  try {
    const { telefono, pin, numero_inventario, descripcion, zona, team, estado } = req.body;
    if (!telefono || !pin || !numero_inventario || !descripcion) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono, pin, numero_inventario, descripcion.'));
    }
    const data = await svc.agregarEquipo(telefono, pin, numero_inventario, descripcion, zona, team, estado);
    reply.json(res.success(data, 'Equipo agregado correctamente.'));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};
