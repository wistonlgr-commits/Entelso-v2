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

exports.subirFoto = async (req, reply, next) => {
  try {
    const { telefono, pin, numero_inventario, base64_image, mimetype } = req.body;
    let finalBase64 = base64_image;
    let finalMime = mimetype;

    if (req.file) {
      finalBase64 = req.file.buffer.toString('base64');
      finalMime = req.file.mimetype;
    }

    if (!telefono || !numero_inventario || !finalBase64) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono, numero_inventario, o la foto.'));
    }
    const data = await svc.subirFoto(telefono, pin, numero_inventario, finalBase64, finalMime);
    reply.json(res.success(data, 'Foto subida y adjuntada correctamente desde WhatsApp.'));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};

exports.devolverEquipo = async (req, reply, next) => {
  try {
    const { telefono, pin, numero_inventario } = req.body;
    if (!telefono || !pin || !numero_inventario) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono, pin, numero_inventario.'));
    }
    const data = await svc.devolverEquipo(telefono, pin, numero_inventario);
    reply.json(res.success(data, data.mensaje));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};

exports.cambiarEstado = async (req, reply, next) => {
  try {
    const { telefono, pin, numero_inventario, nuevo_estado } = req.body;
    if (!telefono || !pin || !numero_inventario || !nuevo_estado) {
      return reply.status(200).json(res.error('Faltan parámetros: telefono, pin, numero_inventario, nuevo_estado.'));
    }
    const data = await svc.cambiarEstado(telefono, pin, numero_inventario, nuevo_estado);
    reply.json(res.success(data, data.mensaje));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};

exports.consultarKit = async (req, reply, next) => {
  try {
    const { numero_inventario } = req.body;
    if (!numero_inventario) {
      return reply.status(200).json(res.error('Falta parámetro: numero_inventario.'));
    }
    const data = await svc.consultarKit(numero_inventario);
    reply.json(res.success(data, 'Consulta exitosa.'));
  } catch (e) {
    if (e.isOperational) {
      return reply.status(200).json(res.error(e.message));
    }
    next(e);
  }
};
