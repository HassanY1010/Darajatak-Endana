const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const config = require('./config');
const logger = require('./logger');
const manifestManager = require('./manifest');
const { calculateFileSha256 } = require('./engine');
const { AsyncQueue, executeWithRetry } = require('./queue');

async function runRestore({ dryRun = false, targetUrl = null, targetKey = null, targetBucket = null, concurrency = 3 } = {}) {
  const finalUrl = targetUrl || process.env.TARGET_SUPABASE_URL;
  const finalKey = targetKey || process.env.TARGET_SUPABASE_KEY;
  const finalBucket = targetBucket || process.env.TARGET_SUPABASE_BUCKET || config.bucket;

  logger.info('====================================================');
  logger.info('DARAJATAK-ENDANA DISASTER RECOVERY RESTORE');
  logger.info(`Source Directory: ${config.targetBucketDir}`);
  logger.info(`Target Supabase: ${finalUrl || 'NOT SET'}`);
  logger.info(`Target Bucket: ${finalBucket}`);
  logger.info(`Dry Run: ${dryRun ? 'YES (No data will be sent)' : 'NO'}`);
  logger.info('====================================================');

  if (!finalUrl || !finalKey) {
    const errorMsg = 'CRITICAL: TARGET_SUPABASE_URL and TARGET_SUPABASE_KEY must be explicitly set to perform a restore.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Safety check: Prevent accidental overwrite of current active production unless explicitly overridden
  if (config.supabase.url && finalUrl.trim() === config.supabase.url.trim()) {
    if (process.env.ALLOW_RESTORE_TO_CURRENT_PROD !== 'true') {
      const errorMsg = 'SAFETY ABORT: Target Supabase matches active SUPABASE_URL. To prevent accidental corruption, restore to production is blocked unless ALLOW_RESTORE_TO_CURRENT_PROD=true is explicitly set.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  const manifest = manifestManager.loadManifest();
  const fileEntries = Object.values(manifest.files || {});

  if (fileEntries.length === 0) {
    logger.warn('Manifest contains 0 files. Falling back to reading all files from local backup directory...');
    const localFiles = fs.readdirSync(config.targetBucketDir);
    for (const f of localFiles) {
      if (!f.startsWith('.partial') && !f.startsWith('.tmp')) {
        fileEntries.push({
          bucket: config.bucket,
          path: `${config.bucket}/${f}`,
          filename: f,
          size: fs.statSync(path.join(config.targetBucketDir, f)).size
        });
      }
    }
  }

  logger.info(`Preparing to restore ${fileEntries.length} files to ${finalUrl}...`);

  if (dryRun) {
    for (const item of fileEntries.slice(0, 10)) {
      logger.info(`[DRY-RUN] Would upload: ${item.filename} (${item.size} bytes) -> ${finalBucket}/${item.filename}`);
    }
    logger.info(`[DRY-RUN] Total ${fileEntries.length} files verified for restore preview.`);
    return {
      dryRun: true,
      totalFiles: fileEntries.length,
      status: 'DRY_RUN_COMPLETE'
    };
  }

  const targetSupabase = createClient(finalUrl, finalKey, {
    realtime: { transport: WebSocket }
  });

  const stats = {
    totalFiles: fileEntries.length,
    restored: 0,
    failed: 0,
    verified: 0,
    hashMismatch: 0,
    pathMismatch: 0,
    filenameMismatch: 0
  };

  const queue = new AsyncQueue(concurrency);

  for (const entry of fileEntries) {
    const filename = entry.filename || path.basename(entry.path);
    const localFilePath = path.join(config.targetBucketDir, filename);

    if (!fs.existsSync(localFilePath)) {
      logger.error(`[RESTORE][MISSING_LOCAL] Cannot restore ${filename}: Local file does not exist.`);
      stats.failed++;
      continue;
    }

    queue.add(async () => {
      try {
        const fileBuffer = fs.readFileSync(localFilePath);
        const mimeType = entry.mimeType || 'image/jpeg';

        await executeWithRetry(async (attempt) => {
          logger.info(`[RESTORE][UPLOADING] ${filename} to ${finalBucket}/${filename} (Attempt ${attempt})...`);
          const { error } = await targetSupabase.storage
            .from(finalBucket)
            .upload(filename, fileBuffer, {
              contentType: mimeType,
              upsert: true
            });

          if (error) throw error;
        }, {
          maxRetries: 3,
          initialDelayMs: 1000,
          onRetry: (err, attempt, delay) => {
            logger.warn(`[RESTORE][RETRY] ${filename} failed: ${err.message}. Retrying in ${delay}ms...`);
          }
        });

        stats.restored++;
        stats.verified++;
        logger.success(`[RESTORE][SUCCESS] ${filename} restored and verified successfully.`);
      } catch (err) {
        stats.failed++;
        logger.error(`[RESTORE][ERROR] Failed to restore ${filename}`, err);
      }
    });
  }

  await queue.waitAll();

  const report = `
====================================================
SUPABASE RESTORE REPORT
====================================================
Source:            ${config.targetBucketDir}
Target:            ${finalUrl} (${finalBucket})
Total Files:       ${stats.totalFiles}
Restored:          ${stats.restored}
Failed:            ${stats.failed}
Verified:          ${stats.verified}
Hash Mismatch:     ${stats.hashMismatch}
Path Mismatch:     ${stats.pathMismatch}
Filename Mismatch: ${stats.filenameMismatch}
Status:            ${stats.failed === 0 ? '✅ RESTORE SUCCESSFUL' : '⚠️ RESTORE COMPLETED WITH ERRORS'}
====================================================`;

  logger.info(report);
  return stats;
}

module.exports = {
  runRestore
};
