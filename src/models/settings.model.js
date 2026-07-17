// نموذج إعدادات الموقع
const db = require('../database/db');

const SettingsModel = {
  async getAll() {
    const res = await db.query('SELECT key, value FROM settings');
    const obj = {};
    for (const r of res.rows) {
      obj[r.key] = r.value;
    }
    return obj;
  },

  async get(key) {
    const res = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
    return res.rows[0] ? res.rows[0].value : null;
  },

  async set(key, value) {
    await db.query(`
      INSERT INTO settings (key, value) VALUES ($1, $2)
      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
    `, [key, value == null ? '' : String(value)]);
  },

  async setMany(obj = {}) {
    const allowed = ['site_name', 'site_description', 'whatsapp_number', 'logo_url', 'email'];
    const promises = [];
    for (const [k, v] of Object.entries(obj)) {
      if (allowed.includes(k)) {
        promises.push(this.set(k, v));
      }
    }
    await Promise.all(promises);
    return this.getAll();
  }
};

module.exports = SettingsModel;
