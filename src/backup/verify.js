const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const manifestManager = require('./manifest');
const { calculateFileSha256 } = require('./engine');

async function runVerify() {
  config.ensureDirectories();
  logger.info('====================================================');
  logger.info('DARAJATAK-ENDANA BACKUP INTEGRITY VERIFICATION');
  logger.info(`Target Directory: ${config.root}`);
  logger.info('====================================================');

  const manifest = manifestManager.loadManifest();
  const fileEntries = Object.values(manifest.files || {});

  logger.info(`Checking ${fileEntries.length} manifest entries against local files...`);

  let verifiedCount = 0;
  let missingCount = 0;
  let corruptedCount = 0;
  let sizeMismatchCount = 0;
  const issues = [];

  for (const entry of fileEntries) {
    const filename = path.basename(entry.path);
    const localFilePath = path.join(config.targetBucketDir, filename);

    if (!fs.existsSync(localFilePath)) {
      missingCount++;
      issues.push(`[MISSING] ${entry.path} - File not found at ${localFilePath}`);
      logger.error(`[VERIFY][MISSING] ${entry.path}`);
      continue;
    }

    const stat = fs.statSync(localFilePath);
    if (stat.size !== entry.size) {
      sizeMismatchCount++;
      issues.push(`[SIZE_MISMATCH] ${entry.path} - Manifest: ${entry.size} bytes, Disk: ${stat.size} bytes`);
      logger.error(`[VERIFY][SIZE_MISMATCH] ${entry.path}`);
      continue;
    }

    try {
      const currentSha256 = await calculateFileSha256(localFilePath);
      if (currentSha256 !== entry.sha256) {
        corruptedCount++;
        issues.push(`[HASH_MISMATCH] ${entry.path} - Manifest: ${entry.sha256}, Disk: ${currentSha256}`);
        logger.error(`[VERIFY][HASH_MISMATCH] ${entry.path}`);
        continue;
      }
    } catch (e) {
      corruptedCount++;
      issues.push(`[READ_ERROR] ${entry.path} - ${e.message}`);
      logger.error(`[VERIFY][READ_ERROR] ${entry.path}`, e);
      continue;
    }

    verifiedCount++;
  }

  const isHealthy = missingCount === 0 && corruptedCount === 0 && sizeMismatchCount === 0;

  const report = `
====================================================
DARAJATAK-ENDANA BACKUP VERIFICATION REPORT
====================================================
Total Manifest Entries: ${fileEntries.length}
Verified & Healthy:     ${verifiedCount}
Missing Files:          ${missingCount}
Corrupted (Bad Hash):   ${corruptedCount}
Size Mismatches:        ${sizeMismatchCount}

BACKUP HEALTH:
${isHealthy ? '✅ HEALTHY' : '⚠️ DEGRADED'}
====================================================`;

  logger.info(report);
  if (issues.length > 0) {
    logger.warn(`Issues Found:\n${issues.join('\n')}`);
  }

  return {
    isHealthy,
    total: fileEntries.length,
    verified: verifiedCount,
    missing: missingCount,
    corrupted: corruptedCount,
    sizeMismatch: sizeMismatchCount,
    issues
  };
}

module.exports = {
  runVerify
};
