const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

function verifyPgDumpFile(dumpFilePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(dumpFilePath)) {
      return resolve({
        isValid: false,
        error: 'File does not exist on disk'
      });
    }

    const stats = fs.statSync(dumpFilePath);
    if (stats.size === 0) {
      return resolve({
        isValid: false,
        error: 'Dump file is 0 bytes (empty)'
      });
    }

    const pgRestore = config.tools.pgRestore;
    const child = spawn(pgRestore, ['--list', dumpFilePath]);

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', d => output += d.toString());
    child.stderr.on('data', d => errorOutput += d.toString());

    child.on('close', (code) => {
      if (code === 0 && output.length > 0) {
        const lines = output.trim().split('\n');
        resolve({
          isValid: true,
          tableOfContentsCount: lines.length,
          size: stats.size
        });
      } else {
        resolve({
          isValid: false,
          error: errorOutput || `pg_restore --list exited with code ${code}`
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        isValid: false,
        error: err.message
      });
    });
  });
}

async function verifyBackupIntegrity(backupRecord, fullPath) {
  const filePath = fullPath || backupRecord.filePath;
  if (!fs.existsSync(filePath)) {
    return {
      status: 'MISSING',
      error: 'Dump file missing on disk'
    };
  }

  const currentSize = fs.statSync(filePath).size;
  if (backupRecord.size && currentSize !== backupRecord.size) {
    return {
      status: 'CORRUPTED',
      error: `Size mismatch (Expected: ${backupRecord.size}, Actual: ${currentSize})`
    };
  }

  const currentSha256 = await calculateFileSha256(filePath);
  if (backupRecord.sha256 && currentSha256 !== backupRecord.sha256) {
    return {
      status: 'CORRUPTED',
      error: `SHA-256 hash mismatch`
    };
  }

  const dumpVerify = await verifyPgDumpFile(filePath);
  if (!dumpVerify.isValid) {
    return {
      status: 'CORRUPTED',
      error: `pg_restore TOC inspection failed: ${dumpVerify.error}`
    };
  }

  return {
    status: 'HEALTHY',
    sha256: currentSha256,
    size: currentSize,
    tocEntries: dumpVerify.tableOfContentsCount
  };
}

async function runVerify() {
  const { loadManifest } = require('./manifest');
  const manifest = loadManifest();
  const backups = manifest.backups || [];

  console.log('====================================================');
  console.log('  DARAJATAK-ENDANA DATABASE BACKUP VERIFICATION');
  console.log('====================================================');
  console.log(`Manifest Backups Total: ${backups.length}`);
  console.log(`Target Directory:       ${config.root}`);
  console.log('====================================================\n');

  let healthyCount = 0;
  let corruptedCount = 0;
  let missingCount = 0;

  for (const b of backups) {
    const res = await verifyBackupIntegrity(b, b.filePath);
    if (res.status === 'HEALTHY') {
      healthyCount++;
      logger.info(`[DB_VERIFY][OK] ${b.filename} (Size: ${(b.size / (1024*1024)).toFixed(2)} MB, SHA-256: ${b.sha256.substring(0, 12)}...)`);
    } else if (res.status === 'MISSING') {
      missingCount++;
      logger.error(`[DB_VERIFY][MISSING] ${b.filename}: ${res.error}`);
    } else {
      corruptedCount++;
      logger.error(`[DB_VERIFY][CORRUPTED] ${b.filename}: ${res.error}`);
    }
  }

  const isAllHealthy = corruptedCount === 0 && missingCount === 0;

  console.log('\n====================================================');
  console.log('DARAJATAK-ENDANA DATABASE VERIFICATION REPORT');
  console.log('====================================================');
  console.log(`Total Manifest Backups: ${backups.length}`);
  console.log(`Healthy Backups:        ${healthyCount}`);
  console.log(`Corrupted Backups:      ${corruptedCount}`);
  console.log(`Missing Backups:        ${missingCount}`);
  console.log('----------------------------------------------------');
  console.log(`OVERALL DATABASE BACKUP HEALTH: ${isAllHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log('====================================================\n');

  return {
    isHealthy: isAllHealthy,
    total: backups.length,
    healthyCount,
    corruptedCount,
    missingCount
  };
}

module.exports = {
  calculateFileSha256,
  verifyPgDumpFile,
  verifyBackupIntegrity,
  runVerify
};
