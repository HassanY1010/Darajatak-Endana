// متحكّم كاش ومعالجة الصور المتقدم — حماية Egress وتحسين الأداء
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');

const CACHE_DIR = path.join(config.paths.dataDir, 'cache', 'images');

// التأكد من وجود مجلد الكاش
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// نمط صارم لأسماء الملفات المسموح بها لمنع Path Traversal و SSRF
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_\-\.]+\.(jpg|jpeg|png|webp|gif)$/i;

// استخراج Host الخاص بـ Supabase من الإعدادات
let supabaseHost = '';
try {
  if (config.supabase && config.supabase.url) {
    supabaseHost = new URL(config.supabase.url).host.toLowerCase();
  }
} catch (e) {
  supabaseHost = '';
}

/**
 * جلب الصورة من Supabase Storage وحفظها محلياً
 */
function fetchFromSupabase(filename) {
  return new Promise((resolve, reject) => {
    if (!config.supabase.url || !config.supabase.bucket) {
      return reject(new Error('Supabase configuration is missing.'));
    }

    const fileUrl = `${config.supabase.url}/storage/v1/object/public/${config.supabase.bucket}/${encodeURIComponent(filename)}`;
    const client = fileUrl.startsWith('https') ? https : http;

    const req = client.get(fileUrl, (res) => {
      if (res.statusCode !== 200) {
        return resolve({ status: res.statusCode, buffer: null, contentType: null });
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        resolve({ status: 200, buffer, contentType });
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(8000, () => {
      req.destroy(new Error('Request timeout fetching image from Supabase'));
    });
  });
}

/**
 * توليد ETag موحد
 */
function generateETag(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

const ImageController = {
  /**
   * تقديم صورة مع كاش محلي وتحسين الحجم (Proxy + Thumbnailing)
   */
  async serveImage(req, res) {
    try {
      let { filename } = req.params;
      if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
      }

      // إزالة أي query parameters إن وجدت داخل الاسم
      filename = filename.split('?')[0];

      // فحص أمني صارم ضد Path Traversal
      if (!SAFE_FILENAME_REGEX.test(filename) || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // معالجة معيار الحجم المطلوب للعرض (Thumbnail width)
      let width = null;
      if (req.query.w) {
        const parsedW = parseInt(req.query.w, 10);
        if (!isNaN(parsedW) && parsedW >= 50 && parsedW <= 1920) {
          width = parsedW;
        }
      }

      const ext = path.extname(filename).toLowerCase();
      const baseName = path.basename(filename, ext);
      
      // اسم ملف الكاش المحلي
      const cacheFilename = width ? `${baseName}_w${width}${ext}` : filename;
      const cachePath = path.join(CACHE_DIR, cacheFilename);

      // 1. التحقق إن كان الملف موجوداً مسبقاً في كاش السيرفر
      if (fs.existsSync(cachePath)) {
        const stat = fs.statSync(cachePath);
        const etag = `"${stat.size}-${stat.mtimeMs}"`;

        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }

        res.set({
          'Content-Type': ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': etag,
          'X-Cache': 'HIT-SERVER'
        });
        return fs.createReadStream(cachePath).pipe(res);
      }

      // 2. إذا لم يكن في الكاش، نتحقق من الملف الأصلي
      const originalPath = path.join(CACHE_DIR, filename);
      let originalBuffer = null;
      let contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      if (fs.existsSync(originalPath)) {
        originalBuffer = fs.readFileSync(originalPath);
      } else {
        // التحقق إن كانت صورة مرفوعة محلياً مسبقاً في public/uploads
        const localUploadPath = path.join(config.upload.dir, filename);
        if (fs.existsSync(localUploadPath)) {
          originalBuffer = fs.readFileSync(localUploadPath);
          fs.writeFileSync(originalPath, originalBuffer);
        } else {
          // جلبها من Supabase Storage (مرة واحدة فقط)
          const result = await fetchFromSupabase(filename);
          if (result.status !== 200 || !result.buffer) {
            // إرجاع صورة احتياطية في حال تعذر الوصول للأصلية
            return res.status(result.status === 404 ? 404 : 502).json({ error: 'Image not available' });
          }
          originalBuffer = result.buffer;
          if (result.contentType) contentType = result.contentType;
          fs.writeFileSync(originalPath, originalBuffer);
        }
      }

      // 3. معالجة وتصغير الصورة إذا تم طلب عرض معين (Thumbnail)
      let finalBuffer = originalBuffer;
      if (width) {
        try {
          finalBuffer = await sharp(originalBuffer)
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true })
            .toBuffer();
          contentType = 'image/jpeg';
        } catch (sharpErr) {
          console.error(`⚠️ فشل تصغير الصورة ${filename}:`, sharpErr.message);
          finalBuffer = originalBuffer;
        }
      }

      // حفظ في الكاش المحلي
      try {
        fs.writeFileSync(cachePath, finalBuffer);
      } catch (e) {
        // تجاهل أخطاء كتابة الكاش والاستمرار بالخدمة
      }

      const etag = `"${generateETag(finalBuffer)}"`;

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': etag,
        'X-Cache': 'MISS-FETCHED'
      });

      return res.end(finalBuffer);

    } catch (err) {
      console.error('❌ خطأ في تقديم الصورة:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error processing image' });
      }
    }
  },

  /**
   * مسار بديل متوافق مع /api/img/proxy?url=... آمن 100% ضد SSRF
   */
  async serveProxy(req, res) {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    try {
      // التحقق الصارم من أن الرابط يتبع مشروع Supabase الخاص بنا فقط
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      // حماية صارمة ضد SSRF: رفض أي نطاق غير نطاق المشروع
      if (!supabaseHost || parsedUrl.host.toLowerCase() !== supabaseHost) {
        return res.status(403).json({ error: 'Unauthorized image source' });
      }

      // استخراج اسم الملف
      const filename = path.basename(parsedUrl.pathname);
      req.params = { filename };
      return ImageController.serveImage(req, res);
    } catch (err) {
      return res.status(500).json({ error: 'Error processing proxy request' });
    }
  }
};

module.exports = ImageController;
