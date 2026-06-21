// التحقق من صحة مدخلات الدراجة
const SAUDI_CITIES_HINT = true; // غير إلزامي — نقبل أي مدينة نصية

function validateMotorcycle(req, res, next) {
  const errors = [];
  const b = req.body || {};

  if (!b.title || String(b.title).trim().length < 2) {
    errors.push('اسم الدراجة مطلوب (حرفان على الأقل)');
  }
  if (!b.brand || String(b.brand).trim().length < 1) {
    errors.push('الشركة المصنّعة مطلوبة');
  }
  if (b.price == null || isNaN(Number(b.price)) || Number(b.price) < 0) {
    errors.push('السعر مطلوب ويجب أن يكون رقماً موجباً');
  }
  if (b.currency && !['SAR', 'YER'].includes(b.currency)) {
    errors.push('العملة غير صالحة (SAR أو YER فقط)');
  }
  if (b.status && !['available', 'reserved', 'sold'].includes(b.status)) {
    errors.push('الحالة غير صالحة');
  }

  if (errors.length) {
    return res.status(422).json({ success: false, message: 'بيانات غير صحيحة', errors });
  }
  next();
}

function validateStatus(req, res, next) {
  const { status } = req.body || {};
  if (!['available', 'reserved', 'sold'].includes(status)) {
    return res.status(422).json({ success: false, message: 'حالة غير صالحة' });
  }
  next();
}

module.exports = { validateMotorcycle, validateStatus };
