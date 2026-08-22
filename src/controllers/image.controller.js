// متحكّم كاش ومعالجة الصور المتقدم — حماية Egress وتحسين الأداء ومنع الـ Stampede
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
 * عدادات المراقبة والقياس (Observability Metrics)
 */
const Metrics = {
  cacheHit: 0,
  cacheMiss: 0,
  originFetch: 0,
  dedupWait: 0,
  cacheCorrupted: 0,
  originError: 0,
  http304: 0,
  getSummary() {
    return {
      cacheHit: this.cacheHit,
      cacheMiss: this.cacheMiss,
      originFetch: this.originFetch,
      dedupWait: this.dedupWait,
      cacheCorrupted: this.cacheCorrupted,
      originError: this.originError,
      http304: this.http304
    };
  },
  reset() {
    this.cacheHit = 0;
    this.cacheMiss = 0;
    this.originFetch = 0;
    this.dedupWait = 0;
    this.cacheCorrupted = 0;
    this.originError = 0;
    this.http304 = 0;
  }
};

/**
 * فحص سلامة الملف المخزن في الكاش (Corrupted Cache Protection)
 */
function isValidCachedFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    // الملف التالف أو الفارغ (0 bytes)
    if (!stat.isFile() || stat.size < 32) return false;
    return true;
  } catch (_) {
    return false;
  }
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
 * طلب واحد من Supabase مع Timeout
 */
function singleRequestSupabase(filename) {
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
 * جلب الصورة من Supabase Storage مع Retry محدود و Single-Flight Lock
 */
function fetchFromSupabase(filename) {
  if (inFlightFetches.has(filename)) {
    Metrics.dedupWait++;
    console.log(`[IMAGE_DEDUP_WAIT] Coalescing duplicate fetch for: ${filename}`);
    return inFlightFetches.get(filename);
  }

  Metrics.originFetch++;
  console.log(`[IMAGE_ORIGIN_FETCH] Fetching from Supabase origin: ${filename}`);

  const promise = (async () => {
    let attempts = 0;
    const maxAttempts = 2; // محاولة أساسية + إعادة محاولة واحدة للأخطاء المؤقتة

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await singleRequestSupabase(filename);
        if (res.status === 200 && res.buffer && res.buffer.length > 0) {
          return res;
        }
        if (res.status === 404 || res.status === 400) {
          return { status: 404, buffer: null, contentType: null }; // 404 لا يعاد محاولتها وتُرجع 404 مباشرة
        }
        if (attempts >= maxAttempts) {
          return res;
        }
      } catch (err) {
        if (attempts >= maxAttempts) {
          Metrics.originError++;
          console.error(`[IMAGE_ORIGIN_ERROR] Failed fetching ${filename} after ${attempts} attempts:`, err.message);
          throw err;
        }
        // انتظار 300ms قبل إعادة المحاولة
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return { status: 502, buffer: null, contentType: null };
  })().finally(() => {
    inFlightFetches.delete(filename);
  });

  inFlightFetches.set(filename, promise);
  return promise;
}

/**
 * توليد ETag موحد ومستقر يعتمد على المحتوى
 */
function generateETag(buffer) {
  return `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
}

/**
 * جلب وتأكيد توفر الملف الأصلي محلياً في الكاش مع حماية Corrupted Cache
 */
async function getOrFetchOriginal(filename, ext) {
  const originalPath = path.join(CACHE_DIR, filename);
  let contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  // 1. التحقق من سلامة الملف إذا كان موجوداً
  if (fs.existsSync(originalPath)) {
    if (isValidCachedFile(originalPath)) {
      try {
        const buffer = fs.readFileSync(originalPath);
        return { buffer, contentType };
      } catch (_) {}
    } else {
      Metrics.cacheCorrupted++;
      console.warn(`[IMAGE_CACHE_CORRUPTED] Detected corrupted cache file: ${originalPath}. Removing.`);
      try { fs.unlinkSync(originalPath); } catch (_) {}
    }
  }

  // 2. فحص الصور المرفوعة محلياً مسبقاً (إرث)
  const localUploadPath = path.join(config.upload.dir, filename);
  if (fs.existsSync(localUploadPath) && isValidCachedFile(localUploadPath)) {
    const originalBuffer = fs.readFileSync(localUploadPath);
    atomicWriteFileSync(originalPath, originalBuffer);
    return { buffer: originalBuffer, contentType };
  }

  // 3. جلب من Supabase مع Single-Flight Lock
  const result = await fetchFromSupabase(filename);
  if (result.status !== 200 || !result.buffer || result.buffer.length === 0) {
    const err = new Error(result.status === 404 ? 'Image not found' : 'Image not available');
    err.status = result.status === 404 ? 404 : 502;
    throw err;
  }

  if (result.contentType) contentType = result.contentType;
  atomicWriteFileSync(originalPath, result.buffer);
  return { buffer: result.buffer, contentType };
}

const ImageController = {
  Metrics,

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

      // 1. التحقق إن كان الملف موجوداً وسليماً في كاش السيرفر (Cache HIT)
      if (isValidCachedFile(cachePath)) {
        Metrics.cacheHit++;
        console.log(`[IMAGE_CACHE_HIT] Serving from local disk: ${cacheFilename}`);
        
        let buffer;
        try {
          buffer = fs.readFileSync(cachePath);
        } catch (readErr) {
          Metrics.cacheCorrupted++;
          try { fs.unlinkSync(cachePath); } catch (_) {}
          buffer = null;
        }

        if (buffer) {
          const etag = generateETag(buffer);

          if (req.headers['if-none-match'] === etag) {
            Metrics.http304++;
            console.log(`[IMAGE_304] Client cache matched ETag: ${etag}`);
            return res.status(304).end();
          }

          res.set({
            'Content-Type': ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': etag,
            'X-Cache': 'HIT-SERVER'
          });
          return res.end(buffer);
        }
      }

      // 2. معالجة Cache MISS عبر In-Flight Processing Lock
      Metrics.cacheMiss++;
      console.log(`[IMAGE_CACHE_MISS] Processing required for: ${cacheFilename}`);

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
      } else {
        Metrics.dedupWait++;
        console.log(`[IMAGE_DEDUP_WAIT] Coalescing processing for: ${requestKey}`);
      }

      const result = await processingPromise;
      const etag = generateETag(result.buffer);

      if (req.headers['if-none-match'] === etag) {
        Metrics.http304++;
        console.log(`[IMAGE_304] Freshly processed image matched ETag: ${etag}`);
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
      Metrics.originError++;
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

