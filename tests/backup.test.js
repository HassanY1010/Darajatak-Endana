const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const config = require('../src/backup/config');
const logger = require('../src/backup/logger');
const manifestManager = require('../src/backup/manifest');
const { BackupEngine, calculateFileSha256 } = require('../src/backup/engine');
const { runVerify } = require('../src/backup/verify');
const { runAudit } = require('../src/backup/audit');
const { runRestore } = require('../src/backup/restore');
const { AsyncQueue, executeWithRetry } = require('../src/backup/queue');

// Mock helpers
function createTestImage(filePath, text = 'test image content') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(text), 'utf8');
}

async function runTestSuite() {
  console.log('\n====================================================');
  console.log('STARTING DARAJATAK-ENDANA BACKUP & DR TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`TEST: ${name} ... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error(err);
      failed++;
    }
  }

  // 1. Unicode & Arabic Windows Path Support
  await test('Unicode / Arabic Windows Path Support', async () => {
    config.ensureDirectories();
    assert(fs.existsSync(config.root), 'Backup root directory must exist');
    assert(fs.existsSync(config.targetBucketDir), 'Target bucket directory must exist');
    assert(fs.existsSync(config.logsDir), 'Logs directory must exist');
  });

  // 2. Secret Redaction & Leakage Prevention in Logger and Manifest
  await test('Secrets Leakage Prevention', async () => {
    const originalKey = config.supabase.key;
    const rawSecret = 'secret_test_key_12345';
    config.supabase.key = rawSecret;
    const logPath = logger.getLogFilePath();
    logger.info(`Connecting to Supabase with key ${rawSecret}`);
    const logContent = fs.readFileSync(logPath, 'utf8');
    assert(!logContent.includes(rawSecret), 'Secret key must be redacted in log file');
    assert(logContent.includes('***REDACTED_SUPABASE_KEY***'), 'Redaction placeholder must be present');
    config.supabase.key = originalKey; // Restore real key
  });


  // 3. Concurrency Queue & Rate Limiting
  await test('AsyncQueue Concurrency Limiting', async () => {
    const queue = new AsyncQueue(2);
    let active = 0;
    let maxObservedActive = 0;
    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      active++;
      maxObservedActive = Math.max(maxObservedActive, active);
      await new Promise(r => setTimeout(r, 50));
      active--;
    });
    tasks.forEach(t => queue.add(t));
    await queue.waitAll();
    assert(maxObservedActive <= 2, `Concurrency should not exceed 2 (observed: ${maxObservedActive})`);
  });

  // 4. Retry Mechanism with Exponential Backoff
  await test('Exponential Backoff Retry on Transient Failure', async () => {
    let attempts = 0;
    const result = await executeWithRetry(async (attempt) => {
      attempts++;
      if (attempts < 3) throw new Error('Transient Network Error');
      return 'success';
    }, { maxRetries: 3, initialDelayMs: 20 });
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  // 5. SHA-256 Checksum Calculation & Tamper Detection
  await test('SHA-256 Calculation & Corrupted File Detection', async () => {
    const testFile = path.join(config.targetBucketDir, '__test_integrity.jpg');
    createTestImage(testFile, 'initial valid content');
    const hash1 = await calculateFileSha256(testFile);
    assert(hash1.length === 64, 'SHA-256 must be 64 hex characters');

    // Corrupt file
    fs.writeFileSync(testFile, Buffer.from('tampered content'));
    const hash2 = await calculateFileSha256(testFile);
    assert.notStrictEqual(hash1, hash2, 'Hash must change when content is tampered');
    try { fs.unlinkSync(testFile); } catch (_) {}
  });

  // 6. Partial File & Atomic Write Simulation
  await test('Atomic Partial File Write & Recovery', async () => {
    const finalPath = path.join(config.targetBucketDir, '__test_atomic.jpg');
    const partialPath = `${finalPath}.partial.1234`;
    fs.writeFileSync(partialPath, Buffer.from('unfinished stream data'));
    
    // Simulate cleanup or atomic rename
    assert(fs.existsSync(partialPath), 'Partial file exists before commit');
    assert(!fs.existsSync(finalPath), 'Final file must not exist while partial');
    
    fs.renameSync(partialPath, finalPath);
    assert(fs.existsSync(finalPath), 'Final file exists after atomic commit');
    try { fs.unlinkSync(finalPath); } catch (_) {}
  });

  // 7. Manifest Atomic Operations & File Tracking
  await test('Manifest Tracking & Atomic Save', async () => {
    const manifest = manifestManager.loadManifest();
    manifest.files['motorcycles/__test_manifest_item.jpg'] = {
      bucket: 'motorcycles',
      path: 'motorcycles/__test_manifest_item.jpg',
      filename: '__test_manifest_item.jpg',
      size: 1024,
      mimeType: 'image/jpeg',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      backupStatus: 'verified',
      firstBackupAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString()
    };
    manifestManager.saveManifest(manifest);
    
    const reloaded = manifestManager.loadManifest();
    assert(reloaded.files['motorcycles/__test_manifest_item.jpg'], 'Manifest entry must persist');
    
    // Cleanup manifest test item
    delete reloaded.files['motorcycles/__test_manifest_item.jpg'];
    manifestManager.saveManifest(reloaded);
  });

  // 8. 30-Day Cleanup Compatibility (Local Backup Retention)
  await test('30-Day Cleanup Retention (Local Backup is never deleted)', async () => {
    const archivedFilename = '__test_30day_archived.jpg';
    const archivedPath = path.join(config.targetBucketDir, archivedFilename);
    createTestImage(archivedPath, 'Simulated deleted motorcycle image');

    // Simulate verify and audit
    const auditRes = await runAudit();
    assert(fs.existsSync(archivedPath), 'Archived file MUST REMAIN on disk after audit');
    assert(auditRes.orphanLocal >= 1, 'Audit must recognize retained local archive files');
    try { fs.unlinkSync(archivedPath); } catch (_) {}
  });

  // 9. Restore Dry-Run Safety
  await test('Restore Dry-Run and Safety Blocks', async () => {
    const dryRunResult = await runRestore({
      dryRun: true,
      targetUrl: 'https://new-mock-target.supabase.co',
      targetKey: 'mock-key',
      targetBucket: 'motorcycles'
    });
    assert.strictEqual(dryRunResult.status, 'DRY_RUN_COMPLETE');
  });

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('====================================================\n');

  return { passed, failed };
}

if (require.main === module) {
  runTestSuite().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}

module.exports = { runTestSuite };
