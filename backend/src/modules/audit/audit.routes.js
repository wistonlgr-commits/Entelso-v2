const { Router } = require('express');
const { requireAuth } = require('../../common/middleware/auth.middleware');
const auditController = require('./audit.controller');

const router = Router();

router.use(requireAuth);
router.get('/', auditController.getLogs);
router.post('/', auditController.createLog);

module.exports = router;
