// حماية المسارات عبر JWT (يُقرأ من الكوكي أو من الهيدر Authorization)
const jwt = require('jsonwebtoken');
const config = require('../config');

function getToken(req) {
  if (req.cookies && req.cookies.token) return req.cookies.token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'مطلوب تسجيل الدخول' });
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'الجلسة منتهية أو غير صالحة' });
  }
}

function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

module.exports = { requireAuth, signToken };
