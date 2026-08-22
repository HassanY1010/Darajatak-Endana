const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const logger = require('./logger');
const { calculateFileSha256, verifyPgDumpFile } = require('./verify');
const { recordBackupSuccess, recordBackupFailure } = require('./manifest');
const { checkFreeDiskSpaceMb } = require('./utils/disk');

function formatTimestamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${MM}-${dd}_${hh}-${mm}-${ss}`;
}

async function testDatabaseConnectivity(databaseUrl) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    const res = await pool.query('SELECT version();');
    await pool.end();
    return {
      connected: true,
      version: res.rows[0].version
    };
  } catch (err) {
    try { await pool.end(); } catch (_) {}
    return {
      connected: false,
      error: err.message
    };
  }
}

async function runDatabaseBackup(options = {}) {
  const startTime = Date.now();
  const backupType = options.type || 'full'; // 'full' | 'daily' | 'weekly' | 'monthly'
  const isDryRun = options.dryRun || false;

  config.ensureDirectories();

  logger.info('====================================================');
  logger.info(`DARAJATAK-ENDANA DATABASE BACKUP PROCESS STARTED`);
  logger.info(`Backup Type:     ${backupType.toUpperCase()}`);
  logger.info(`Target Root:     ${config.root}`);
  logger.info(`Dry Run:         ${isDryRun ? 'YES' : 'NO'}`);
  logger.info('====================================================');

  // 1. Check Database URL
  if (!config.databaseUrl) {
    const err = 'DATABASE_URL environment variable is missing.';
    logger.error(`[DB_BACKUP_FAIL] ${err}`);
    recordBackupFailure({ reason: err, type: backupType });
    throw new Error(err);
  }

  // 2. Check Disk Space Protection
  const freeMb = checkFreeDiskSpaceMb(config.root);
  logger.info(`[DB_BACKUP] Available Free Space on Target Disk: ${freeMb} MB (Threshold: ${config.minFreeSpaceMb} MB)`);
  if (freeMb < config.minFreeSpaceMb) {
    const err = `INSUFFICIENT DISK SPACE: ${freeMb} MB free is less than required ${config.minFreeSpaceMb} MB.`;
    logger.error(`[DB_BACKUP_FAIL] ${err}`);
    recordBackupFailure({ reason: err, type: backupType });
    throw new Error(err);
  }

  // 3. Test Database Connection
  logger.info(`[DB_BACKUP] Testing database connectivity...`);
  const conn = await testDatabaseConnectivity(config.databaseUrl);
  if (!conn.connected) {
    const err = `DATABASE CONNECTION FAILED: ${conn.error}`;
    logger.error(`[DB_BACKUP_FAIL] ${err}`);
    recordBackupFailure({ reason: err, type: backupType });
    throw new Error(err);
  }
  logger.info(`[DB_BACKUP] Database connected successfully. Engine: ${conn.version}`);

  if (isDryRun) {
    logger.info('[DB_BACKUP][DRY-RUN] Pre-checks passed. Simulated backup complete.');
    return {
      status: 'DRY_RUN_PASSED',
      simulated: true
    };
  }

  // 4. Generate Target File Paths (Atomic .partial)
  const timestampStr = formatTimestamp();
  const baseFilename = `darajatak-endana-${backupType}-${timestampStr}.dump`;
  
  let targetFolder = config.fullDir;
  if (backupType === 'daily') targetFolder = config.dailyDir;
  else if (backupType === 'weekly') targetFolder = config.weeklyDir;
  else if (backupType === 'monthly') targetFolder = config.monthlyDir;

  const partialFilePath = path.join(config.tempDir, `${baseFilename}.partial`);
  const finalFilePath = path.join(targetFolder, baseFilename);
  const sha256FilePath = `${finalFilePath}.sha256`;

  // 5. Execute pg_dump with Custom Format (-Fc)
  const pgDumpTool = config.tools.pgDump;
  logger.info(`[DB_BACKUP] Using pg_dump executable: ${pgDumpTool}`);
  logger.info(`[DB_BACKUP] Creating Custom Format (-Fc) backup stream into atomic partial file...`);

  const parsed = new URL(config.databaseUrl);
  const dumpArgs = [
    '-h', parsed.hostname,
    '-p', parsed.port || '5432',
    '-U', decodeURIComponent(parsed.username),
    '-d', parsed.pathname.replace(/^\//, '') || 'postgres',
    '-n', 'public',
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--no-password',
    '-f', partialFilePath
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(pgDumpTool, dumpArgs, {
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(parsed.password),
        PGSSLMODE: 'require'
      }
    });

    let stderr = '';
    child.stderr.on('data', d => stderr += d.toString());

    child.on('error', err => {
      reject(new Error(`Failed to spawn pg_dump: ${err.message}`));
    });

    child.on('close', code => {
      if (code === 0 && fs.existsSync(partialFilePath) && fs.statSync(partialFilePath).size > 0) {
        resolve();
      } else {
        const errorMsg = stderr ? logger.sanitize(stderr) : `pg_dump exited with code ${code}`;
        reject(new Error(`pg_dump process failed: ${errorMsg}`));
      }
    });
  });

  // 6. Verify Partial File (pg_restore --list & SHA-256)
  logger.info(`[DB_BACKUP] Verifying partial dump file with pg_restore --list...`);
  const verifyResult = await verifyPgDumpFile(partialFilePath);
  if (!verifyResult.isValid) {
    try { fs.unlinkSync(partialFilePath); } catch (_) {}
    const err = `Dump verification failed: ${verifyResult.error}`;
    logger.error(`[DB_BACKUP_FAIL] ${err}`);
    recordBackupFailure({ reason: err, type: backupType });
    throw new Error(err);
  }

  const sha256Hash = await calculateFileSha256(partialFilePath);
  const fileSize = fs.statSync(partialFilePath).size;

  // 7. Atomic Rename: .partial -> .dump
  if (fs.existsSync(finalFilePath)) {
    try { fs.unlinkSync(finalFilePath); } catch (_) {}
  }
  fs.renameSync(partialFilePath, finalFilePath);
  fs.writeFileSync(sha256FilePath, `${sha256Hash} *${baseFilename}\n`, 'utf8');

  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const sizeMb = (fileSize / (1024 * 1024)).toFixed(2);

  // 8. Record in Manifest
  const backupEntry = {
    filename: baseFilename,
    type: backupType,
    filePath: finalFilePath,
    size: fileSize,
    sizeMb: parseFloat(sizeMb),
    sha256: sha256Hash,
    createdAt: new Date().toISOString(),
    durationSeconds: parseFloat(durationSeconds),
    postgresVersion: conn.version,
    tocEntriesCount: verifyResult.tableOfContentsCount,
    status: 'VERIFIED_HEALTHY'
  };

  recordBackupSuccess(backupEntry);

  logger.success(`[DB_BACKUP_SUCCESS] ${baseFilename} successfully created & verified!`);
  logger.info(`Size:       ${sizeMb} MB`);
  logger.info(`SHA-256:    ${sha256Hash}`);
  logger.info(`TOC Count:  ${verifyResult.tableOfContentsCount} database objects`);
  logger.info(`Duration:   ${durationSeconds} seconds`);
  logger.info(`Path:       ${finalFilePath}`);

  return backupEntry;
}

module.exports = {
  testDatabaseConnectivity,
  runDatabaseBackup
};
