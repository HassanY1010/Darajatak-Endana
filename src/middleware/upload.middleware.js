// رفع الصور كذاكرة مؤقتة (Memory Storage) لتمرير البافر إلى Supabase Storage
const multer = require('multer');
const config = require('../config');

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (config.upload.allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxMb * 1024 * 1024 }
});

module.exports = upload;
