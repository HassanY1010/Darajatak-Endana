// نموذج المدير — التحقق من بيانات الدخول وإدارة الحساب
const bcrypt = require('bcryptjs');
const db = require('../database/db');

const AdminModel = {
  async findByEmail(email) {
    const res = await db.query(
      'SELECT * FROM admins WHERE email = $1',
      [String(email).toLowerCase().trim()]
    );
    return res.rows[0] || null;
  },

  async findById(id) {
    const res = await db.query(
      'SELECT id, name, email, phone, role, created_at FROM admins WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  },

  verifyPassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
  },

  async create(email, password, name, phone, role) {
    const hash = bcrypt.hashSync(password, 10);
    const res = await db.query(
      'INSERT INTO admins (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [String(email).toLowerCase().trim(), hash, name || null, phone || null, role || 'editor']
    );
    return this.findById(res.rows[0].id);
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;
    if (data.name != null) {
      fields.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.email != null) {
      fields.push(`email = $${idx++}`);
      params.push(String(data.email).toLowerCase().trim());
    }
    if (data.phone != null) {
      fields.push(`phone = $${idx++}`);
      params.push(data.phone);
    }
    if (data.role != null) {
      fields.push(`role = $${idx++}`);
      params.push(data.role);
    }
    if (data.password) {
      fields.push(`password_hash = $${idx++}`);
      params.push(bcrypt.hashSync(data.password, 10));
    }
    if (!fields.length) return this.findById(id);
    params.push(id);
    await db.query(`UPDATE admins SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return this.findById(id);
  },

  async list() {
    const res = await db.query('SELECT id, name, email, phone, role, created_at FROM admins ORDER BY id ASC');
    return res.rows;
  },

  async delete(id) {
    const res = await db.query('DELETE FROM admins WHERE id = $1', [id]);
    return res.rowCount > 0;
  },

  async changePassword(id, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    await db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, id]);
    return true;
  }
};

module.exports = AdminModel;
