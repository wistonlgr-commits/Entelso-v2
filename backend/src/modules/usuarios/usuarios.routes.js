const router   = require('express').Router();
const ctrl     = require('./usuarios.controller');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createUserSchema, updateUserSchema } = require('./usuarios.validation');

router.get('/',             requireAuth, ctrl.getAll);
router.delete('/bulk/others', requireAuth, requireAdmin, ctrl.removeAllOthers);
router.get('/:id',          requireAuth, ctrl.getById);
router.get('/:id/activos',  requireAuth, ctrl.getAssets);
router.post('/',            requireAuth, requireAdmin, validate(createUserSchema), ctrl.create);
router.put('/:id',          requireAuth, requireAdmin, validate(updateUserSchema), ctrl.update);
router.delete('/:id',       requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
