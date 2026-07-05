const router   = require('express').Router();
const ctrl     = require('./activos.controller');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createAssetSchema, updateAssetSchema, bulkCreateAssetSchema } = require('./activos.validation');

router.get('/',                requireAuth, ctrl.getAll);
router.get('/serial/:serial',  requireAuth, ctrl.getBySerial);
router.delete('/bulk/all',     requireAuth, requireAdmin, ctrl.removeAll);
router.post('/bulk/delete',    requireAuth, requireAdmin, ctrl.bulkRemoveSelected);
router.patch('/bulk/category', requireAuth, requireAdmin, ctrl.bulkUpdateCategory);
router.patch('/bulk/status',   requireAuth, requireAdmin, ctrl.bulkUpdateStatus);
router.patch('/bulk/zona',     requireAuth, requireAdmin, ctrl.bulkUpdateZona);
router.patch('/bulk/team',     requireAuth, requireAdmin, ctrl.bulkUpdateTeam);
router.get('/:id',             requireAuth, ctrl.getById);
router.post('/',               requireAuth, requireAdmin, validate(createAssetSchema), ctrl.create);
router.post('/bulk',          requireAuth, requireAdmin, validate(bulkCreateAssetSchema), ctrl.bulkCreate);
router.patch('/:id',           requireAuth, requireAdmin, validate(updateAssetSchema), ctrl.update);
router.delete('/:id',          requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
