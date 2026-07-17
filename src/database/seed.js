// تهيئة البيانات: إنشاء حساب المدير الافتراضي (PostgreSQL Asynchronous)
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('../config');

async function seedAdmin() {
  try {
    const res = await db.query('SELECT id FROM admins WHERE email = $1', [config.admin.email.toLowerCase().trim()]);
    const existing = res.rows[0];
    if (existing) {
      console.log(`ℹ️  حساب المدير موجود مسبقاً: ${config.admin.email}`);
      return;
    }
    const hash = await bcrypt.hash(config.admin.password, 10);
    await db.query('INSERT INTO admins (email, password_hash, role, name) VALUES ($1, $2, $3, $4)', [
      config.admin.email.toLowerCase().trim(),
      hash,
      'admin',
      'المشرف العام'
    ]);
    console.log(`✅ تم إنشاء حساب المدير: ${config.admin.email}`);
  } catch (err) {
    console.error('❌ خطأ في seedAdmin:', err.message);
  }
}

async function run() {
  console.log('🌱 بدء تهيئة قاعدة البيانات...');
  await db.ready;
  await seedAdmin();
  console.log('✅ لم يتم إدخال دراجات — انتظر إضافة يدوية من لوحة التحكم.');
  console.log('🎉 اكتملت التهيئة.');
  db.pool.end();
}

run();
