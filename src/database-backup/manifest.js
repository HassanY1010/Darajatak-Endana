const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

const INITIAL_MANIFEST = {
  version: 1,
  project: 'Darajatak-Endana',
  database: 'postgres',
  updatedAt: null,
  totalBackups: 0,
  backups: []
};

const INITIAL_FAILURES = {
  version: 1,
  project: 'Darajatak-Endana',
  updatedAt: null,
  failures: []
};

function loadManifest() {
  config.ensureDirectories();
  if (fs.existsSync(config.manifestPath)) {
    try {
      const data = fs.readFileSync(config.manifestPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      logger.error(`[DB_MANIFEST] Corrupted manifest file. Backing up and resetting: ${err.message}`);
      const backupCorruptPath = `${config.manifestPath}.corrupt.${Date.now()}`;
      try {
        fs.renameSync(config.manifestPath, backupCorruptPath);
      } catch (_) {}
    }
  }
  return { ...INITIAL_MANIFEST };
}

function saveManifest(manifest) {
  config.ensureDirectories();
  const manifestData = {
    ...manifest,
    totalBackups: (manifest.backups || []).length,
    updatedAt: new Date().toISOString()
  };

  const tempPath = `${config.manifestPath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(manifestData, null, 2), 'utf8');
    fs.renameSync(tempPath, config.manifestPath);
    return true;
  } catch (err) {
    logger.error(`[DB_MANIFEST] Failed to write manifest atomically: ${err.message}`);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    return false;
  }
}

function recordBackupSuccess(backupEntry) {
  const manifest = loadManifest();
  
  // Remove existing entry with same filename if present
  manifest.backups = manifest.backups.filter(b => b.filename !== backupEntry.filename);
  manifest.backups.push(backupEntry);

  // Sort newest first
  manifest.backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  saveManifest(manifest);
}

function recordBackupFailure(failureEntry) {
  config.ensureDirectories();
  let failures = { ...INITIAL_FAILURES };
  if (fs.existsSync(config.failuresPath)) {
    try {
      failures = JSON.parse(fs.readFileSync(config.failuresPath, 'utf8'));
    } catch (_) {}
  }

  failures.failures.unshift({
    ...failureEntry,
    timestamp: new Date().toISOString()
  });

  // Keep last 50 failures
  if (failures.failures.length > 50) {
    failures.failures = failures.failures.slice(0, 50);
  }

  failures.updatedAt = new Date().toISOString();
  const tempPath = `${config.failuresPath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(failures, null, 2), 'utf8');
    fs.renameSync(tempPath, config.failuresPath);
  } catch (_) {}
}

module.exports = {
  loadManifest,
  saveManifest,
  recordBackupSuccess,
  recordBackupFailure
};
