// طبقة الاتصال بقاعدة بيانات PostgreSQL + إنشاء الجداول (Migrations)
const { Pool } = require('pg');
const config = require('../config');

let pool;
if (config.databaseUrl) {
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false } // مطلوب للاتصال بـ Supabase و Render
  });
} else {
  throw new Error('DATABASE_URL environment variable is missing.');
}

/**
 * إنشاء الجداول إذا لم تكن موجودة (Migrations)
 */
async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id            SERIAL PRIMARY KEY,
        name          TEXT,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone         TEXT,
        role          TEXT NOT NULL DEFAULT 'editor',
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS motorcycles (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        brand       TEXT NOT NULL,
        model       TEXT,
        color       TEXT,
        city        TEXT NOT NULL,
        price       DOUBLE PRECISION NOT NULL DEFAULT 0,
        currency    TEXT NOT NULL DEFAULT 'SAR',
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','reserved','sold')),
        negotiable  INTEGER NOT NULL DEFAULT 0,
        main_image  TEXT,
        views       INTEGER NOT NULL DEFAULT 0,
        created_by  INTEGER REFERENCES admins(id) ON DELETE SET NULL,
        expires_at  TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS images (
        id            SERIAL PRIMARY KEY,
        motorcycle_id INTEGER NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
        image_url     TEXT NOT NULL,
        order_index   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS views_log (
        id            SERIAL PRIMARY KEY,
        motorcycle_id INTEGER NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
        ip_address    TEXT NOT NULL,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_images_moto ON images(motorcycle_id);
      CREATE INDEX IF NOT EXISTS idx_moto_status ON motorcycles(status);
      CREATE INDEX IF NOT EXISTS idx_moto_city ON motorcycles(city);
      CREATE INDEX IF NOT EXISTS idx_moto_brand ON motorcycles(brand);
      CREATE INDEX IF NOT EXISTS idx_views_moto_ip ON views_log(motorcycle_id, ip_address);
      CREATE INDEX IF NOT EXISTS idx_views_created ON views_log(created_at);
    `);

    // إعدادات افتراضية للموقع
    const defaults = {
      site_name: 'دراجتك علينا',
      site_description: 'منصة عرض وبيع الدراجات النارية في حضرموت واليمن',
      whatsapp_number: '967000000000',
      logo_url: '',
      email: 'info@daragatuk.sa'
    };

    const insertSettingText = `
      INSERT INTO settings (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
    `;
    for (const [k, v] of Object.entries(defaults)) {
      await pool.query(insertSettingText, [k, v]);
    }

    console.log('✅ اكتملت تهيئة جداول قاعدة البيانات بنجاح.');
  } catch (err) {
    console.error('❌ خطأ أثناء تهيئة جداول قاعدة البيانات:', err.message);
  }
}

// تشغيل الهجرة تلقائياً
migrate();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
