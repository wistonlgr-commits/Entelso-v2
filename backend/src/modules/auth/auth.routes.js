const router = require('express').Router();
const ctrl   = require('./auth.controller');
const { requireAuth } = require('../../common/middleware/auth.middleware');

// POST /api/auth/login — pública
router.post('/login', ctrl.login);

// GET /api/auth/me - protegida
router.get('/me', requireAuth, ctrl.getMe);

// PUT /api/auth/me - protegida
router.put('/me', requireAuth, ctrl.updateMe);

// POST /api/auth/change-password — protegida
router.post('/change-password', requireAuth, ctrl.changePassword);

// POST /api/auth/setup-2fa — protegida
router.post('/setup-2fa', requireAuth, ctrl.setup2FA);

// POST /api/auth/verify-2fa — protegida
router.post('/verify-2fa', requireAuth, ctrl.verify2FA);

module.exports = router;
