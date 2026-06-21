const express = require('express');
const MotorcycleController = require('../controllers/motorcycle.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { validateMotorcycle, validateStatus } = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

// ===== مسارات عامة (Public — قراءة فقط) =====
router.get('/', MotorcycleController.list);
router.get('/featured', MotorcycleController.featured);
router.get('/stats', MotorcycleController.stats);
router.get('/filters', MotorcycleController.filters);
router.get('/:id', MotorcycleController.detail);

// ===== مسارات إدارية (Admin — محمية) =====
router.post(
  '/',
  requireAuth,
  upload.array('images', 10),
  validateMotorcycle,
  MotorcycleController.create
);

router.put(
  '/:id',
  requireAuth,
  upload.array('images', 10),
  validateMotorcycle,
  MotorcycleController.update
);

router.patch('/:id/status', requireAuth, validateStatus, MotorcycleController.updateStatus);
router.post('/:id/renew', requireAuth, MotorcycleController.renew);
router.delete('/:id', requireAuth, MotorcycleController.remove);

// إدارة الصور
router.post('/:id/images', requireAuth, upload.array('images', 10), MotorcycleController.uploadImages);
router.post('/:id/images/url', requireAuth, MotorcycleController.addImageUrl);
router.delete('/:id/images/:imageId', requireAuth, MotorcycleController.deleteImage);
router.patch('/:id/main-image', requireAuth, MotorcycleController.setMainImage);
router.patch('/:id/images/reorder', requireAuth, MotorcycleController.reorderImages);

module.exports = router;
