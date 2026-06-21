// متحكّم إعدادات الموقع (PostgreSQL + Supabase Storage)
const SettingsModel = require('../models/settings.model');
const crypto = require('crypto');
const path = require('path');
const { uploadImage, deleteImage } = require('../utils/supabase');

const SettingsController = {
  // عام: للزوار (اسم الموقع، رقم واتساب، الشعار...)
  async getPublic(req, res) {
    try {
      res.json({ success: true, data: await SettingsModel.getAll() });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  // إدارة: تحديث الإعدادات
  async update(req, res) {
    try {
      const data = await SettingsModel.setMany(req.body || {});
      res.json({ success: true, message: 'تم حفظ الإعدادات', data });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  // رفع الشعار
  async uploadLogo(req, res) {
    try {
      if (!req.file) return res.status(422).json({ success: false, message: 'لم يتم رفع شعار' });
      
      // حذف الشعار القديم إن وجد
      const oldUrl = await SettingsModel.get('logo_url');
      if (oldUrl) {
        await deleteImage(oldUrl);
      }
      
      // رفع الشعار الجديد إلى Supabase
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const filename = `logo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      const url = await uploadImage(filename, req.file.buffer, req.file.mimetype);

      await SettingsModel.set('logo_url', url);
      res.json({ success: true, message: 'تم رفع الشعار', data: { logo_url: url } });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  }
};

module.exports = SettingsController;
