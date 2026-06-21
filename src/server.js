// نقطة الدخول الرئيسية للخادم — دراجتك علينا
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const config = require('./config');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');

// تهيئة قاعدة البيانات + بذر حساب المدير عند أول تشغيل
require('./database/db');
require('./bootstrap');

const MotorcycleModel = require('./models/motorcycle.model');

// تشغيل التنظيف التلقائي للعروض المنتهية وسجلات المشاهدات القديمة
function scheduleCleanup() {
  const run = async () => {
    try {
      const expired = await MotorcycleModel.cleanupExpired();
      if (expired > 0) console.log(`🧹 تم حذف ${expired} عرض منتهي الصلاحية`);
      const oldLogs = await MotorcycleModel.cleanupViewLogs();
      if (oldLogs > 0) console.log(`👁️ تم حذف ${oldLogs} سجل مشاهدة قديم`);
    } catch (e) {
      console.error('🧹 خطأ في التنظيف:', e.message);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}

const app = express();

// إخبار Express بأنه يعمل خلف Reverse Proxy (Render/Nginx)
// ضروري لكي تعمل مكتبة express-rate-limit بشكل صحيح
app.set('trust proxy', 1);

// ===== الأمان والوسائط =====
app.use(helmet({
  contentSecurityPolicy: false, // معطّل لأن الواجهة تستخدم CDN (Tailwind/خطوط)
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ===== الملفات الثابتة =====
app.use('/uploads', express.static(config.upload.dir, { maxAge: '7d' }));
app.use(express.static(config.paths.public));

// ===== Sitemap =====
app.get('/sitemap.xml', async (req, res) => {
  try {
    const listResult = await MotorcycleModel.list({ limit: 10000 });
    const motos = listResult.data || [];
    const pages = motos.map(m => `
  <url>
    <loc>https://daragatuk.sa/motorcycle.html?id=${encodeURIComponent(m.id)}</loc>
    <lastmod>${(m.updated_at || m.created_at || '').split(' ')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://daragatuk.sa/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://daragatuk.sa/motorcycles.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://daragatuk.sa/about.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://daragatuk.sa/contact.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  ${pages}
</urlset>`);
  } catch (e) {
    res.status(500).send('Sitemap generation failed');
  }
});

// ===== الـ API =====
app.use('/api', apiRoutes);

// ===== صفحات الواجهة (SPA-like static pages) =====
// أي مسار غير API ولا ملف موجود → نُرجع index.html (للروابط النظيفة)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  const requested = path.join(config.paths.public, req.path);
  // إذا كان ملف موجود فعلاً يُخدم تلقائياً عبر static؛ غير ذلك أرجع index.html
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(config.paths.public, 'index.html'));
});

// ===== معالجة الأخطاء =====
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  const db = require('./database/db');
  db.ready
    .then(() => scheduleCleanup())
    .catch(() => {});
  console.log('═══════════════════════════════════════════');
  console.log('🏍️  دراجتك علينا — الخادم يعمل');
  console.log(`🌐 http://localhost:${config.port}`);
  console.log(`🔐 لوحة التحكم: http://localhost:${config.port}/admin/login.html`);
  console.log(`⚙️  البيئة: ${config.env}`);
  console.log('⏳ مدة العرض: 30 يوم من تاريخ النشر');
  console.log('═══════════════════════════════════════════');
});

module.exports = app;
