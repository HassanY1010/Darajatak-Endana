const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DEFAULT_BACKUP_ROOT = 'D:\\دراجتك عندنا Backup';

const backupRoot = process.env.BACKUP_ROOT || DEFAULT_BACKUP_ROOT;

const backupConfig = {
  root: backupRoot,
  bucket: process.env.SUPABASE_BUCKET || 'motorcycles',
  targetBucketDir: path.join(backupRoot, process.env.SUPABASE_BUCKET || 'motorcycles'),
  manifestPath: path.join(backupRoot, 'backup-manifest.json'),
  failuresPath: path.join(backupRoot, 'backup-failures.json'),
  lockPath: path.join(backupRoot, 'agent.lock'),
  statePath: path.join(backupRoot, 'agent-state.json'),
  logsDir: path.join(backupRoot, 'logs'),
  
  concurrency: parseInt(process.env.BACKUP_CONCURRENCY, 10) || 3,
  intervalMinutes: parseInt(process.env.BACKUP_INTERVAL_MINUTES, 10) || 5,
  intervalSeconds: parseInt(process.env.BACKUP_INTERVAL_SECONDS, 10) || null,
  maxRetries: parseInt(process.env.BACKUP_MAX_RETRIES, 10) || 3,
  retryInitialDelayMs: 1000,
  
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    bucket: process.env.SUPABASE_BUCKET || 'motorcycles'
  },
  
  targetSupabase: {
    url: process.env.TARGET_SUPABASE_URL,
    key: process.env.TARGET_SUPABASE_KEY,
    bucket: process.env.TARGET_SUPABASE_BUCKET || 'motorcycles'
  },

  ensureDirectories() {
    if (!fs.existsSync(backupRoot)) {
      fs.mkdirSync(backupRoot, { recursive: true });
    }
    if (!fs.existsSync(this.targetBucketDir)) {
      fs.mkdirSync(this.targetBucketDir, { recursive: true });
    }
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }
};

module.exports = backupConfig;
