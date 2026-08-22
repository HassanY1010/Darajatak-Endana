const config = require('./config');
const logger = require('./logger');
const { BackupEngine } = require('./engine');
const { acquireAgentLock, releaseAgentLock, updateAgentState } = require('./lock');

let isCycleActive = false;

function formatDateTime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

async function startAgent() {
  const lock = acquireAgentLock();
  if (!lock.acquired) {
    console.log('========================================');
    console.log('⚠️  DARAJATAK-ENDANA BACKUP AGENT WARNING');
    console.log('========================================');
    console.log(`Agent is ALREADY RUNNING (PID: ${lock.pid || 'Unknown'}).`);
    console.log(`Started at: ${lock.startedAt || 'N/A'}`);
    console.log('Duplicate instance blocked to ensure process safety and prevent conflict.');
    console.log('========================================\n');
    logger.warn(`[AGENT] Blocked attempt to start duplicate agent instance (Active PID: ${lock.pid}).`);
    process.exit(0);
  }

  const engine = new BackupEngine();
  const intervalMs = config.intervalSeconds
    ? config.intervalSeconds * 1000
    : config.intervalMinutes * 60 * 1000;
  const intervalDisplay = config.intervalSeconds
    ? `${config.intervalSeconds} seconds`
    : `${config.intervalMinutes} minutes`;

  console.clear();
  console.log('========================================');
  console.log('   DARAJATAK-ENDANA BACKUP AGENT');
  console.log('========================================');
  console.log(`PID:              ${process.pid}`);
  console.log(`Backup Directory: ${config.root}`);
  console.log(`Bucket:           ${config.bucket}`);
  console.log(`Interval:         ${intervalDisplay}`);
  console.log(`Concurrency:      ${config.concurrency}`);
  console.log(`Status:           RUNNING`);
  console.log('========================================\n');

  logger.info(`[AGENT] Backup Agent daemon started (PID: ${process.pid}, Interval: ${intervalDisplay}).`);

  updateAgentState({
    status: 'RUNNING',
    pid: process.pid,
    startedAt: new Date().toISOString(),
    interval: intervalDisplay,
    concurrency: config.concurrency,
    lastSyncAttemptAt: null,
    lastSuccessfulSyncAt: null,
    totalSyncCycles: 0,
    totalDownloaded: 0,
    totalSkipped: 0,
    totalErrors: 0,
    lastError: null
  });

  let totalCycles = 0;
  let totalDownloadedCount = 0;
  let totalSkippedCount = 0;
  let totalErrorCount = 0;

  const runCycle = async () => {
    if (isCycleActive) {
      logger.warn('[AGENT] Previous cycle is still running. Skipping trigger.');
      return;
    }

    isCycleActive = true;
    totalCycles++;
    const now = new Date();
    const nextSync = new Date(now.getTime() + intervalMs);

    logger.info(`[AGENT] Starting sync cycle #${totalCycles} at ${formatDateTime(now)}...`);
    updateAgentState({
      lastSyncAttemptAt: now.toISOString(),
      currentCycle: totalCycles
    });

    try {
      const { stats } = await engine.runBackup({ dryRun: false });
      totalDownloadedCount += (stats.downloaded || 0);
      totalSkippedCount += (stats.skipped || 0);

      updateAgentState({
        lastSuccessfulSyncAt: new Date().toISOString(),
        totalSyncCycles: totalCycles,
        totalDownloaded: totalDownloadedCount,
        totalSkipped: totalSkippedCount,
        lastCycleDownloaded: stats.downloaded,
        lastCycleSkipped: stats.skipped,
        lastCycleObjects: stats.totalObjects,
        nextScheduledSyncAt: nextSync.toISOString()
      });

      logger.info(`[AGENT] Sync cycle #${totalCycles} completed successfully. Next sync: ${formatDateTime(nextSync)}`);
    } catch (err) {
      totalErrorCount++;
      logger.error(`[AGENT] Sync cycle #${totalCycles} encountered an error: ${err.message}`, err);
      updateAgentState({
        totalErrors: totalErrorCount,
        lastError: err.message,
        lastErrorAt: new Date().toISOString()
      });
    } finally {
      isCycleActive = false;
    }
  };

  // Run immediately on launch
  await runCycle();

  // Schedule recurring interval
  const timer = setInterval(runCycle, intervalMs);

  // Health Monitoring check every 2 minutes
  const healthTimer = setInterval(() => {
    const status = require('./lock').getAgentStatusInfo();
    const lastSuccess = status.stateData?.lastSuccessfulSyncAt;
    if (lastSuccess) {
      const elapsedMinutes = (Date.now() - new Date(lastSuccess).getTime()) / (60 * 1000);
      const thresholdMinutes = (config.intervalMinutes * 3) + 2;
      if (elapsedMinutes > thresholdMinutes) {
        logger.warn(`[AGENT][HEALTH_WARNING] Backup Agent has not completed a successful sync for ${elapsedMinutes.toFixed(1)} minutes (Threshold: ${thresholdMinutes}m).`);
      }
    }
  }, 2 * 60 * 1000);

  const shutdown = () => {
    logger.info(`[AGENT] Received termination signal. Stopping Backup Agent safely (PID: ${process.pid})...`);
    clearInterval(timer);
    clearInterval(healthTimer);
    updateAgentState({
      status: 'STOPPED',
      stoppedAt: new Date().toISOString()
    });
    releaseAgentLock();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    releaseAgentLock();
  });
}

if (require.main === module) {
  startAgent();
}

module.exports = {
  startAgent
};
