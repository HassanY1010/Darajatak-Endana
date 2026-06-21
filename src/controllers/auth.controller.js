// متحكّم المصادقة: تسجيل الدخول / الخروج / بيانات المستخدم الحالي (PostgreSQL Asynchronous)
const AdminModel = require('../models/admin.model');
const { signToken } = require('../middleware/auth.middleware');
const config = require('../config');

const AuthController = {
  async login(req, res) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(422).json({ success: false, message: 'البريد وكلمة المرور مطلوبان' });
      }

      const admin = await AdminModel.findByEmail(email);
      if (!admin || !AdminModel.verifyPassword(password, admin.password_hash)) {
        return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
      }

      const token = signToken({ id: admin.id, email: admin.email });

      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.env === 'production',
        maxAge: 12 * 60 * 60 * 1000 // 12 ساعة
      });

      res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        token,
        admin: { id: admin.id, name: admin.name, email: admin.email, phone: admin.phone, role: admin.role }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  logout(req, res) {
    res.clearCookie('token');
    res.json({ success: true, message: 'تم تسجيل الخروج' });
  },

  async me(req, res) {
    try {
      const admin = await AdminModel.findById(req.admin.id);
      if (!admin) return res.status(404).json({ success: false, message: 'غير موجود' });
      res.json({ success: true, admin });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  },

  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body || {};
      if (!current_password || !new_password || String(new_password).length < 6) {
        return res.status(422).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
      }
      const admin = await AdminModel.findByEmail(req.admin.email);
      if (!admin || !AdminModel.verifyPassword(current_password, admin.password_hash)) {
        return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
      }
      await AdminModel.changePassword(admin.id, new_password);
      res.json({ success: true, message: 'تم تغيير كلمة المرور' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', error: err.message });
    }
  }
};

module.exports = AuthController;
