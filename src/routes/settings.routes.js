const express = require('express');
const SettingsController = require('../controllers/settings.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

router.get('/', SettingsController.getPublic);
router.put('/', requireAuth, SettingsController.update);
router.post('/logo', requireAuth, upload.single('logo'), SettingsController.uploadLogo);

module.exports = router;
