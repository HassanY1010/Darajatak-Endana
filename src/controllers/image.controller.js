// متحكّم كاش ومعالجة الصور المتقدم — حماية Egress وتحسين الأداء
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');

const CACHE_DIR = config.paths.cacheDir;

// التأكد من وجود مجلد الكاش
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (e) {
    console.error('⚠️ تعذر إنشاء مجلد الكاش عند البدء:', e.message);
  }
}

// Single-Flight In-Flight Promises Map لحماية Origin من الطلبات المتزامنة
const inFlightFetches = new Map();
const inFlightProcessing = new Map();

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
 * كتابة آمنة وذرية للملف في الكاش عبر ملف مؤقت ثم Rename
 */
function atomicWriteFileSync(targetPath, buffer) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = path.join(dir, `.tmp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`);
  try {
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, targetPath);
  } catch (e) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    throw e;
  }
}

/**
 * جلب الصورة من Supabase Storage وحفظها محلياً مع Single-Flight Lock
 */
function fetchFromSupabase(filename) {
  if (inFlightFetches.has(filename)) {
    return inFlightFetches.get(filename);
  }

  const promise = new Promise((resolve, reject) => {
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
  }).finally(() => {
    inFlightFetches.delete(filename);
  });

  inFlightFetches.set(filename, promise);
  return promise;
}

/**
 * توليد ETag موحد
 */
function generateETag(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * جلب وتأكيد توفر الملف الأصلي محلياً في الكاش (Single Origin Fetch)
 */
async function getOrFetchOriginal(filename, ext) {
  const originalPath = path.join(CACHE_DIR, filename);
  let contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  if (fs.existsSync(originalPath)) {
    return { buffer: fs.readFileSync(originalPath), contentType };
  }

  // فحص الصور المرفوعة محلياً مسبقاً (إرث)
  const localUploadPath = path.join(config.upload.dir, filename);
  if (fs.existsSync(localUploadPath)) {
    const originalBuffer = fs.readFileSync(localUploadPath);
    atomicWriteFileSync(originalPath, originalBuffer);
    return { buffer: originalBuffer, contentType };
  }

  // جلب من Supabase مع Single-Flight Lock
  const result = await fetchFromSupabase(filename);
  if (result.status !== 200 || !result.buffer) {
    const err = new Error(result.status === 404 ? 'Image not found' : 'Image not available');
    err.status = result.status === 404 ? 404 : 502;
    throw err;
  }

  if (result.contentType) contentType = result.contentType;
  atomicWriteFileSync(originalPath, result.buffer);
  return { buffer: result.buffer, contentType };
}

const ImageController = {
  /**
   * تقديم صورة مع كاش محلي وتحسين الحجم (Proxy + Thumbnailing + In-Flight Deduplication)
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
      
      // اسم ومسار ملف الكاش المحلي
      const cacheFilename = width ? `${baseName}_w${width}${ext}` : filename;
      const cachePath = path.join(CACHE_DIR, cacheFilename);

      // 1. التحقق إن كان الملف موجوداً مسبقاً في كاش السيرفر (Cache HIT)
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

      // 2. معالجة الطلب المتزامن عبر In-Flight Processing Lock لكل Variant
      const requestKey = `${filename}_w${width || 'orig'}`;
      let processingPromise = inFlightProcessing.get(requestKey);

      if (!processingPromise) {
        processingPromise = (async () => {
          // جلب الأصل مرة واحدة
          const original = await getOrFetchOriginal(filename, ext);
          let finalBuffer = original.buffer;
          let finalContentType = original.contentType;

          // تحويل وتصغير الصورة إذا طلب عرض معين
          if (width) {
            try {
              finalBuffer = await sharp(original.buffer)
                .resize({ width, withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();
              finalContentType = 'image/jpeg';
            } catch (sharpErr) {
              console.error(`⚠️ فشل تصغير الصورة ${filename}:`, sharpErr.message);
              finalBuffer = original.buffer;
            }
          }

          // كتابة ذرية في الكاش
          try {
            atomicWriteFileSync(cachePath, finalBuffer);
          } catch (e) {
            console.error('⚠️ خطأ في كتابة كاش الصورة:', e.message);
          }

          return { buffer: finalBuffer, contentType: finalContentType };
        })().finally(() => {
          inFlightProcessing.delete(requestKey);
        });

        inFlightProcessing.set(requestKey, processingPromise);
      }

      const result = await processingPromise;
      const etag = `"${generateETag(result.buffer)}"`;

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.set({
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': etag,
        'X-Cache': 'MISS-FETCHED'
      });

      return res.end(result.buffer);

    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
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
