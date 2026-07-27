// متحكّم الدراجات: عمليات القراءة العامة + عمليات الإدارة المحمية (PostgreSQL + Supabase Storage)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MotorcycleModel = require('../models/motorcycle.model');
const config = require('../config');
const { uploadImage, deleteImage } = require('../utils/supabase');
const { cache, KEYS, invalidate } = require('../utils/cache');

const MotorcycleController = {
  // ===== عام (Public) =====
  async list(req, res) {
    try {
      const result = await MotorcycleModel.list({
        search: req.query.search,
        city: req.query.city,
        region: req.query.region,
        brand: req.query.brand,
        status: req.query.status,
        minPrice: req.query.minPrice || req.query.min_price,
        maxPrice: req.query.maxPrice || req.query.max_price,
        price: req.query.price,
        sort: req.query.sort,
        page: req.query.page || 1,
        limit: req.query.limit || 24,
        includeExpired: req.query.includeExpired === 'true' || !!req.admin
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async detail(req, res) {
    try {
      const moto = await MotorcycleModel.findById(req.params.id);
      if (!moto) return res.status(404).json({ success: false, message: 'الدراجة غير موجودة' });
      
      // تسجيل مشاهدة حقيقية (Cookie + IP لمنع التكرار)
      if (!req.admin) {
        const cookieName = 'vid_' + req.params.id;
        if (!req.cookies[cookieName]) {
          const counted = await MotorcycleModel.trackView(req.params.id, req.ip);
          if (counted) {
            res.cookie(cookieName, '1', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', path: '/' });
          }
        }
      }
      res.json({ success: true, data: moto });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async featured(req, res) {
    try {
      const cached = cache.get(KEYS.FEATURED);
      if (cached) {
        return res.json({ success: true, data: cached });
      }
      
      const result = await MotorcycleModel.list({ status: 'available', sort: 'newest', limit: 6, page: 1 });
      cache.set(KEYS.FEATURED, result.data);
      res.json({ success: true, data: result.data });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async stats(req, res) {
    try {
      const cached = cache.get(KEYS.STATS);
      if (cached) {
        return res.json({ success: true, data: cached });
      }
      
      const data = await MotorcycleModel.stats();
      cache.set(KEYS.STATS, data);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async filters(req, res) {
    try {
      const cached = cache.get(KEYS.FILTERS);
      if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=1800');
        return res.json({ success: true, data: cached });
      }
      const data = await MotorcycleModel.distinctValues();
      cache.set(KEYS.FILTERS, data);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  // ===== إدارة (Admin) =====
  async create(req, res) {
    try {
      const moto = await MotorcycleModel.create({ ...req.body, created_by: req.admin.id });
      // ربط الصور المرفوعة إن وجدت
      await attachUploadedImages(req, moto.id);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      invalidate(KEYS.FILTERS);
      res.status(201).json({ success: true, message: 'تمت إضافة الدراجة', data: await MotorcycleModel.findById(moto.id) });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async update(req, res) {
    try {
      const moto = await MotorcycleModel.update(req.params.id, req.body);
      if (!moto) return res.status(404).json({ success: false, message: 'الدراجة غير موجودة' });
      await attachUploadedImages(req, moto.id);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      invalidate(KEYS.FILTERS);
      res.json({ success: true, message: 'تم تحديث الدراجة', data: await MotorcycleModel.findById(moto.id) });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async updateStatus(req, res) {
    try {
      const moto = await MotorcycleModel.updateStatus(req.params.id, req.body.status);
      if (!moto) return res.status(404).json({ success: false, message: 'الدراجة غير موجودة' });
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      invalidate(KEYS.FILTERS);
      res.json({ success: true, message: 'تم تغيير الحالة', data: moto });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async renew(req, res) {
    try {
      const moto = await MotorcycleModel.renew(req.params.id);
      if (!moto) return res.status(404).json({ success: false, message: 'الدراجة غير موجودة' });
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      res.json({ success: true, message: 'تم تجديد الإعلان لـ 30 يوماً إضافية', data: moto });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async remove(req, res) {
    try {
      // حذف ملفات الصور المرتبطة قبل حذف السجل
      const images = await MotorcycleModel.getImages(req.params.id);
      const ok = await MotorcycleModel.delete(req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: 'الدراجة غير موجودة' });
      
      for (const img of images) {
        await deleteStorageImage(img.image_url);
      }
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      invalidate(KEYS.FILTERS);
      res.json({ success: true, message: 'تم حذف الدراجة' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  // ===== إدارة الصور =====
  async uploadImages(req, res) {
    try {
      if (!req.files || !req.files.length) {
        return res.status(422).json({ success: false, message: 'لم يتم رفع أي صورة' });
      }
      const existingImages = await MotorcycleModel.getImages(req.params.id);
      const existing = existingImages.length;
      
      const uploadPromises = req.files.map(async (f, i) => {
        const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
        const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        const url = await uploadImage(filename, f.buffer, f.mimetype);
        return MotorcycleModel.addImage(req.params.id, url, existing + i);
      });
      
      const added = await Promise.all(uploadPromises);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      res.status(201).json({ success: true, message: 'تم رفع الصور', data: added });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  // إضافة صورة عبر رابط خارجي (URL)
  async addImageUrl(req, res) {
    try {
      const { image_url } = req.body || {};
      if (!image_url) return res.status(422).json({ success: false, message: 'رابط الصورة مطلوب' });
      const existingImages = await MotorcycleModel.getImages(req.params.id);
      const existing = existingImages.length;
      const img = await MotorcycleModel.addImage(req.params.id, image_url, existing);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      res.status(201).json({ success: true, data: img });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async deleteImage(req, res) {
    try {
      const img = await MotorcycleModel.deleteImage(req.params.imageId);
      if (!img) return res.status(404).json({ success: false, message: 'الصورة غير موجودة' });
      await deleteStorageImage(img.image_url);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      res.json({ success: true, message: 'تم حذف الصورة' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async setMainImage(req, res) {
    try {
      const { image_url } = req.body || {};
      if (!image_url) return res.status(422).json({ success: false, message: 'رابط الصورة مطلوب' });
      const moto = await MotorcycleModel.setMainImage(req.params.id, image_url);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      res.json({ success: true, message: 'تم تعيين الصورة الرئيسية', data: moto });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async reorderImages(req, res) {
    try {
      const { order } = req.body || {};
      if (!Array.isArray(order)) return res.status(422).json({ success: false, message: 'ترتيب غير صالح' });
      const imgs = await MotorcycleModel.reorderImages(req.params.id, order);
      invalidate(KEYS.STATS);
      invalidate(KEYS.FEATURED);
      res.json({ success: true, data: imgs });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  }
};

// ===== Helpers =====
async function attachUploadedImages(req, motorcycleId) {
  if (req.files && req.files.length) {
    const existingImages = await MotorcycleModel.getImages(motorcycleId);
    const existing = existingImages.length;
    const uploadPromises = req.files.map(async (f, i) => {
      const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const url = await uploadImage(filename, f.buffer, f.mimetype);
      return MotorcycleModel.addImage(motorcycleId, url, existing + i);
    });
    await Promise.all(uploadPromises);
  }
}

async function deleteStorageImage(imageUrl) {
  if (!imageUrl) return;
  if (imageUrl.startsWith('/uploads/')) {
    // إرث: حذف الصورة المحلية القديمة إن وجدت
    const filePath = path.join(config.paths.public, imageUrl.replace(/^\//, ''));
    fs.promises.unlink(filePath).catch(() => {});
  } else {
    // حذف الصورة من Supabase storage
    await deleteImage(imageUrl);
  }
}

module.exports = MotorcycleController;
