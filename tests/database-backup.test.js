const fs = require('fs');
const path = require('path');
const config = require('../src/database-backup/config');
const { testDatabaseConnectivity, runDatabaseBackup } = require('../src/database-backup/backup');
const { verifyPgDumpFile, calculateFileSha256, verifyBackupIntegrity } = require('../src/database-backup/verify');
const { loadManifest, saveManifest, recordBackupSuccess, recordBackupFailure } = require('../src/database-backup/manifest');
const { acquireDatabaseAgentLock, releaseDatabaseAgentLock, isPidRunning } = require('../src/database-backup/lock');
const { applyRetentionPolicy } = require('../src/database-backup/cleanup');
const { checkFreeDiskSpaceMb } = require('../src/database-backup/utils/disk');
const { inspectDatabaseSchemaAndCounts, compareDatabaseSnapshots } = require('../src/database-backup/integrity');
const { runRestore } = require('../src/database-backup/restore');

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 DARAJATAK-ENDANA DATABASE BACKUP AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(title, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${title}: ${err.message}`);
      failed++;
    }
  }

  // 1. Database Connectivity
  await test('1. Database connection to Supabase PostgreSQL', async () => {
    const conn = await testDatabaseConnectivity(config.databaseUrl);
    if (!conn.connected) throw new Error(conn.error);
  });

  // 2. pg_dump availability
  await test('2. pg_dump and pg_restore binary tools availability', async () => {
    if (!fs.existsSync(config.tools.pgDump)) throw new Error(`pg_dump not found at: ${config.tools.pgDump}`);
    if (!fs.existsSync(config.tools.pgRestore)) throw new Error(`pg_restore not found at: ${config.tools.pgRestore}`);
  });

  // 3. Disk Space Protection
  await test('3. Disk space checking utility', async () => {
    const freeMb = checkFreeDiskSpaceMb(config.root);
    if (typeof freeMb !== 'number' || freeMb <= 0) throw new Error('Invalid disk space reading');
  });

  // 4. Single Process Lock
  await test('4. Single-Process Lock and Duplicate Prevention', async () => {
    const lock1 = acquireDatabaseAgentLock();
    if (!lock1.acquired) throw new Error('Failed to acquire initial lock');
    
    // Simulate second instance attempt
    const lock2 = acquireDatabaseAgentLock();
    if (lock2.acquired) throw new Error('Allowed duplicate lock acquisition!');

    releaseDatabaseAgentLock();
  });

  // 5. Stale Lock Recovery
  await test('5. Stale Lock file auto-recovery', async () => {
    config.ensureDirectories();
    // Write fake lock with dead PID 999999
    fs.writeFileSync(config.lockPath, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));
    const lock = acquireDatabaseAgentLock();
    if (!lock.acquired) throw new Error('Failed to reclaim stale lock');
    releaseDatabaseAgentLock();
  });

  // 6. Manifest Operations
  await test('6. Manifest atomic read, write, and failure recording', async () => {
    const manifest = loadManifest();
    if (!Array.isArray(manifest.backups)) throw new Error('Invalid manifest backups array');
    recordBackupFailure({ reason: 'Unit Test Simulated Failure', type: 'test' });
    const failures = JSON.parse(fs.readFileSync(config.failuresPath, 'utf8'));
    if (!failures.failures.some(f => f.reason === 'Unit Test Simulated Failure')) {
      throw new Error('Failure not recorded in backup-failures.json');
    }
  });

  // 7. Full Database Backup Creation (-Fc)
  let testBackupEntry = null;
  await test('7. Create Full Database Custom Format Backup', async () => {
    testBackupEntry = await runDatabaseBackup({ type: 'full' });
    if (!testBackupEntry.filePath || !fs.existsSync(testBackupEntry.filePath)) {
      throw new Error('Dump file not found on disk');
    }
    if (testBackupEntry.size <= 0) throw new Error('Dump file size is 0 bytes');
  });

  // 8. Atomic Partial File Rename
  await test('8. Atomic .partial file lifecycle protection', async () => {
    const tempPartials = fs.readdirSync(config.tempDir).filter(f => f.endsWith('.partial'));
    if (tempPartials.length > 0) throw new Error('Dangling partial files found in temp folder');
  });

  // 9. SHA-256 Checksum Calculation & File Generation
  await test('9. SHA-256 generation and .sha256 file presence', async () => {
    const hash = await calculateFileSha256(testBackupEntry.filePath);
    if (hash !== testBackupEntry.sha256) throw new Error('Hash mismatch');
    const shaFile = `${testBackupEntry.filePath}.sha256`;
    if (!fs.existsSync(shaFile)) throw new Error('.sha256 checksum file missing');
  });

  // 10. pg_restore --list Verification
  await test('10. pg_restore --list TOC object verification', async () => {
    const toc = await verifyPgDumpFile(testBackupEntry.filePath);
    if (!toc.isValid || toc.tableOfContentsCount < 10) {
      throw new Error(`Invalid dump file TOC: ${toc.error}`);
    }
  });

  // 11. Corrupted Backup Detection
  await test('11. Corrupted dump file detection', async () => {
    const corruptFile = path.join(config.tempDir, 'corrupt-test.dump');
    fs.writeFileSync(corruptFile, 'INVALID_CORRUPTED_BINARY_DUMP_HEADER');
    const res = await verifyPgDumpFile(corruptFile);
    if (res.isValid) throw new Error('Failed to flag corrupted file');
    try { fs.unlinkSync(corruptFile); } catch (_) {}
  });

  // 12. Retention Policy Protection
  await test('12. Retention Policy keeps newest backup and respects rules', async () => {
    const ret = applyRetentionPolicy();
    if (ret.retainedCount < 1) throw new Error('Retention pruned all backups!');
  });

  // 13. Restore Dry-Run
  await test('13. Restore Dry-Run mode without database writes', async () => {
    const dryRes = await runRestore({
      dryRun: true,
      targetDatabaseUrl: config.databaseUrl,
      file: testBackupEntry.filename
    });
    if (dryRes.status !== 'DRY_RUN_PASSED') throw new Error('Dry run failed');
  });

  // 14. Database Schema & Row Counts Inspection
  let schemaSnapshot = null;
  await test('14. Database schema inspection and row counts extraction', async () => {
    schemaSnapshot = await inspectDatabaseSchemaAndCounts(config.databaseUrl);
    if (schemaSnapshot.tablesCount !== 6) throw new Error(`Expected 6 tables, found ${schemaSnapshot.tablesCount}`);
    if (schemaSnapshot.rowCounts.motorcycles !== 72) throw new Error(`Expected 72 motorcycles, found ${schemaSnapshot.rowCounts.motorcycles}`);
    if (schemaSnapshot.rowCounts.images !== 267) throw new Error(`Expected 267 images, found ${schemaSnapshot.rowCounts.images}`);
  });

  // 15. Image References Preservation
  await test('15. Image URL storage references validation', async () => {
    if (schemaSnapshot.imageSample.length === 0) throw new Error('No image samples found');
    const sampleUrl = schemaSnapshot.imageSample[0].image_url;
    if (!sampleUrl.startsWith('https://') || !sampleUrl.includes('supabase.co')) {
      throw new Error(`Invalid storage image URL format: ${sampleUrl}`);
    }
  });

  // 16. Secret Sanitization in Logs
  await test('16. Sanitization of sensitive credentials in logs', async () => {
    const logger = require('../src/database-backup/logger');
    const sensitive = 'postgres://postgres:SuperSecret123@aws-1.supabase.com:5432/postgres';
    const clean = logger.sanitize(sensitive);
    if (clean.includes('SuperSecret123')) throw new Error('Secret was NOT redacted from log!');
    if (!clean.includes('****')) throw new Error('Sanitization mask missing');
  });

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`OVERALL STATUS: ${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('====================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

runAllTests();
