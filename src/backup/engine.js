const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const config = require('./config');
const logger = require('./logger');
const manifestManager = require('./manifest');
const { AsyncQueue, executeWithRetry } = require('./queue');

function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return reject(new Error(`File not found: ${filePath}`));
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

function calculateBufferSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

class BackupEngine {
  constructor() {
    this.client = null;
  }

  getClient() {
    if (!this.client) {
      if (!config.supabase.url || !config.supabase.key) {
        throw new Error('Supabase configuration missing (SUPABASE_URL or SUPABASE_KEY).');
      }
      this.client = createClient(config.supabase.url, config.supabase.key, {
        realtime: { transport: WebSocket }
      });
    }
    return this.client;
  }

  /**
   * جلب جميع ملفات الـ Bucket باستخدام الـ Pagination لمنع استهلاك الذاكرة
   */
  async listAllObjects(bucket = config.bucket) {
    const supabase = this.getClient();
    const allObjects = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    logger.info(`[BACKUP] Listing all objects from bucket: '${bucket}' (Pagination: ${pageSize})...`);

    while (hasMore) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list('', {
          limit: pageSize,
          offset: offset,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) {
        throw new Error(`Failed to list objects in bucket ${bucket}: ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      // تصفية أي كائنات وهمية أو مجلدات فارغة .emptyFolderPlaceholder
      const filesOnly = data.filter(item => item.name && item.name !== '.emptyFolderPlaceholder' && item.id !== null);
      allObjects.push(...filesOnly);

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    logger.info(`[BACKUP] Found ${allObjects.length} total objects in bucket '${bucket}'.`);
    return allObjects;
  }

  /**
   * تنزيل كائن باستخدام Streams مع ملف مؤقت .partial وحساب الـ SHA-256 أثناء التدفق
   */
  downloadStream(fileUrl, targetPath, expectedSize = null) {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${targetPath}.partial.${crypto.randomBytes(4).toString('hex')}`;
      const hash = crypto.createHash('sha256');
      const fileStream = fs.createWriteStream(tempPath);
      
      const client = fileUrl.startsWith('https') ? https : http;

      const req = client.get(fileUrl, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close();
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
          return reject(new Error(`HTTP ${res.statusCode} when fetching ${fileUrl}`));
        }

        const mimeType = res.headers['content-type'] || 'image/jpeg';
        let bytesDownloaded = 0;

        res.on('data', (chunk) => {
          bytesDownloaded += chunk.length;
          hash.update(chunk);
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            const sha256 = hash.digest('hex');
            
            // تحقق من الحجم إن توفر
            if (expectedSize !== null && expectedSize > 0 && bytesDownloaded !== expectedSize) {
              try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
              return reject(new Error(`Size mismatch: expected ${expectedSize}, got ${bytesDownloaded}`));
            }

            // التسمية الذرية
            try {
              if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
              }
              fs.renameSync(tempPath, targetPath);
              resolve({
                sha256,
                size: bytesDownloaded,
                mimeType
              });
            } catch (err) {
              try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
              reject(err);
            }
          });
        });

        fileStream.on('error', (err) => {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
          reject(err);
        });
      });

      req.on('error', (err) => {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
        reject(err);
      });

      req.setTimeout(30000, () => {
        req.destroy(new Error(`Timeout downloading from ${fileUrl}`));
      });
    });
  }

  /**
   * تنفيذ النسخ الاحتياطي بالكامل (Full / Incremental)
   */
  async runBackup({ dryRun = false, concurrency = config.concurrency } = {}) {
    const startTime = Date.now();
    config.ensureDirectories();
    
    logger.info('====================================================');
    logger.info('DARAJATAK-ENDANA BACKUP PROCESS STARTED');
    logger.info(`Root Directory: ${config.root}`);
    logger.info(`Bucket: ${config.bucket}`);
    logger.info(`Dry Run: ${dryRun ? 'YES (No files will be modified)' : 'NO'}`);
    logger.info(`Concurrency: ${concurrency}`);
    logger.info('====================================================');

    const manifest = manifestManager.loadManifest();
    const objects = await this.listAllObjects(config.bucket);

    const stats = {
      totalObjects: objects.length,
      downloaded: 0,
      alreadyExisting: 0,
      skipped: 0,
      failed: 0,
      hashVerified: 0,
      totalBytesDownloaded: 0
    };

    const queue = new AsyncQueue(concurrency);
    const failureList = [];

    for (const obj of objects) {
      const filename = obj.name;
      const relativePath = `${config.bucket}/${filename}`;
      const localFilePath = path.join(config.targetBucketDir, filename);
      const expectedSize = obj.metadata?.size || obj.size || null;
      const mimeType = obj.metadata?.mimetype || 'image/jpeg';
      const fileUrl = `${config.supabase.url}/storage/v1/object/public/${config.bucket}/${encodeURIComponent(filename)}`;

      // فحص هل الملف موجود وسليم مسبقاً
      let isCachedValid = false;
      const manifestEntry = manifest.files[relativePath];

      if (fs.existsSync(localFilePath) && manifestEntry) {
        const fileStat = fs.statSync(localFilePath);
        if (expectedSize === null || fileStat.size === expectedSize) {
          isCachedValid = true;
        }
      }

      if (isCachedValid) {
        stats.alreadyExisting++;
        stats.skipped++;
        stats.hashVerified++;
        logger.skipped(`[BACKUP][SKIP] ${relativePath} already verified locally.`);
        continue;
      }

      if (dryRun) {
        logger.info(`[DRY-RUN] Would download: ${relativePath} (${expectedSize || 'unknown'} bytes)`);
        stats.downloaded++;
        continue;
      }

      // إضافة مهمة التنزيل إلى الـ Queue
      queue.add(async () => {
        try {
          const result = await executeWithRetry(
            async (attempt) => {
              logger.info(`[BACKUP][DOWNLOADING] ${relativePath} (Attempt ${attempt}/${config.maxRetries})...`);
              return await this.downloadStream(fileUrl, localFilePath, expectedSize);
            },
            {
              maxRetries: config.maxRetries,
              initialDelayMs: config.retryInitialDelayMs,
              onRetry: (err, attempt, delay) => {
                logger.retry(`[BACKUP][RETRY] ${relativePath} failed: ${err.message}. Retrying in ${delay}ms...`);
              }
            }
          );

          // التحقق من سلامة الملف الناتج على القرص
          const localSha256 = await calculateFileSha256(localFilePath);
          if (localSha256 !== result.sha256) {
            throw new Error(`Integrity error: Stream SHA (${result.sha256}) !== File SHA (${localSha256})`);
          }

          // تسجيل الملف في الـ Manifest
          manifest.files[relativePath] = {
            bucket: config.bucket,
            path: relativePath,
            filename: filename,
            size: result.size,
            mimeType: result.mimeType || mimeType,
            sha256: localSha256,
            backupStatus: 'verified',
            firstBackupAt: manifest.files[relativePath]?.firstBackupAt || new Date().toISOString(),
            lastVerifiedAt: new Date().toISOString()
          };

          manifestManager.removeFailure(relativePath);
          stats.downloaded++;
          stats.hashVerified++;
          stats.totalBytesDownloaded += result.size;

          logger.success(`[BACKUP][VERIFIED] ${relativePath} saved successfully (SHA-256: ${localSha256.slice(0, 12)}...).`);
        } catch (err) {
          stats.failed++;
          manifestManager.recordFailure(relativePath, err.message);
          failureList.push({ path: relativePath, error: err.message });
          logger.error(`[BACKUP][ERROR] Failed to download ${relativePath}`, err);
        }
      });
    }

    await queue.waitAll();

    if (!dryRun) {
      manifestManager.saveManifest(manifest);
    }

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    const totalSizeMb = (stats.totalBytesDownloaded / (1024 * 1024)).toFixed(2);

    const report = `
====================================================
DARAJATAK-ENDANA BACKUP REPORT
====================================================
Backup Directory:
${config.root}

Supabase Bucket:
${config.bucket}

Total Supabase Objects:
${stats.totalObjects}

Downloaded:
${stats.downloaded}

Already Existing:
${stats.alreadyExisting}

Skipped:
${stats.skipped}

Failed:
${stats.failed}

Hash Verified:
${stats.hashVerified}

Total Downloaded Size:
${totalSizeMb} MB

Duration:
${durationSeconds} seconds

Status:
${stats.failed === 0 ? '✅ HEALTHY' : '⚠️ DEGRADED'}
====================================================`;

    logger.info(report);
    return { stats, durationSeconds, report };
  }
}

module.exports = {
  BackupEngine,
  calculateFileSha256,
  calculateBufferSha256
};
