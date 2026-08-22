#!/usr/bin/env node
const config = require('./config');
const logger = require('./logger');
const { runDatabaseBackup } = require('./backup');
const { runVerify } = require('./verify');
const { runRestore } = require('./restore');
const { applyRetentionPolicy } = require('./cleanup');
const { showDatabaseStatus } = require('./status');
const { startDatabaseAgent } = require('./scheduler');
const { loadManifest } = require('./manifest');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const targetUrlFlag = args.find(a => a.startsWith('--target-url='));
const targetUrl = targetUrlFlag ? targetUrlFlag.split('=')[1] : null;
const fileFlag = args.find(a => a.startsWith('--file='));
const targetFile = fileFlag ? fileFlag.split('=')[1] : null;

const filteredArgs = args.filter(a => !a.startsWith('--'));
const command = filteredArgs[0] || 'backup';

async function main() {
  try {
    switch (command) {
      case 'backup':
      case 'full': {
        await runDatabaseBackup({ type: 'full', dryRun: isDryRun });
        break;
      }
      case 'agent':
      case 'daemon': {
        await startDatabaseAgent();
        break;
      }
      case 'status':
      case 'info': {
        await showDatabaseStatus();
        break;
      }
      case 'verify':
      case 'check': {
        const res = await runVerify();
        if (!res.isHealthy) process.exitCode = 1;
        break;
      }
      case 'list': {
        const manifest = loadManifest();
        const backups = manifest.backups || [];
        console.log('====================================================');
        console.log('       DARAJATAK-ENDANA DATABASE BACKUP LIST');
        console.log('====================================================');
        if (backups.length === 0) {
          console.log('No database backups recorded yet.');
        } else {
          backups.forEach((b, i) => {
            console.log(`[${i + 1}] ${b.filename}`);
            console.log(`    Type:       ${b.type}`);
            console.log(`    Size:       ${b.sizeMb} MB`);
            console.log(`    Created:    ${b.createdAt}`);
            console.log(`    SHA-256:    ${b.sha256}`);
            console.log(`    Status:     ${b.status}`);
            console.log('----------------------------------------------------');
          });
        }
        break;
      }
      case 'cleanup': {
        applyRetentionPolicy();
        break;
      }
      case 'restore': {
        await runRestore({
          dryRun: isDryRun,
          targetDatabaseUrl: targetUrl,
          file: targetFile,
          force: isForce
        });
        break;
      }
      default:
        console.log(`
Usage: node src/database-backup/cli.js [command] [options]

Commands:
  backup    Create a full Custom Format (-Fc) PostgreSQL backup
  agent     Start the periodic Database Backup Agent daemon
  status    Show Agent PID, state, backup counts, and latest stats
  verify    Check integrity of all backups (pg_restore --list & SHA-256)
  list      List all tracked database backups in manifest
  cleanup   Apply retention policy (7 daily, 4 weekly, 12 monthly)
  restore   Restore a backup to a target database

Options:
  --dry-run                 Simulate operation without writing
  --force                   Bypass interactive confirmation prompt
  --target-url=<url>        Specify target database connection URL
  --file=<filename/path>    Specify exact backup file to restore
`);
    }
  } catch (err) {
    logger.error(`Fatal CLI Error executing '${command}':`, err.message);
    process.exit(1);
  }
}

main();
