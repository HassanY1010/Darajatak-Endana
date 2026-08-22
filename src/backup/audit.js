const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const manifestManager = require('./manifest');
const { BackupEngine, calculateFileSha256 } = require('./engine');

async function runAudit() {
  config.ensureDirectories();
  logger.info('====================================================');
  logger.info('DARAJATAK-ENDANA STORAGE AUDIT (Supabase VS Local)');
  logger.info(`Local Backup Root: ${config.root}`);
  logger.info(`Supabase URL: ${config.supabase.url}`);
  logger.info(`Bucket: ${config.bucket}`);
  logger.info('====================================================');

  const engine = new BackupEngine();
  const remoteObjects = await engine.listAllObjects(config.bucket);
  const manifest = manifestManager.loadManifest();

  // Local files on disk
  const localFiles = fs.existsSync(config.targetBucketDir)
    ? fs.readdirSync(config.targetBucketDir).filter(f => !f.startsWith('.partial') && !f.startsWith('.tmp'))
    : [];

  const remoteMap = new Map();
  for (const obj of remoteObjects) {
    remoteMap.set(obj.name, obj);
  }

  const localMap = new Set(localFiles);

  let matching = 0;
  let missingLocal = 0;
  let orphanLocal = 0;
  let sizeMismatch = 0;

  const missingList = [];
  const orphanList = [];
  const sizeMismatchList = [];

  // 1. Check Remote vs Local
  for (const [name, obj] of remoteMap.entries()) {
    const localFilePath = path.join(config.targetBucketDir, name);
    if (!localMap.has(name) || !fs.existsSync(localFilePath)) {
      missingLocal++;
      missingList.push(name);
    } else {
      const stat = fs.statSync(localFilePath);
      const expectedSize = obj.metadata?.size || obj.size;
      if (expectedSize && stat.size !== expectedSize) {
        sizeMismatch++;
        sizeMismatchList.push({ name, expectedSize, actualSize: stat.size });
      } else {
        matching++;
      }
    }
  }

  // 2. Check Orphan Local Backups (e.g. 30-day deleted from Supabase, but safely retained locally)
  for (const name of localMap) {
    if (!remoteMap.has(name)) {
      orphanLocal++;
      orphanList.push(name);
    }
  }

  const report = `
====================================================
DARAJATAK-ENDANA AUDIT REPORT
====================================================
Supabase Objects:        ${remoteObjects.length}
Local Backup Files:      ${localFiles.length}
Manifest Tracked Files:  ${Object.keys(manifest.files || {}).length}
----------------------------------------------------
Matching & Synced:       ${matching}
Missing from Local:      ${missingLocal}
Orphan Local (Archived): ${orphanLocal} (Retained Disaster Recovery files)
Size Mismatches:         ${sizeMismatch}
====================================================`;

  logger.info(report);

  if (missingList.length > 0) {
    logger.warn(`Missing Local Files (${missingList.length}):\n${missingList.slice(0, 10).join('\n')}${missingList.length > 10 ? '\n...and more' : ''}`);
  }

  if (orphanList.length > 0) {
    logger.info(`Archived/Orphan Local Files (Safely kept on D:): ${orphanList.length}`);
  }

  return {
    remoteCount: remoteObjects.length,
    localCount: localFiles.length,
    matching,
    missingLocal,
    orphanLocal,
    sizeMismatch,
    missingList,
    orphanList
  };
}

module.exports = {
  runAudit
};
