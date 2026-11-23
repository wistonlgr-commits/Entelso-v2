const router = require('express').Router();
const ctrl   = require('./alertas.controller');
const { requireAuth } = require('../../common/middleware/auth.middleware');

router.get('/',            requireAuth, ctrl.getAll);
router.get('/calibracion', requireAuth, ctrl.getCalibracion);
router.get('/tag',         requireAuth, ctrl.getTag);

module.exports = router;
