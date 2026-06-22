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
  async list({ search, brand, status, minPrice, maxPrice, sort, page = 1, limit = 12, includeExpired = false } = {}) {
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
      where.push(`brand = $${idx}`);
      params.push(brand);
      idx++;
    }
    if (status) {
      where.push(`status = $${idx}`);
      params.push(status);
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

    // جلب الصفوف المحددة بالصفحة
    const rowsQuery = `
      SELECT m.*, a.name AS admin_name, a.phone AS admin_phone
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
        (title, brand, price, currency, description, status, main_image, created_by, expires_at, ad_number)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '30 days', $9)
      RETURNING id
    `, [s.title, s.brand, s.price, s.currency, s.description, s.status, s.main_image, s.created_by, s.ad_number]);
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
        status=$6, ad_number=$7,
        updated_at=NOW()
      WHERE id=$8
    `, [merged.title, merged.brand, merged.price, merged.currency, merged.description, merged.status, merged.ad_number, id]);
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
    const totalRes = await db.query(`SELECT COUNT(*) AS c FROM motorcycles WHERE ${active}`);
    const availableRes = await db.query(`SELECT COUNT(*) AS c FROM motorcycles WHERE status='available' AND ${active}`);
    const reservedRes = await db.query(`SELECT COUNT(*) AS c FROM motorcycles WHERE status='reserved' AND ${active}`);
    const soldRes = await db.query(`SELECT COUNT(*) AS c FROM motorcycles WHERE status='sold' AND ${active}`);
    const viewsRes = await db.query(`SELECT COALESCE(SUM(views),0) AS s FROM motorcycles WHERE ${active}`);
    
    return {
      total: parseInt(totalRes.rows[0].c, 10),
      available: parseInt(availableRes.rows[0].c, 10),
      reserved: parseInt(reservedRes.rows[0].c, 10),
      sold: parseInt(soldRes.rows[0].c, 10),
      totalViews: parseInt(viewsRes.rows[0].s, 10)
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

  // ===== التنظيف التلقائي للعروض المنتهية =====
  async cleanupExpired() {
    // حذف نهائي فقط بعد 90 يوم من انتهاء الإعلان لمنح البائع فرصة التجديد
    const expiredRes = await db.query(
      "SELECT * FROM motorcycles WHERE expires_at < NOW() - INTERVAL '90 days'"
    );
    const expired = expiredRes.rows;

    if (!expired.length) return 0;

    const { deleteImage } = require('../utils/supabase');

    for (const moto of expired) {
      const images = await this.getImages(moto.id);
      for (const img of images) {
        if (img.image_url) {
          if (img.image_url.startsWith('/uploads/')) {
            const filePath = path.join(config.paths.public, img.image_url.replace(/^\//, ''));
            try { fs.unlinkSync(filePath); } catch (e) { /* تجاهل */ }
          } else {
            await deleteImage(img.image_url);
          }
        }
      }
      // CASCADE يحذف سجلات الصور تلقائياً
      await db.query('DELETE FROM motorcycles WHERE id = $1', [moto.id]);
    }

    return expired.length;
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
    ad_number: data.ad_number != null ? String(data.ad_number).trim() : null
  };
}

module.exports = MotorcycleModel;
