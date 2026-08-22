const fs = require('fs');
const path = require('path');
const config = require('./config');

const SENSITIVE_PATTERNS = [
  /postgres(ql)?:\/\/([^:]+):([^@]+)@/gi,
  /password=([^\s&]+)/gi,
  /SUPABASE_KEY=([^\s&]+)/gi,
  /eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}/g
];

function sanitize(message) {
  if (typeof message !== 'string') {
    try {
      message = JSON.stringify(message);
    } catch (_) {
      message = String(message);
    }
  }

  let sanitized = message;
  sanitized = sanitized.replace(/postgres(ql)?:\/\/([^:]+):([^@]+)@/gi, 'postgresql://$2:****@');
  sanitized = sanitized.replace(/password=([^\s&]+)/gi, 'password=****');
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}/g, '****JWT_SECRET****');

  return sanitized;
}

function getLogFilePath() {
  config.ensureDirectories();
  const dateStr = new Date().toISOString().split('T')[0];
  return path.join(config.logsDir, `database-backup-${dateStr}.log`);
}

function writeLog(level, message, meta = null) {
  const timestamp = new Date().toISOString();
  let sanitizedMsg = sanitize(message);
  if (meta) {
    sanitizedMsg += ` ${sanitize(meta)}`;
  }

  const logLine = `[${timestamp}] [${level}] ${sanitizedMsg}\n`;

  try {
    const logFile = getLogFilePath();
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (_) {}

  const consoleMsg = `[${timestamp}] [${level}] ${sanitizedMsg}`;
  if (level === 'ERROR') {
    console.error(consoleMsg);
  } else if (level === 'WARN') {
    console.warn(consoleMsg);
  } else {
    console.log(consoleMsg);
  }
}

const logger = {
  info: (msg, meta) => writeLog('INFO', msg, meta),
  warn: (msg, meta) => writeLog('WARN', msg, meta),
  error: (msg, meta) => writeLog('ERROR', msg, meta),
  success: (msg, meta) => writeLog('SUCCESS', msg, meta),
  sanitize
};

module.exports = logger;
