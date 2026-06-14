const router   = require('express').Router();
const ctrl     = require('./ubicaciones.controller');
const { requireAuth } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createLocationSchema } = require('./ubicaciones.validation');

router.get('/',            requireAuth, ctrl.getAll);
router.get('/:id',         requireAuth, ctrl.getById);
router.get('/:id/activos', requireAuth, ctrl.getAssets);
router.post('/',           requireAuth, validate(createLocationSchema), ctrl.create);

module.exports = router;
