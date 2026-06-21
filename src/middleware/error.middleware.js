// معالج الأخطاء العام + معالج 404 للـ API
function notFound(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'المسار غير موجود' });
  }
  next();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message);

  // أخطاء multer (رفع الصور)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'حجم الملف كبير جداً' });
  }
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(415).json({ success: false, message: 'نوع الملف غير مدعوم (الصور فقط)' });
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'خطأ داخلي في الخادم'
  });
}

module.exports = { notFound, errorHandler };
