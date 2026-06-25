const router   = require('express').Router();
const ctrl     = require('./activos.controller');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createAssetSchema, updateAssetSchema, bulkCreateAssetSchema } = require('./activos.validation');

router.get('/',                requireAuth, ctrl.getAll);
router.get('/serial/:serial',  requireAuth, ctrl.getBySerial);
router.delete('/bulk/all',     requireAuth, requireAdmin, ctrl.removeAll);
router.get('/:id',             requireAuth, ctrl.getById);
router.post('/',               requireAuth, requireAdmin, validate(createAssetSchema), ctrl.create);
router.post('/bulk',          requireAuth, requireAdmin, validate(bulkCreateAssetSchema), ctrl.bulkCreate);
router.patch('/:id',           requireAuth, requireAdmin, validate(updateAssetSchema), ctrl.update);
router.delete('/:id',          requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
