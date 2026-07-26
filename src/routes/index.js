// تجميع كل مسارات الـ API تحت /api
const express = require('express');
const authRoutes = require('./auth.routes');
const motorcycleRoutes = require('./motorcycle.routes');
const settingsRoutes = require('./settings.routes');
const router = express.Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: Date.now() }));

// توجيه مباشر إلى رابط الصورة الأصلي بدون التمرير عبر Node.js كـ Proxy
router.get('/img/proxy', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: 'url parameter is required' });
  return res.redirect(301, imageUrl);
});

router.use('/auth', authRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
