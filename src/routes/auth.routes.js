const express = require('express');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// تحديد محاولات تسجيل الدخول لمنع هجمات brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة جداً، حاول لاحقاً' }
});

router.post('/login', loginLimiter, AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', requireAuth, AuthController.me);
router.post('/change-password', requireAuth, AuthController.changePassword);

module.exports = router;
