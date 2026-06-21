// تجميع كل مسارات الـ API تحت /api
const express = require('express');
const authRoutes = require('./auth.routes');
const motorcycleRoutes = require('./motorcycle.routes');
const settingsRoutes = require('./settings.routes');
const router = express.Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: Date.now() }));

router.use('/auth', authRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
