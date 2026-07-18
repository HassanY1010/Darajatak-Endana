// تجميع كل مسارات الـ API تحت /api
const express = require('express');
const https = require('https');
const http = require('http');
const NodeCache = require('node-cache');
const authRoutes = require('./auth.routes');
const motorcycleRoutes = require('./motorcycle.routes');
const settingsRoutes = require('./settings.routes');
const router = express.Router();

// كاش الصور في RAM — مدة 24 ساعة (86400 ثانية)
const imageCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600, useClones: false });

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: Date.now() }));

/**
 * Image Proxy مع كاش RAM —
 * أول طلب: يجلب الصورة من Supabase ويحفظها في الذاكرة
 * كل الطلبات بعده: يسلمها مباشرة من الذاكرة ⚡ (بدون أي اتصال خارجي)
 * الاستخدام: /api/img/proxy?url=<encoded_url>
 */
function fetchAndCacheImage(imageUrl, cacheKey, res, redirectCount) {
  if (redirectCount > 5) {
    if (!res.headersSent) res.status(502).json({ error: 'Too many redirects' });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (e) {
    if (!res.headersSent) res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Encoding': 'identity', // نمنع gzip حتى نتمكن من تخزين Buffer صحيح
      'Connection': 'keep-alive'
    },
    timeout: 15000
  };

  const client = parsedUrl.protocol === 'https:' ? https : http;
  const request = client.request(options, (imgRes) => {
    // معالجة إعادة التوجيه
    if ([301, 302, 307, 308].includes(imgRes.statusCode) && imgRes.headers.location) {
      imgRes.resume();
      return fetchAndCacheImage(imgRes.headers.location, cacheKey, res, redirectCount + 1);
    }

    if (imgRes.statusCode !== 200) {
      if (!res.headersSent) res.status(imgRes.statusCode).json({ error: 'Image not found' });
      return;
    }

    const contentType = imgRes.headers['content-type'] || 'image/jpeg';
    const chunks = [];

    imgRes.on('data', (chunk) => chunks.push(chunk));

    imgRes.on('end', () => {
      const buffer = Buffer.concat(chunks);

      // حفظ الصورة في RAM الخادم لمدة 24 ساعة
      imageCache.set(cacheKey, { buffer, contentType });

      // إرسالها للمتصفح
      if (!res.headersSent) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // كاش 30 يوم في المتصفح
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'MISS'); // إشارة أن الصورة جُلبت للتو من Supabase
        res.status(200).send(buffer);
      }
    });

    imgRes.on('error', (err) => {
      console.error('Image stream error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'Stream error' });
    });
  });

  request.on('error', (err) => {
    console.error('Image proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch image' });
  });

  request.on('timeout', () => {
    request.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Image proxy timeout' });
  });

  request.end();
}

router.get('/img/proxy', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: 'url parameter is required' });

  // التحقق من أن الرابط من Supabase فقط لمنع استخدامه كـ open proxy
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!parsedUrl.hostname.endsWith('.supabase.co')) {
    return res.status(403).json({ error: 'Only Supabase URLs are allowed' });
  }

  // مفتاح الكاش = مسار الصورة
  const cacheKey = 'img:' + parsedUrl.pathname;

  // ✅ الصورة موجودة في الكاش → أرسلها فوراً بدون أي اتصال خارجي
  const cached = imageCache.get(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Content-Length', cached.buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'HIT'); // إشارة أن الصورة جاءت من الكاش
    return res.status(200).send(cached.buffer);
  }

  // ❌ غير موجودة في الكاش → اجلبها من Supabase وخزنها
  fetchAndCacheImage(imageUrl, cacheKey, res, 0);
});

router.use('/auth', authRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
