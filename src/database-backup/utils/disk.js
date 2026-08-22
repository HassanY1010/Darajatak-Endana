const { execSync } = require('child_process');
const path = require('path');

function checkFreeDiskSpaceMb(dirPath) {
  try {
    const rootDrive = path.parse(path.resolve(dirPath)).root.replace('\\', '');
    
    if (process.platform === 'win32') {
      const output = execSync(`powershell -NoProfile -Command "Get-PSDrive -Name '${rootDrive.replace(':', '')}' | Select-Object -ExpandProperty Free"`, {
        encoding: 'utf8',
        timeout: 5000
      });
      const freeBytes = parseInt(output.trim(), 10);
      if (!isNaN(freeBytes)) {
        return Math.floor(freeBytes / (1024 * 1024));
      }
    }
    return 10240; // Default safe fallback 10GB if unable to determine
  } catch (err) {
    return 10240;
  }
}

module.exports = {
  checkFreeDiskSpaceMb
};
