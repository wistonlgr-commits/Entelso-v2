const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl   = require('./auth.controller');
const env    = require('../../config/environment');
const res    = require('../../common/utils/apiResponse');
const { requireAuth } = require('../../common/middleware/auth.middleware');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 100 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: res.error('Demasiados intentos de inicio de sesión. Intenta más tarde.', 'RATE_LIMIT_EXCEEDED'),
});

// POST /api/auth/login — pública
router.post('/login', loginLimiter, ctrl.login);

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

// POST /api/auth/disable-2fa — protegida
router.post('/disable-2fa', requireAuth, ctrl.disable2FA);

module.exports = router;
