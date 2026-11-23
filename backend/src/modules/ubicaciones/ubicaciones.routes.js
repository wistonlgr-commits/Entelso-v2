const router   = require('express').Router();
const ctrl     = require('./ubicaciones.controller');
const { requireAuth, hasRole } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createLocationSchema } = require('./ubicaciones.validation');

router.get('/',            requireAuth, ctrl.getAll);
router.get('/:id',         requireAuth, ctrl.getById);
router.get('/:id/activos', requireAuth, ctrl.getAssets);
router.post('/',           requireAuth, hasRole('admin', 'almacen'), validate(createLocationSchema), ctrl.create);
router.put('/:id',         requireAuth, hasRole('admin', 'almacen'), ctrl.update);
router.delete('/:id',      requireAuth, hasRole('admin', 'almacen'), ctrl.delete);

module.exports = router;
