// تهيئة البيانات: إنشاء حساب المدير الافتراضي + بيانات تجريبية للدراجات
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('../config');

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(config.admin.email);
  if (existing) {
    console.log(`ℹ️  حساب المدير موجود مسبقاً: ${config.admin.email}`);
    return;
  }
  const hash = bcrypt.hashSync(config.admin.password, 10);
  db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(
    config.admin.email,
    hash
  );
  console.log(`✅ تم إنشاء حساب المدير: ${config.admin.email}`);
}

function run() {
  console.log('🌱 بدء تهيئة قاعدة البيانات...');
  seedAdmin();
  console.log('✅ لم يتم إدخال دراجات — انتظر إضافة يدوية من لوحة التحكم.');
  console.log('🎉 اكتملت التهيئة.');
}

run();
