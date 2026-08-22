const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const manifestManager = require('./manifest');
const { getAgentStatusInfo } = require('./lock');

async function showAgentStatus() {
  config.ensureDirectories();
  const info = getAgentStatusInfo();
  const manifest = manifestManager.loadManifest();
  const state = info.stateData || {};

  const totalFiles = Object.keys(manifest.files || {}).length;
  const totalSizeMb = ((manifest.totalSize || 0) / (1024 * 1024)).toFixed(2);

  // Local files on disk
  const diskFiles = fs.existsSync(config.targetBucketDir)
    ? fs.readdirSync(config.targetBucketDir).filter(f => !f.startsWith('.partial') && !f.startsWith('.tmp')).length
    : 0;

  console.log('====================================================');
  console.log('      DARAJATAK-ENDANA BACKUP AGENT STATUS');
  console.log('====================================================');
  console.log(`Agent Process Status:  ${info.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
  console.log(`PID:                   ${info.pid || (info.isRunning ? state.pid : 'N/A')}`);
  console.log(`Started At:            ${state.startedAt || 'N/A'}`);
  console.log(`Sync Interval:         ${state.interval || (config.intervalMinutes + ' minutes')}`);
  console.log(`Concurrency:           ${config.concurrency}`);
  console.log('----------------------------------------------------');
  console.log(`Last Sync Attempt:     ${state.lastSyncAttemptAt || 'N/A'}`);
  console.log(`Last Successful Sync:  ${state.lastSuccessfulSyncAt || 'N/A'}`);
  console.log(`Total Sync Cycles:     ${state.totalSyncCycles || 0}`);
  console.log(`Total Images Downloaded: ${state.totalDownloaded || 0}`);
  console.log(`Total Images Skipped:    ${state.totalSkipped || 0}`);
  console.log(`Total Errors:          ${state.totalErrors || 0}`);
  if (state.lastError) {
    console.log(`Last Error:            ⚠️  ${state.lastError} (${state.lastErrorAt || 'N/A'})`);
  }
  console.log('----------------------------------------------------');
  console.log(`Backup Directory:      ${config.root}`);
  console.log(`Target Bucket:         ${config.bucket}`);
  console.log(`Manifest Total Files:  ${totalFiles}`);
  console.log(`Disk Total Files:      ${diskFiles}`);
  console.log(`Total Backup Size:     ${totalSizeMb} MB`);
  console.log('====================================================');

  return {
    isRunning: info.isRunning,
    pid: info.pid,
    state,
    totalFiles,
    diskFiles,
    totalSizeMb
  };
}

module.exports = {
  showAgentStatus
};
