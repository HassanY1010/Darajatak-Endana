// نموذج الدراجات — جميع استعلامات قاعدة البيانات الخاصة بالدراجات والصور (PostgreSQL)
const db = require('../database/db');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const EXPIRY_DAYS = 30;

const MotorcycleModel = {
  /**
   * جلب قائمة الدراجات مع فلترة/بحث/ترتيب/ترقيم صفحات
   */
  async list({ search, brand, city, region, status, minPrice, maxPrice, price, sort, page = 1, limit = 24, includeExpired = false } = {}) {
    const where = [];
    const params = [];
    let idx = 1;

    if (!includeExpired) {
      where.push('expires_at >= NOW()');
    }

    if (search) {
      where.push(`(title ILIKE $${idx} OR brand ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (brand) {
      where.push(`brand ILIKE $${idx}`);
      params.push(`%${brand}%`);
      idx++;
    }
    if (city) {
      where.push(`city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }
    if (region) {
      where.push(`region = $${idx}`);
      params.push(region);
      idx++;
    }
    if (status) {
      where.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (price != null && price !== '') {
      where.push(`price = $${idx}`);
      params.push(Number(price));
      idx++;
    }
    if (minPrice != null && minPrice !== '') {
      where.push(`price >= $${idx}`);
      params.push(Number(minPrice));
      idx++;
    }
    if (maxPrice != null && maxPrice !== '') {
      where.push(`price <= $${idx}`);
      params.push(Number(maxPrice));
      idx++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    let orderSql = 'ORDER BY created_at DESC';
    if (sort === 'price_asc') orderSql = 'ORDER BY price ASC';
    else if (sort === 'price_desc') orderSql = 'ORDER BY price DESC';
    else if (sort === 'views_desc') orderSql = 'ORDER BY views DESC';
    else if (sort === 'views_asc') orderSql = 'ORDER BY views ASC';
    else if (sort === 'newest') orderSql = 'ORDER BY created_at DESC';

    // جلب العدد الإجمالي
    const totalQuery = `SELECT COUNT(*) AS c FROM motorcycles ${whereSql}`;
    const totalRes = await db.query(totalQuery, params);
    const total = parseInt(totalRes.rows[0].c, 10);

    const offset = (Math.max(1, page) - 1) * limit;

    // جلب الصفوف المحددة بالصفحة (استثناء الحقول النصية الطويلة كالـ description لتقليل استهلاك البيانات)
    const rowsQuery = `
      SELECT m.id, m.title, m.brand, m.price, m.currency, m.status, m.main_image, m.views, m.ad_number, m.city, m.region, m.created_at, m.expires_at, a.name AS admin_name, a.phone AS admin_phone
      FROM motorcycles m
      LEFT JOIN admins a ON m.created_by = a.id
      ${whereSql}
      ${orderSql}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const rowsRes = await db.query(rowsQuery, [...params, Number(limit), offset]);
    const rows = rowsRes.rows;

    return {
      data: rows.map(normalize),
      total,
      page: Number(page),
      limit: Number(limit)
    };
  },

  /** جلب دراجة واحدة مع صورها */
  async findById(id, { withImages = true } = {}) {
    const res = await db.query(`
      SELECT m.*, a.name AS admin_name, a.phone AS admin_phone 
      FROM motorcycles m 
      LEFT JOIN admins a ON m.created_by = a.id 
      WHERE m.id = $1
    `, [id]);
    const moto = res.rows[0];
    if (!moto) return null;
    const result = normalize(moto);
    if (withImages) {
      result.images = await this.getImages(id);
    }
    return result;
  },

  async getImages(motorcycleId) {
    const res = await db.query(
      'SELECT * FROM images WHERE motorcycle_id = $1 ORDER BY order_index ASC, id ASC',
      [motorcycleId]
    );
    return res.rows;
  },

  async create(data) {
    const s = sanitize(data);
    const res = await db.query(`
      INSERT INTO motorcycles
        (title, brand, price, currency, description, status, main_image, created_by, expires_at, ad_number, city, region)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '30 days', $9, $10, $11)
      RETURNING id
    `, [s.title, s.brand, s.price, s.currency, s.description, s.status, s.main_image, s.created_by, s.ad_number, s.city, s.region]);
    return this.findById(res.rows[0].id);
  },

  async update(id, data) {
    const currentRes = await db.query('SELECT * FROM motorcycles WHERE id = $1', [id]);
    const current = currentRes.rows[0];
    if (!current) return null;
    const merged = { ...current, ...sanitize(data) };
    await db.query(`
      UPDATE motorcycles SET
        title=$1, brand=$2, price=$3, currency=$4, description=$5,
        status=$6, ad_number=$7, city=$8, region=$9,
        updated_at=NOW()
      WHERE id=$10
    `, [merged.title, merged.brand, merged.price, merged.currency, merged.description, merged.status, merged.ad_number, merged.city, merged.region, id]);
    return this.findById(id);
  },

  async updateStatus(id, status) {
    const res = await db.query(
      "UPDATE motorcycles SET status=$1, updated_at=NOW() WHERE id=$2",
      [status, id]
    );
    return res.rowCount > 0 ? this.findById(id) : null;
  },

  async renew(id) {
    const res = await db.query(
      "UPDATE motorcycles SET expires_at=NOW() + INTERVAL '30 days', updated_at=NOW() WHERE id=$1",
      [id]
    );
    return res.rowCount > 0 ? this.findById(id) : null;
  },

  async delete(id) {
    const res = await db.query('DELETE FROM motorcycles WHERE id = $1', [id]);
    return res.rowCount > 0;
  },

  async trackView(id, ip) {
    const recentRes = await db.query(`
      SELECT id FROM views_log 
      WHERE motorcycle_id = $1 AND ip_address = $2 
      AND created_at >= NOW() - INTERVAL '24 hours'
    `, [id, ip]);
    if (recentRes.rows[0]) return false;
    
    await db.query('INSERT INTO views_log (motorcycle_id, ip_address) VALUES ($1, $2)', [id, ip]);
    await db.query('UPDATE motorcycles SET views = views + 1 WHERE id = $1', [id]);

    // زيادة العداد التراكمي الدائم لإجمالي المشاهدات والزوار في قاعدة البيانات
    await db.query(`
      INSERT INTO settings (key, value) VALUES ('total_views', '1')
      ON CONFLICT (key) DO UPDATE SET value = (COALESCE(settings.value::BIGINT, 0) + 1)::TEXT
    `);

    return true;
  },

  async cleanupViewLogs() {
    const res = await db.query("DELETE FROM views_log WHERE created_at < NOW() - INTERVAL '30 days'");
    return res.rowCount;
  },

  // ===== إدارة الصور =====
  async addImage(motorcycleId, imageUrl, orderIndex = 0) {
    const res = await db.query(
      'INSERT INTO images (motorcycle_id, image_url, order_index) VALUES ($1, $2, $3) RETURNING id',
      [motorcycleId, imageUrl, orderIndex]
    );
    
    // إذا لم تكن هناك صورة رئيسية، اجعل هذه هي الرئيسية
    const motoRes = await db.query('SELECT main_image FROM motorcycles WHERE id = $1', [motorcycleId]);
    if (motoRes.rows[0] && !motoRes.rows[0].main_image) {
      await db.query('UPDATE motorcycles SET main_image = $1 WHERE id = $2', [imageUrl, motorcycleId]);
    }
    
    const imgRes = await db.query('SELECT * FROM images WHERE id = $1', [res.rows[0].id]);
    return imgRes.rows[0];
  },

  async deleteImage(imageId) {
    const res = await db.query('SELECT * FROM images WHERE id = $1', [imageId]);
    const img = res.rows[0];
    if (!img) return null;
    
    await db.query('DELETE FROM images WHERE id = $1', [imageId]);
    
    // إذا كانت الصورة المحذوفة هي الرئيسية، عيّن صورة أخرى أو null
    const motoRes = await db.query('SELECT main_image FROM motorcycles WHERE id = $1', [img.motorcycle_id]);
    if (motoRes.rows[0] && motoRes.rows[0].main_image === img.image_url) {
      const nextRes = await db.query(
        'SELECT image_url FROM images WHERE motorcycle_id = $1 ORDER BY order_index ASC LIMIT 1',
        [img.motorcycle_id]
      );
      const next = nextRes.rows[0];
      await db.query('UPDATE motorcycles SET main_image = $1 WHERE id = $2', [next ? next.image_url : null, img.motorcycle_id]);
    }
    return img;
  },

  async setMainImage(motorcycleId, imageUrl) {
    await db.query('UPDATE motorcycles SET main_image = $1 WHERE id = $2', [imageUrl, motorcycleId]);
    return this.findById(motorcycleId);
  },

  async reorderImages(motorcycleId, orderedIds = []) {
    await db.query('BEGIN');
    try {
      for (let idx = 0; idx < orderedIds.length; idx++) {
        const imgId = orderedIds[idx];
        await db.query(
          'UPDATE images SET order_index = $1 WHERE id = $2 AND motorcycle_id = $3',
          [idx, imgId, motorcycleId]
        );
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
    return this.getImages(motorcycleId);
  },

  // ===== الإحصائيات =====
  async stats() {
    const active = "expires_at >= NOW()";
    const res = await db.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'available' THEN 1 END) AS available,
        COUNT(CASE WHEN status = 'reserved' THEN 1 END) AS reserved,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) AS sold,
        COALESCE(SUM(views), 0) AS current_views
      FROM motorcycles 
      WHERE ${active}
    `);
    const row = res.rows[0] || {};
    
    // جلب العداد التراكمي المحفوظ دائمياً في قاعدة البيانات (حتى لو تم حذف إعلانات)
    const settingRes = await db.query("SELECT value FROM settings WHERE key = 'total_views'");
    const cumulativeSetting = settingRes.rows[0] ? parseInt(settingRes.rows[0].value || '0', 10) : 0;
    const currentSum = parseInt(row.current_views || '0', 10);

    const totalViews = Math.max(cumulativeSetting, currentSum);
    if (currentSum > cumulativeSetting) {
      await db.query(`
        INSERT INTO settings (key, value) VALUES ('total_views', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1
      `, [currentSum.toString()]);
    }

    return {
      total: parseInt(row.total || 0, 10),
      available: parseInt(row.available || 0, 10),
      reserved: parseInt(row.reserved || 0, 10),
      sold: parseInt(row.sold || 0, 10),
      totalViews
    };
  },

  async distinctValues() {
    const active = "expires_at >= NOW()";
    const brandsRes = await db.query(`SELECT DISTINCT brand FROM motorcycles WHERE ${active} AND brand IS NOT NULL ORDER BY brand`);
    
    return {
      cities: [],
      brands: brandsRes.rows.map(r => r.brand)
    };
  },

  async listForSitemap() {
    const res = await db.query(
      "SELECT id, created_at, updated_at FROM motorcycles WHERE expires_at >= NOW() ORDER BY created_at DESC"
    );
    return res.rows;
  },

  // ===== التنظيف التلقائي للعروض المنتهية بعد 30 يوماً =====
  async cleanupExpired() {
    // حذف نهائي كامل للدراجة وصورها بمجرد انتهاء مدة الـ 30 يوماً (expires_at <= NOW())
    const expiredRes = await db.query(
      "SELECT * FROM motorcycles WHERE expires_at <= NOW()"
    );
    const expired = expiredRes.rows;

    if (!expired.length) return 0;

    const { deleteImage } = require('../utils/supabase');
    let deletedCount = 0;

    for (const moto of expired) {
      try {
        const images = await this.getImages(moto.id);
        const allImageUrls = new Set(images.map(img => img.image_url).filter(Boolean));
        if (moto.main_image) {
          allImageUrls.add(moto.main_image);
        }

        // 1. حذف جميع ملفات الصور الفعلية من Supabase Storage / المجلد المحلي
        for (const imageUrl of allImageUrls) {
          if (imageUrl.startsWith('/uploads/')) {
            const filePath = path.join(config.paths.public, imageUrl.replace(/^\//, ''));
            try { 
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath); 
            } catch (e) {
              console.error(`❌ خطأ في حذف الملف المحلي: ${filePath}`, e.message);
            }
          } else {
            await deleteImage(imageUrl);
          }
        }

        // 2. حذف سجل الدراجة من قاعدة البيانات (CASCADE يحذف تلقائياً من images و views_log)
        await db.query('DELETE FROM motorcycles WHERE id = $1', [moto.id]);
        deletedCount++;
        console.log(`🧹 تم الحذف النهائي الكامل للدراجة المنتهية ID: ${moto.id} (${moto.title}) وجميع صورها.`);
      } catch (err) {
        console.error(`❌ خطأ أثناء معالجة وحذف الدراجة المنتهية ID: ${moto.id}:`, err.message);
      }
    }

    return deletedCount;
  }
};

// تحويل القيم المنطقية وتنظيف الناتج
function normalize(row) {
  return {
    ...row,
    expiresAt: row.expires_at,
    admin_name: row.admin_name || null,
    admin_phone: row.admin_phone || null
  };
}

// تنظيف وتحويل المدخلات قبل الإدخال
function sanitize(data) {
  return {
    title: String(data.title || '').trim(),
    brand: String(data.brand || '').trim(),
    price: data.price != null ? Number(data.price) : 0,
    currency: ['SAR', 'YER'].includes(data.currency) ? data.currency : 'SAR',
    description: data.description != null ? String(data.description).trim() : null,
    status: ['available', 'reserved', 'sold'].includes(data.status) ? data.status : 'available',
    main_image: data.main_image != null ? String(data.main_image) : null,
    created_by: data.created_by != null ? Number(data.created_by) : null,
    ad_number: data.ad_number != null ? String(data.ad_number).trim() : null,
    city: data.city != null ? String(data.city).trim() : null,
    region: data.region != null ? String(data.region).trim() : null
  };
}

module.exports = MotorcycleModel;
