const fs = require('fs');
const path = require('path');

function findPostgresTool(toolName) {
  const exeName = process.platform === 'win32' ? `${toolName}.exe` : toolName;

  // 1. Check custom path from env
  const envKey = `POSTGRES_${toolName.toUpperCase()}_PATH`;
  if (process.env[envKey] && fs.existsSync(process.env[envKey])) {
    return process.env[envKey];
  }

  // 2. Known standard paths on Windows (PostgreSQL 18, 17, 16, 15)
  const candidateDirs = [
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    'C:\\Program Files\\PostgreSQL\\15\\bin',
    'C:\\Program Files (x86)\\PostgreSQL\\18\\bin',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin',
    'C:\\PostgreSQL\\bin'
  ];

  for (const dir of candidateDirs) {
    const fullPath = path.join(dir, exeName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // 3. Fallback to binary in PATH
  return toolName;
}

module.exports = {
  findPostgresTool
};
