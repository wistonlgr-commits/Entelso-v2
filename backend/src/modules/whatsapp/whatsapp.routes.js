const router = require('express').Router();
const ctrl = require('./whatsapp.controller');
const multer = require('multer');

// Configuración de multer (memoria)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Todos estos endpoints son consumidos por n8n (WhatsApp).
// La autenticación se basa en { telefono, pin } dentro del body.

router.post('/consultar', ctrl.consultar);
router.post('/asignar', ctrl.asignar);
router.post('/mantenimiento', ctrl.reportarMantenimiento);

// Soporta tanto multipart/form-data (n8n subiendo archivo directo) como application/json (con base64)
router.post('/subir-foto', upload.single('foto'), ctrl.subirFoto);

module.exports = router;
