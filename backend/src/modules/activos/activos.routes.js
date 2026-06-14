const router   = require('express').Router();
const ctrl     = require('./activos.controller');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createAssetSchema, updateAssetSchema } = require('./activos.validation');

router.get('/',                requireAuth, ctrl.getAll);
router.get('/serial/:serial',  requireAuth, ctrl.getBySerial);
router.get('/:id',             requireAuth, ctrl.getById);
router.post('/',               requireAuth, requireAdmin, validate(createAssetSchema), ctrl.create);
router.patch('/:id',           requireAuth, requireAdmin, validate(updateAssetSchema), ctrl.update);
router.delete('/:id',          requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
