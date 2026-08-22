const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

function isPidRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function acquireDatabaseAgentLock() {
  config.ensureDirectories();
  const lockFile = config.lockPath;

  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      const existingPid = lockData.pid;

      if (existingPid && isPidRunning(existingPid)) {
        return {
          acquired: false,
          pid: existingPid,
          startedAt: lockData.startedAt
        };
      }
      
      logger.warn(`[DB_AGENT] Detected stale database lock from PID ${existingPid}. Reclaiming lock.`);
      try { fs.unlinkSync(lockFile); } catch (_) {}
    } catch (err) {
      logger.warn(`[DB_AGENT] Corrupted lock file detected, resetting: ${err.message}`);
      try { fs.unlinkSync(lockFile); } catch (_) {}
    }
  }

  const currentLock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: require('os').hostname(),
    platform: process.platform,
    nodeVersion: process.version
  };

  try {
    fs.writeFileSync(lockFile, JSON.stringify(currentLock, null, 2), 'utf8');
    return {
      acquired: true,
      pid: process.pid,
      startedAt: currentLock.startedAt
    };
  } catch (err) {
    logger.error(`[DB_AGENT] Failed to write lock file: ${err.message}`);
    return {
      acquired: false,
      error: err.message
    };
  }
}

function releaseDatabaseAgentLock() {
  const lockFile = config.lockPath;
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (lockData.pid === process.pid) {
        fs.unlinkSync(lockFile);
        logger.info('[DB_AGENT] Database lock released successfully.');
      }
    } catch (_) {
      try { fs.unlinkSync(lockFile); } catch (_) {}
    }
  }
}

function updateDatabaseAgentState(stateUpdates) {
  config.ensureDirectories();
  const stateFile = config.statePath;
  let currentState = {};

  if (fs.existsSync(stateFile)) {
    try {
      currentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (_) {}
  }

  const newState = {
    ...currentState,
    ...stateUpdates,
    updatedAt: new Date().toISOString()
  };

  try {
    const tempFile = `${stateFile}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(newState, null, 2), 'utf8');
    fs.renameSync(tempFile, stateFile);
  } catch (err) {
    logger.warn(`[DB_AGENT] Failed to update database-agent-state.json: ${err.message}`);
  }
}

function getDatabaseAgentStatusInfo() {
  config.ensureDirectories();
  const lockFile = config.lockPath;
  const stateFile = config.statePath;

  let isRunning = false;
  let pid = null;
  let lockData = null;
  let stateData = null;

  if (fs.existsSync(lockFile)) {
    try {
      lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (lockData.pid && isPidRunning(lockData.pid)) {
        isRunning = true;
        pid = lockData.pid;
      }
    } catch (_) {}
  }

  if (fs.existsSync(stateFile)) {
    try {
      stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (_) {}
  }

  return {
    isRunning,
    pid,
    lockData,
    stateData
  };
}

module.exports = {
  isPidRunning,
  acquireDatabaseAgentLock,
  releaseDatabaseAgentLock,
  updateDatabaseAgentState,
  getDatabaseAgentStatusInfo
};
