const config = require('./config');
const logger = require('./logger');
const { runDatabaseBackup } = require('./backup');
const { applyRetentionPolicy } = require('./cleanup');
const { acquireDatabaseAgentLock, releaseDatabaseAgentLock, updateDatabaseAgentState } = require('./lock');

let isCycleActive = false;

function formatDateTime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

async function startDatabaseAgent() {
  const lock = acquireDatabaseAgentLock();
  if (!lock.acquired) {
    console.log('========================================');
    console.log('⚠️  DATABASE BACKUP AGENT WARNING');
    console.log('========================================');
    console.log(`Agent is ALREADY RUNNING (PID: ${lock.pid || 'Unknown'}).`);
    console.log(`Started at: ${lock.startedAt || 'N/A'}`);
    console.log('Duplicate instance blocked to ensure process safety and prevent conflict.');
    console.log('========================================\n');
    logger.warn(`[DB_AGENT] Blocked attempt to start duplicate DB agent instance (Active PID: ${lock.pid}).`);
    process.exit(0);
  }

  const intervalMs = config.intervalSeconds
    ? config.intervalSeconds * 1000
    : config.intervalMinutes * 60 * 1000;
  const intervalDisplay = config.intervalSeconds
    ? `${config.intervalSeconds} seconds`
    : `${config.intervalMinutes} minutes`;

  console.clear();
  console.log('========================================');
  console.log('   DARAJATAK-ENDANA DATABASE AGENT');
  console.log('========================================');
  console.log(`PID:              ${process.pid}`);
  console.log(`Backup Directory: ${config.root}`);
  console.log(`Interval:         ${intervalDisplay}`);
  console.log(`Status:           RUNNING`);
  console.log('========================================\n');

  logger.info(`[DB_AGENT] Database Backup Agent daemon started (PID: ${process.pid}, Interval: ${intervalDisplay}).`);

  updateDatabaseAgentState({
    status: 'RUNNING',
    pid: process.pid,
    startedAt: new Date().toISOString(),
    interval: intervalDisplay,
    totalCycles: 0,
    totalErrors: 0,
    lastError: null
  });

  let totalCycles = 0;
  let totalErrors = 0;

  const runCycle = async () => {
    if (isCycleActive) {
      logger.warn('[DB_AGENT] Previous backup cycle is still active. Skipping trigger.');
      return;
    }

    isCycleActive = true;
    totalCycles++;
    const now = new Date();
    const nextBackupTime = new Date(now.getTime() + intervalMs);

    logger.info(`[DB_AGENT] Starting scheduled backup cycle #${totalCycles} at ${formatDateTime(now)}...`);
    updateDatabaseAgentState({
      lastBackupAttemptAt: now.toISOString(),
      currentCycle: totalCycles
    });

    try {
      const backupEntry = await runDatabaseBackup({ type: 'daily' });
      applyRetentionPolicy();

      updateDatabaseAgentState({
        lastSuccessfulBackupAt: new Date().toISOString(),
        latestBackupFile: backupEntry.filename,
        latestBackupSizeMb: backupEntry.sizeMb,
        latestSha256: backupEntry.sha256,
        totalCycles: totalCycles,
        nextScheduledBackupAt: nextBackupTime.toISOString()
      });

      logger.info(`[DB_AGENT] Backup cycle #${totalCycles} completed successfully. Next backup scheduled at: ${formatDateTime(nextBackupTime)}`);
    } catch (err) {
      totalErrors++;
      logger.error(`[DB_AGENT] Backup cycle #${totalCycles} failed: ${err.message}`);
      updateDatabaseAgentState({
        totalErrors: totalErrors,
        lastError: err.message,
        lastErrorAt: new Date().toISOString()
      });
    } finally {
      isCycleActive = false;
    }
  };

  // Run initial backup on startup
  await runCycle();

  // Schedule recurring loop
  const timer = setInterval(runCycle, intervalMs);

  const shutdown = () => {
    logger.info(`[DB_AGENT] Received termination signal. Stopping Database Agent safely (PID: ${process.pid})...`);
    clearInterval(timer);
    updateDatabaseAgentState({
      status: 'STOPPED',
      stoppedAt: new Date().toISOString()
    });
    releaseDatabaseAgentLock();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    releaseDatabaseAgentLock();
  });
}

if (require.main === module) {
  startDatabaseAgent();
}

module.exports = {
  startDatabaseAgent
};
