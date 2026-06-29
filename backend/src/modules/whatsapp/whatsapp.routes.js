const router = require('express').Router();
const ctrl = require('./whatsapp.controller');

// Todos estos endpoints son consumidos por n8n (WhatsApp).
// La autenticación se basa en { telefono, pin } dentro del body.

router.post('/consultar', ctrl.consultar);
router.post('/agregar', ctrl.agregar);
router.post('/asignar', ctrl.asignar);
router.post('/mantenimiento', ctrl.reportarMantenimiento);

module.exports = router;
