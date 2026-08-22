const config = require('./config');
const { loadManifest } = require('./manifest');
const { getDatabaseAgentStatusInfo } = require('./lock');

async function showDatabaseStatus() {
  config.ensureDirectories();
  const info = getDatabaseAgentStatusInfo();
  const manifest = loadManifest();
  const state = info.stateData || {};
  const backups = manifest.backups || [];

  const latestBackup = backups[0] || null;

  const dailyCount = backups.filter(b => b.type === 'daily').length;
  const weeklyCount = backups.filter(b => b.type === 'weekly').length;
  const monthlyCount = backups.filter(b => b.type === 'monthly').length;
  const fullCount = backups.filter(b => b.type === 'full').length;

  console.log('====================================================');
  console.log('      DARAJATAK-ENDANA DATABASE BACKUP STATUS');
  console.log('====================================================');
  console.log(`Agent Process Status:  ${info.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
  console.log(`PID:                   ${info.pid || (info.isRunning ? state.pid : 'N/A')}`);
  console.log(`Started At:            ${state.startedAt || 'N/A'}`);
  console.log(`Interval:              ${state.interval || (config.intervalMinutes + ' minutes')}`);
  console.log('----------------------------------------------------');
  console.log(`Last Backup Attempt:   ${state.lastBackupAttemptAt || 'N/A'}`);
  console.log(`Last Successful Backup:${latestBackup ? latestBackup.createdAt : (state.lastSuccessfulBackupAt || 'N/A')}`);
  console.log(`Latest Backup File:    ${latestBackup ? latestBackup.filename : 'None'}`);
  console.log(`Latest Backup Size:    ${latestBackup ? latestBackup.sizeMb + ' MB' : 'N/A'}`);
  console.log(`Latest SHA-256:        ${latestBackup ? latestBackup.sha256 : 'N/A'}`);
  console.log('----------------------------------------------------');
  console.log(`Backups Tracked:`);
  console.log(`  - Full:              ${fullCount}`);
  console.log(`  - Daily:             ${dailyCount}`);
  console.log(`  - Weekly:            ${weeklyCount}`);
  console.log(`  - Monthly:           ${monthlyCount}`);
  console.log(`  - Total:             ${backups.length}`);
  console.log('----------------------------------------------------');
  console.log(`Total Cycles Run:      ${state.totalCycles || 0}`);
  console.log(`Total Errors:          ${state.totalErrors || 0}`);
  if (state.lastError) {
    console.log(`Last Error:            ⚠️  ${state.lastError} (${state.lastErrorAt || 'N/A'})`);
  }
  console.log(`Backup Directory:      ${config.root}`);
  console.log('====================================================\n');

  return {
    isRunning: info.isRunning,
    pid: info.pid,
    latestBackup,
    totalBackups: backups.length,
    state
  };
}

module.exports = {
  showDatabaseStatus
};
