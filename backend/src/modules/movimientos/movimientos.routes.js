const router   = require('express').Router();
const ctrl     = require('./movimientos.controller');
const { requireAuth } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createMovementSchema } = require('./movimientos.validation');

router.get('/',  requireAuth, ctrl.getAll);
router.post('/', requireAuth, validate(createMovementSchema), ctrl.create);

module.exports = router;
