const express = require('express');
const router = express.Router();
const mantenimientosController = require('./mantenimientos.controller');
const { requireAuth } = require('../../common/middleware/auth.middleware');

router.use(requireAuth);

router.get('/', mantenimientosController.getAll);
router.post('/', mantenimientosController.create);
router.put('/:id/atendido', mantenimientosController.markAsAttended);

module.exports = router;
