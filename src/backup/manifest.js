const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');

class ManifestManager {
  constructor() {
    this.manifestPath = config.manifestPath;
    this.failuresPath = config.failuresPath;
  }

  loadManifest() {
    config.ensureDirectories();
    if (!fs.existsSync(this.manifestPath)) {
      return {
        version: '1.0.0',
        bucket: config.bucket,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        totalFiles: 0,
        totalSize: 0,
        files: {} // key: relative path, e.g. "motorcycles/xxx.jpg"
      };
    }
    try {
      const data = fs.readFileSync(this.manifestPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      logger.error(`Error reading manifest file, creating backup of damaged manifest: ${e.message}`);
      const backupPath = `${this.manifestPath}.damaged.${Date.now()}`;
      try { fs.copyFileSync(this.manifestPath, backupPath); } catch (_) {}
      return {
        version: '1.0.0',
        bucket: config.bucket,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        totalFiles: 0,
        totalSize: 0,
        files: {}
      };
    }
  }

  saveManifest(manifest) {
    config.ensureDirectories();
    manifest.lastUpdatedAt = new Date().toISOString();
    
    // Recalculate summary stats
    const fileEntries = Object.values(manifest.files || {});
    manifest.totalFiles = fileEntries.length;
    manifest.totalSize = fileEntries.reduce((acc, cur) => acc + (cur.size || 0), 0);

    const serialized = JSON.stringify(manifest, null, 2);
    
    // Atomic Write
    const tempPath = `${this.manifestPath}.tmp.${crypto.randomBytes(4).toString('hex')}`;
    try {
      fs.writeFileSync(tempPath, serialized, 'utf8');
      fs.renameSync(tempPath, this.manifestPath);
    } catch (e) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      throw e;
    }
  }

  loadFailures() {
    config.ensureDirectories();
    if (!fs.existsSync(this.failuresPath)) {
      return { failures: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.failuresPath, 'utf8'));
    } catch (e) {
      return { failures: {} };
    }
  }

  recordFailure(pathKey, errorMsg, attempts = 1) {
    config.ensureDirectories();
    const failuresObj = this.loadFailures();
    failuresObj.failures[pathKey] = {
      path: pathKey,
      filename: path.basename(pathKey),
      error: String(errorMsg).slice(0, 500),
      attempts: (failuresObj.failures[pathKey]?.attempts || 0) + attempts,
      lastAttemptAt: new Date().toISOString()
    };

    const tempPath = `${this.failuresPath}.tmp.${crypto.randomBytes(4).toString('hex')}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(failuresObj, null, 2), 'utf8');
      fs.renameSync(tempPath, this.failuresPath);
    } catch (e) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
    }
  }

  removeFailure(pathKey) {
    config.ensureDirectories();
    const failuresObj = this.loadFailures();
    if (failuresObj.failures && failuresObj.failures[pathKey]) {
      delete failuresObj.failures[pathKey];
      const tempPath = `${this.failuresPath}.tmp.${crypto.randomBytes(4).toString('hex')}`;
      try {
        fs.writeFileSync(tempPath, JSON.stringify(failuresObj, null, 2), 'utf8');
        fs.renameSync(tempPath, this.failuresPath);
      } catch (_) {}
    }
  }
}

module.exports = new ManifestManager();
