const express = require('express');
const router = express.Router();
const mantenimientosController = require('./mantenimientos.controller');
const { requireAuth, hasRole } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createMantenimientoSchema } = require('./mantenimientos.validation');

router.use(requireAuth);

router.get('/', mantenimientosController.getAll);
router.post('/', hasRole('admin', 'almacen'), validate(createMantenimientoSchema), mantenimientosController.create);
router.put('/:id/atendido', hasRole('admin', 'almacen'), mantenimientosController.markAsAttended);

module.exports = router;
