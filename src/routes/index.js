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

  const client = parsedUrl.protocol === 'https:' ? https : http;
  const request = client.get(imageUrl, (imgRes) => {
    // تمرير Content-Type والـ status من Supabase مباشرة
    res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000'); // كاش 30 يوم في المتصفح
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(imgRes.statusCode);
    imgRes.pipe(res);
  });

  request.on('error', (err) => {
    console.error('Image proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch image' });
  });

  // timeout بعد 10 ثواني
  request.setTimeout(10000, () => {
    request.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Image proxy timeout' });
  });
});

router.use('/auth', authRoutes);
router.use('/motorcycles', motorcycleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
