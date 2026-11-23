const svc = require('./whatsapp.service');
const res = require('../../common/utils/apiResponse');

const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

exports.consultar = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario } = req.body ?? {};
    if (!isNonEmptyStr(telefono) || !isNonEmptyStr(numero_inventario)) {
      return reply.status(400).json(res.error('Faltan parámetros válidos: telefono y numero_inventario.', 'VALIDATION_ERROR'));
    }
    const data = await svc.consultarEquipo(telefono, numero_inventario);
    reply.json(res.success(data));
  } catch (e) {
    next(e);
  }
};

exports.asignar = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario, zona } = req.body ?? {};
    if (!isNonEmptyStr(telefono) || !isNonEmptyStr(numero_inventario)) {
      return reply.status(400).json(res.error('Faltan parámetros válidos: telefono, numero_inventario.', 'VALIDATION_ERROR'));
    }
    if (zona !== undefined && zona !== null && typeof zona !== 'string') {
      return reply.status(400).json(res.error('Formato de zona inválido.', 'VALIDATION_ERROR'));
    }
    const data = await svc.asignarEquipo(telefono, numero_inventario, zona);
    reply.json(res.success(data, 'Equipo asignado correctamente.'));
  } catch (e) {
    next(e);
  }
};

exports.reportarMantenimiento = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario, descripcion, motivo } = req.body ?? {};
    const finalDesc = descripcion !== undefined ? descripcion : motivo;
    if (!isNonEmptyStr(telefono) || !isNonEmptyStr(numero_inventario) || !isNonEmptyStr(finalDesc)) {
      return reply.status(400).json(res.error('Faltan parámetros válidos: telefono, numero_inventario, descripcion.', 'VALIDATION_ERROR'));
    }
    const data = await svc.reportarMantenimiento(telefono, numero_inventario, finalDesc);
    reply.json(res.success(data, 'Falla reportada correctamente.'));
  } catch (e) {
    next(e);
  }
};

exports.subirFoto = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario, base64_image, mimetype } = req.body ?? {};
    let finalBase64 = base64_image;
    let finalMime = mimetype ?? null;

    if (req.file) {
      finalBase64 = req.file.buffer.toString('base64');
      finalMime = req.file.mimetype;
    }

    if (!isNonEmptyStr(telefono) || !isNonEmptyStr(numero_inventario) || !isNonEmptyStr(finalBase64)) {
      return reply.status(400).json(res.error('Faltan parámetros válidos: telefono, numero_inventario, o la foto.', 'VALIDATION_ERROR'));
    }
    if (finalMime !== null && finalMime !== undefined && typeof finalMime !== 'string') {
      return reply.status(400).json(res.error('Formato de mimetype inválido.', 'VALIDATION_ERROR'));
    }
    const data = await svc.subirFoto(telefono, numero_inventario, finalBase64, finalMime);
    reply.json(res.success(data, 'Foto subida y adjuntada correctamente desde WhatsApp.'));
  } catch (e) {
    next(e);
  }
};

exports.devolverEquipo = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario } = req.body ?? {};
    if (!isNonEmptyStr(telefono) || !isNonEmptyStr(numero_inventario)) {
      return reply.status(400).json(res.error('Faltan parámetros válidos: telefono, numero_inventario.', 'VALIDATION_ERROR'));
    }
    const data = await svc.devolverEquipo(telefono, numero_inventario);
    reply.json(res.success(data, data.mensaje));
  } catch (e) {
    next(e);
  }
};

exports.cambiarEstado = async (req, reply, next) => {
  try {
    const { telefono, numero_inventario, nuevo_estado, estado } = req.body ?? {};
    const finalEstado = nuevo_estado !== undefined ? nuevo_estado : estado;
    if (!isNonEmptyStr(telefono) || !isNonEmptyStr(numero_inventario) || !isNonEmptyStr(finalEstado)) {
      return reply.status(400).json(res.error('Faltan parámetros válidos: telefono, numero_inventario, nuevo_estado.', 'VALIDATION_ERROR'));
    }
    const data = await svc.cambiarEstado(telefono, numero_inventario, finalEstado);
    reply.json(res.success(data, data.mensaje));
  } catch (e) {
    next(e);
  }
};

exports.consultarKit = async (req, reply, next) => {
  try {
    const { numero_inventario } = req.body ?? {};
    if (!isNonEmptyStr(numero_inventario)) {
      return reply.status(400).json(res.error('Falta parámetro válido: numero_inventario.', 'VALIDATION_ERROR'));
    }
    const data = await svc.consultarKit(numero_inventario);
    reply.json(res.success(data, 'Consulta exitosa.'));
  } catch (e) {
    next(e);
  }
};
