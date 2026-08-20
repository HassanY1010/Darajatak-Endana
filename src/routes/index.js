// تجميع كل مسارات الـ API تحت /api
const express = require('express');
const authRoutes = require('./auth.routes');
const motorcycleRoutes = require('./motorcycle.routes');
const settingsRoutes = require('./settings.routes');
const router = express.Router();

const ImageController = require('../controllers/image.controller');

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: Date.now() }));

// مسار تقديم الصور الآمن مع الكاش والتحسين وتوليد الصور المصغرة
router.get('/images/:filename', ImageController.serveImage);
router.get('/img/proxy', ImageController.serveProxy);

router.use('/auth', authRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
