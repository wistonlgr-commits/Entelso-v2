const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const auditController = require('./audit.controller');

const router = Router();

router.use(requireAuth);
router.get('/', requireAdmin, auditController.getLogs);
router.post('/', auditController.createLog);

module.exports = router;
