const router   = require('express').Router();
const ctrl     = require('./ingest.controller');
const validate = require('../../common/middleware/validate.middleware');
const { requireApiKey } = require('../../common/middleware/auth.middleware');
const { ingestWhatsappSchema } = require('./ingest.validation');

// POST /api/ingest/whatsapp
// Protegido por X-Ingest-Secret (mismo valor que en el nodo de n8n)
router.post('/whatsapp', requireApiKey, validate(ingestWhatsappSchema), ctrl.handleWhatsapp);

module.exports = router;
