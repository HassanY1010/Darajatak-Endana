const db = require('./src/database/db');
const r = db.prepare("SELECT id FROM views_log WHERE motorcycle_id = ? AND ip_address = ? AND created_at >= datetime('now', '-24 hours')").get(4, '::1');
console.log('Found recent entry:', r);
const all = db.prepare('SELECT * FROM views_log').all();
console.log('All logs:', JSON.stringify(all));
