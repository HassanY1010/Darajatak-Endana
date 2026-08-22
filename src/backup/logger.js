const fs = require('fs');
const path = require('path');
const config = require('./config');

function sanitize(str) {
  if (typeof str !== 'string') return str;
  let clean = str;
  if (config.supabase.key) {
    clean = clean.split(config.supabase.key).join('***REDACTED_SUPABASE_KEY***');
  }
  if (config.targetSupabase.key) {
    clean = clean.split(config.targetSupabase.key).join('***REDACTED_TARGET_KEY***');
  }
  if (process.env.JWT_SECRET) {
    clean = clean.split(process.env.JWT_SECRET).join('***REDACTED_JWT_SECRET***');
  }
  return clean;
}

class BackupLogger {
  constructor() {
    this.currentDateStr = '';
    this.logFile = null;
  }

  getLogFilePath() {
    config.ensureDirectories();
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    return path.join(config.logsDir, `backup-${dateStr}.log`);
  }

  write(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    let text = `[${timestamp}] [${level}] ${message}`;
    if (meta) {
      if (meta instanceof Error) {
        text += ` | Error: ${meta.message}\n${meta.stack}`;
      } else {
        try {
          text += ` | ${JSON.stringify(meta)}`;
        } catch (_) {}
      }
    }
    const cleanText = sanitize(text);

    // Console output
    if (level === 'ERROR') {
      console.error(cleanText);
    } else if (level === 'WARN' || level === 'WARNING') {
      console.warn(cleanText);
    } else {
      console.log(cleanText);
    }

    // Daily File logging
    try {
      const logPath = this.getLogFilePath();
      fs.appendFileSync(logPath, cleanText + '\n', 'utf8');
    } catch (err) {
      console.error('Failed to write to backup log file:', err.message);
    }
  }

  info(msg, meta) { this.write('INFO', msg, meta); }
  success(msg, meta) { this.write('SUCCESS', msg, meta); }
  warn(msg, meta) { this.write('WARN', msg, meta); }
  error(msg, meta) { this.write('ERROR', msg, meta); }
  retry(msg, meta) { this.write('RETRY', msg, meta); }
  skipped(msg, meta) { this.write('SKIPPED', msg, meta); }
}

module.exports = new BackupLogger();
