const router = require('express').Router();
const ctrl = require('./teams.controller');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');

router.get('/', requireAuth, ctrl.getAll);
router.post('/', requireAuth, requireAdmin, ctrl.create);
router.delete('/:id', requireAuth, requireAdmin, ctrl.remove);

module.exports = router;
