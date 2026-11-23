const router = require('express').Router();
const ctrl = require('./whatsapp.controller');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const env = require('../../config/environment');
const res = require('../../common/utils/apiResponse');

const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: res.error('Demasiadas peticiones de WhatsApp. Intenta más tarde.', 'RATE_LIMIT_EXCEEDED'),
});

router.use(whatsappLimiter);

const ALLOWED_IMAGE_MIMETYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

// Configuración de multer (memoria)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const normMime = file.mimetype ? file.mimetype.trim().toLowerCase().split(';')[0].trim() : '';
    if (ALLOWED_IMAGE_MIMETYPES.has(normMime)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes (JPEG, PNG, WebP, GIF).'), {
        isOperational: true,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      }));
    }
  },
});

// Todos estos endpoints son consumidos por n8n (WhatsApp).
// La autenticación se basa en el teléfono registrado ({ telefono }) dentro del body.

router.post('/consultar', ctrl.consultar);
router.post('/asignar', ctrl.asignar);
router.post('/mantenimiento', ctrl.reportarMantenimiento);

// Soporta tanto multipart/form-data (n8n subiendo archivo directo) como application/json (con base64)
router.post('/subir-foto', upload.single('foto'), ctrl.subirFoto);

router.post('/devolver', ctrl.devolverEquipo);
router.post('/cambiar-estado', ctrl.cambiarEstado);
router.post('/consultar-kit', ctrl.consultarKit);

module.exports = router;
