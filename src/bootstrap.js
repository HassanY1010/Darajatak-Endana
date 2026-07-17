// تشغيل تلقائي عند بدء الخادم: التأكد من وجود حسابات المدراء الأربعة
// ينتظر اكتمال إنشاء الجداول أولاً قبل إدخال البيانات
const bcrypt = require('bcryptjs');
const db = require('./database/db');

const ADMINS = [
  { name: 'مشرف الساحل', email: 'coast@darajtak.com', password: '123456', phone: '967780281399', role: 'editor' },
  { name: 'مشرف الوادي', email: 'valley@darajtak.com', password: '123456', phone: '967780157049', role: 'editor' },
  { name: 'المشرف العام',  email: 'admin@daragatuk.sa', password: '123456',  phone: '967771825242', role: 'admin' },
  { name: 'مساعد المشرف',  email: 'ass@darajtak.com', password: '123456', phone: '967784942030', role: 'editor' }
];

async function seedAdmins() {
  try {
    const upsertQuery = `
      INSERT INTO admins (name, email, password_hash, phone, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(email) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), admins.name),
        password_hash = EXCLUDED.password_hash,
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), admins.phone),
        role = COALESCE(NULLIF(EXCLUDED.role, ''), admins.role)
    `;

    for (const a of ADMINS) {
      const hash = await bcrypt.hash(a.password, 10);
      await db.query(upsertQuery, [a.name, a.email, hash, a.phone, a.role]);
      console.log(`✅ تم التأكد من حساب: ${a.name} — ${a.email}`);
    }
  } catch (err) {
    console.error('❌ خطأ أثناء إدخال المدراء الافتراضيين:', err.message);
  }
}

// انتظار اكتمال إنشاء الجداول قبل إدخال البيانات
db.ready
  .then(() => seedAdmins())
  .catch(err => console.error('❌ فشل الانتظار للجداول:', err.message));
