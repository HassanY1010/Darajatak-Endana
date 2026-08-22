const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { loadManifest, saveManifest } = require('./manifest');

function applyRetentionPolicy() {
  config.ensureDirectories();
  const manifest = loadManifest();
  const backups = manifest.backups || [];

  if (backups.length <= 1) {
    logger.info('[DB_CLEANUP] Only 1 or 0 backups present. Skipping retention deletion for safety.');
    return {
      deletedCount: 0,
      retainedCount: backups.length
    };
  }

  // Group by type
  const dailyBackups = backups.filter(b => b.type === 'daily' || b.type === 'full');
  const weeklyBackups = backups.filter(b => b.type === 'weekly');
  const monthlyBackups = backups.filter(b => b.type === 'monthly');

  const toKeep = new Set();

  // Keep latest N of each category
  dailyBackups.slice(0, config.retention.daily).forEach(b => toKeep.add(b.filename));
  weeklyBackups.slice(0, config.retention.weekly).forEach(b => toKeep.add(b.filename));
  monthlyBackups.slice(0, config.retention.monthly).forEach(b => toKeep.add(b.filename));

  // ALWAYS keep the latest healthy backup regardless of rules
  if (backups.length > 0) {
    toKeep.add(backups[0].filename);
  }

  let deletedCount = 0;
  const remainingBackups = [];

  for (const b of backups) {
    if (toKeep.has(b.filename)) {
      remainingBackups.push(b);
    } else {
      logger.info(`[DB_CLEANUP] Pruning expired backup file per retention policy: ${b.filename}`);
      try {
        if (b.filePath && fs.existsSync(b.filePath)) {
          fs.unlinkSync(b.filePath);
          const shaFile = `${b.filePath}.sha256`;
          if (fs.existsSync(shaFile)) fs.unlinkSync(shaFile);
        }
        deletedCount++;
      } catch (err) {
        logger.error(`[DB_CLEANUP] Failed to delete file ${b.filePath}: ${err.message}`);
        remainingBackups.push(b); // Keep in manifest if deletion failed
      }
    }
  }

  manifest.backups = remainingBackups;
  saveManifest(manifest);

  logger.info(`[DB_CLEANUP] Retention complete. Deleted: ${deletedCount}, Retained: ${remainingBackups.length}`);

  return {
    deletedCount,
    retainedCount: remainingBackups.length
  };
}

module.exports = {
  applyRetentionPolicy
};
