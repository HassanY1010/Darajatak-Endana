// تجميع كل مسارات الـ API تحت /api
const express = require('express');
const https = require('https');
const http = require('http');
const authRoutes = require('./auth.routes');
const motorcycleRoutes = require('./motorcycle.routes');
const settingsRoutes = require('./settings.routes');
const router = express.Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: Date.now() }));

/**
 * Image Proxy — يجلب الصور من Supabase ويخدمها مباشرة من خادمنا
 * يحل مشكلة عدم ظهور الصور لبعض المستخدمين (CORS / Browser Security)
 * الاستخدام: /api/img/proxy?url=<encoded_url>
 */
function fetchImage(imageUrl, res, redirectCount) {
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
      // إرسال User-Agent متصفح حقيقي لمنع حجب Supabase CDN للطلب
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    },
    timeout: 15000
  };

  const client = parsedUrl.protocol === 'https:' ? https : http;
  const request = client.request(options, (imgRes) => {
    // معالجة إعادة التوجيه (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(imgRes.statusCode) && imgRes.headers.location) {
      imgRes.resume(); // تفريغ الـ body
      return fetchImage(imgRes.headers.location, res, redirectCount + 1);
    }

    if (imgRes.statusCode !== 200) {
      if (!res.headersSent) res.status(imgRes.statusCode).json({ error: 'Image not found' });
      return;
    }

    res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000'); // كاش 30 يوم في المتصفح
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200);
    imgRes.pipe(res);
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

  fetchImage(imageUrl, res, 0);
});


router.use('/auth', authRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
