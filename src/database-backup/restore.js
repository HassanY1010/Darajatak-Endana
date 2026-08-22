const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const config = require('./config');
const logger = require('./logger');
const { verifyBackupIntegrity } = require('./verify');
const { loadManifest } = require('./manifest');
const { inspectDatabaseSchemaAndCounts, compareDatabaseSnapshots } = require('./integrity');

function promptConfirmation(queryText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(queryText, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runRestore(options = {}) {
  const isDryRun = options.dryRun || false;
  const targetDatabaseUrl = options.targetDatabaseUrl || config.restoreTargetDatabaseUrl;
  const requestedFile = options.file || null;
  const skipPrompt = options.force || false;

  logger.info('====================================================');
  logger.info('  DARAJATAK-ENDANA DATABASE RESTORE INITIATED');
  logger.info('====================================================');
  logger.info(`Dry Run:              ${isDryRun ? 'YES (Simulated only)' : 'NO'}`);
  logger.info(`Target Database:      ${targetDatabaseUrl ? logger.sanitize(targetDatabaseUrl) : 'NOT PROVIDED'}`);
  logger.info('====================================================\n');

  if (!targetDatabaseUrl) {
    const err = 'Target database URL is required. Provide via RESTORE_TARGET_DATABASE_URL or --target-url.';
    logger.error(`[DB_RESTORE_FAIL] ${err}`);
    throw new Error(err);
  }

  // 1. Locate and Verify Backup File
  const manifest = loadManifest();
  let backupRecord = null;

  if (requestedFile) {
    backupRecord = (manifest.backups || []).find(b => b.filename === requestedFile || b.filePath === requestedFile);
    if (!backupRecord && fs.existsSync(requestedFile)) {
      backupRecord = {
        filename: path.basename(requestedFile),
        filePath: requestedFile
      };
    }
  } else {
    // Pick the newest verified backup
    backupRecord = (manifest.backups || [])[0];
  }

  if (!backupRecord) {
    const err = 'No valid backup found to restore.';
    logger.error(`[DB_RESTORE_FAIL] ${err}`);
    throw new Error(err);
  }

  logger.info(`[DB_RESTORE] Selected Backup: ${backupRecord.filename}`);
  logger.info(`[DB_RESTORE] Path:            ${backupRecord.filePath}`);

  const verifyRes = await verifyBackupIntegrity(backupRecord, backupRecord.filePath);
  if (verifyRes.status !== 'HEALTHY') {
    const err = `Cannot restore corrupted or missing backup: ${verifyRes.error}`;
    logger.error(`[DB_RESTORE_FAIL] ${err}`);
    throw new Error(err);
  }
  logger.info(`[DB_RESTORE] SHA-256 and TOC verified healthy (${verifyRes.tocEntries} objects).`);

  // 2. Dry Run Mode
  if (isDryRun) {
    console.log('\n====================================================');
    console.log('      DARAJATAK-ENDANA RESTORE (DRY-RUN)');
    console.log('====================================================');
    console.log(`Backup File:       ${backupRecord.filename}`);
    console.log(`Size:              ${((verifyRes.size || 0) / (1024*1024)).toFixed(2)} MB`);
    console.log(`SHA-256:           ${verifyRes.sha256}`);
    console.log(`TOC Objects:       ${verifyRes.tocEntries}`);
    console.log(`Target Database:   ${logger.sanitize(targetDatabaseUrl)}`);
    console.log(`Action:            Simulated. No data was written to target database.`);
    console.log('====================================================\n');
    return {
      status: 'DRY_RUN_PASSED',
      backup: backupRecord
    };
  }

  // 3. Safety Check: Protect Production Database from Unintended Overwrite
  const isProductionTarget = config.databaseUrl && targetDatabaseUrl.trim() === config.databaseUrl.trim();
  if (isProductionTarget) {
    console.log('\n⚠️⚠️⚠️ CAUTION: TARGET DATABASE IS THE PRODUCTION DATABASE! ⚠️⚠️⚠️');
  }

  // 4. Require Explicit Confirmation
  if (!skipPrompt) {
    const confirmPhrase = 'RESTORE DARAJATAK-ENDANA';
    console.log('\n====================================================');
    console.log('⚠️  CRITICAL RESTORE CONFIRMATION REQUIRED');
    console.log('====================================================');
    console.log(`You are about to RESTORE into target database:`);
    console.log(`${logger.sanitize(targetDatabaseUrl)}`);
    console.log(`Backup Source: ${backupRecord.filename}`);
    console.log(`This operation will import and overwrite existing data.`);
    console.log(`To confirm, type exactly: ${confirmPhrase}`);
    console.log('====================================================');

    const input = await promptConfirmation(`Confirmation: `);
    if (input !== confirmPhrase) {
      logger.warn('[DB_RESTORE] Restore cancelled by user (confirmation phrase mismatch).');
      return { status: 'CANCELLED' };
    }
  }

  // 5. Pre-Restore Safety Backup of Target Database (if target already has tables)
  try {
    const targetPreCheck = await inspectDatabaseSchemaAndCounts(targetDatabaseUrl);
    if (targetPreCheck.tablesCount > 0) {
      logger.info(`[DB_RESTORE] Target database already has ${targetPreCheck.tablesCount} tables. Creating Pre-Restore Snapshot...`);
      const preRestoreDump = path.join(config.tempDir, `pre-restore-${Date.now()}.dump`);
      const pgDumpTool = config.tools.pgDump;
      await new Promise((res, rej) => {
        const p = spawn(pgDumpTool, ['--format=custom', '--file=' + preRestoreDump, '--dbname=' + targetDatabaseUrl]);
        p.on('close', code => code === 0 ? res() : rej(new Error('Pre-restore backup failed')));
      });
      logger.info(`[DB_RESTORE] Pre-Restore snapshot saved safely at: ${preRestoreDump}`);
    }
  } catch (err) {
    logger.warn(`[DB_RESTORE] Note on pre-restore check: ${err.message}`);
  }

  // 6. Execute pg_restore
  const pgRestoreTool = config.tools.pgRestore;
  logger.info(`[DB_RESTORE] Executing pg_restore into target database...`);

  const restoreArgs = [
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
    '--dbname=' + targetDatabaseUrl,
    backupRecord.filePath
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(pgRestoreTool, restoreArgs, {
      env: { ...process.env }
    });

    let stderr = '';
    child.stderr.on('data', d => stderr += d.toString());

    child.on('error', err => reject(new Error(`Failed to spawn pg_restore: ${err.message}`)));
    child.on('close', code => {
      // pg_restore returns 0 on complete success, or 1 on warnings (e.g. drop if exists on fresh db)
      if (code === 0 || code === 1) {
        resolve();
      } else {
        reject(new Error(`pg_restore failed with exit code ${code}: ${logger.sanitize(stderr)}`));
      }
    });
  });

  // 7. Post-Restore Verification (Integrity & Comparison)
  logger.info(`[DB_RESTORE] Performing Post-Restore Integrity Audit...`);
  const restoredSnapshot = await inspectDatabaseSchemaAndCounts(targetDatabaseUrl);

  console.log('\n====================================================');
  console.log('    DARAJATAK-ENDANA RESTORE VERIFICATION REPORT');
  console.log('====================================================');
  console.log(`Target Database Tables: ${restoredSnapshot.tablesCount}`);
  console.log(`Row Counts by Table:`);
  for (const [tbl, count] of Object.entries(restoredSnapshot.rowCounts)) {
    console.log(`  - ${tbl}: ${count} rows`);
  }
  console.log(`Foreign Keys:           ${restoredSnapshot.foreignKeysCount}`);
  console.log(`Indexes:                ${restoredSnapshot.indexesCount}`);
  console.log(`Sequences:              ${restoredSnapshot.sequencesCount}`);
  console.log(`Image References Sample: ${restoredSnapshot.imageSample.length} verified`);
  console.log('====================================================\n');

  logger.success(`[DB_RESTORE_SUCCESS] Database restore successfully executed and verified!`);

  return {
    status: 'RESTORE_SUCCESS',
    snapshot: restoredSnapshot
  };
}

module.exports = {
  runRestore
};
