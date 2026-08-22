const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { findPostgresTool } = require('./utils/postgres-tools');

const DEFAULT_DB_BACKUP_ROOT = 'D:\\دراجتك عندنا Backup\\Database';
const backupRoot = process.env.DATABASE_BACKUP_ROOT || DEFAULT_DB_BACKUP_ROOT;

const dbBackupConfig = {
  root: backupRoot,
  fullDir: path.join(backupRoot, 'full'),
  dailyDir: path.join(backupRoot, 'daily'),
  weeklyDir: path.join(backupRoot, 'weekly'),
  monthlyDir: path.join(backupRoot, 'monthly'),
  manifestsDir: path.join(backupRoot, 'manifests'),
  logsDir: path.join(backupRoot, 'logs'),
  failuresDir: path.join(backupRoot, 'failures'),
  tempDir: path.join(backupRoot, 'temp'),

  manifestPath: path.join(backupRoot, 'manifests', 'backup-manifest.json'),
  failuresPath: path.join(backupRoot, 'failures', 'backup-failures.json'),
  lockPath: path.join(backupRoot, 'database-agent.lock'),
  statePath: path.join(backupRoot, 'database-agent-state.json'),

  databaseUrl: process.env.DATABASE_URL,
  restoreTargetDatabaseUrl: process.env.RESTORE_TARGET_DATABASE_URL,

  intervalMinutes: parseInt(process.env.DATABASE_BACKUP_INTERVAL_MINUTES, 10) || 60,
  intervalSeconds: parseInt(process.env.DATABASE_BACKUP_INTERVAL_SECONDS, 10) || null,
  maxRetries: parseInt(process.env.DATABASE_BACKUP_MAX_RETRIES, 10) || 3,
  retryDelaysMinutes: [1, 2, 4, 8],
  timeoutMinutes: parseInt(process.env.DATABASE_BACKUP_TIMEOUT_MINUTES, 10) || 30,
  minFreeSpaceMb: parseInt(process.env.DATABASE_BACKUP_MIN_FREE_SPACE_MB, 10) || 1024,

  retention: {
    daily: parseInt(process.env.DATABASE_BACKUP_RETENTION_DAILY, 10) || 7,
    weekly: parseInt(process.env.DATABASE_BACKUP_RETENTION_WEEKLY, 10) || 4,
    monthly: parseInt(process.env.DATABASE_BACKUP_RETENTION_MONTHLY, 10) || 12
  },

  tools: {
    pgDump: findPostgresTool('pg_dump'),
    pgRestore: findPostgresTool('pg_restore'),
    psql: findPostgresTool('psql')
  },

  ensureDirectories() {
    const dirs = [
      this.root,
      this.fullDir,
      this.dailyDir,
      this.weeklyDir,
      this.monthlyDir,
      this.manifestsDir,
      this.logsDir,
      this.failuresDir,
      this.tempDir
    ];

    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    }
  }
};

module.exports = dbBackupConfig;
