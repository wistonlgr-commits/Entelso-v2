const router   = require('express').Router();
const ctrl     = require('./items.controller');
const { requireAuth } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createItemSchema, updateStockSchema } = require('./items.validation');

router.get('/',            requireAuth, ctrl.getAll);
router.get('/:id',         requireAuth, ctrl.getById);
router.post('/',           requireAuth, validate(createItemSchema), ctrl.create);
router.patch('/:id/stock', requireAuth, validate(updateStockSchema), ctrl.updateStock);
router.delete('/:id',      requireAuth, ctrl.remove);

module.exports = router;
