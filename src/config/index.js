// تحميل متغيرات البيئة وتجميع الإعدادات في مكان واحد
require('dotenv').config();
const path = require('path');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@daragatuk.sa',
    password: process.env.ADMIN_PASSWORD || 'Admin@12345'
  },

  upload: {
    maxMb: parseInt(process.env.MAX_UPLOAD_MB, 10) || 10,
    dir: path.join(__dirname, '..', '..', 'public', 'uploads'),
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  },

  databaseUrl: process.env.DATABASE_URL,

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    bucket: process.env.SUPABASE_BUCKET || 'motorcycles'
  },

  paths: {
    root: path.join(__dirname, '..', '..'),
    public: path.join(__dirname, '..', '..', 'public'),
    dataDir: path.join(__dirname, '..', '..', 'data'),
    dbFile: path.join(__dirname, '..', '..', 'data', 'daragatuk.db')
  }
};

module.exports = config;
