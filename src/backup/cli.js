#!/usr/bin/env node
const config = require('./config');
const logger = require('./logger');
const { BackupEngine } = require('./engine');
const { runVerify } = require('./verify');
const { runAudit } = require('./audit');
const { runRestore } = require('./restore');
const { startAgent } = require('./agent');
const { showAgentStatus } = require('./status');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const filteredArgs = args.filter(a => !a.startsWith('--'));
const command = filteredArgs[0] || 'backup';

async function main() {
  try {
    switch (command) {
      case 'backup':
      case 'sync': {
        const engine = new BackupEngine();
        await engine.runBackup({ dryRun: isDryRun });
        break;
      }
      case 'agent':
      case 'daemon': {
        await startAgent();
        break;
      }
      case 'status':
      case 'info': {
        await showAgentStatus();
        break;
      }
      case 'verify':
      case 'check': {
        const result = await runVerify();
        if (!result.isHealthy) {
          process.exitCode = 1;
        }
        break;
      }
      case 'audit': {
        await runAudit();
        break;
      }
      case 'restore': {
        await runRestore({ dryRun: isDryRun });
        break;
      }
      default:
        console.log(`
Usage: node src/backup/cli.js [command] [options]

Commands:
  backup    Perform Full / Incremental backup of Supabase images to local disk
  agent     Start the standalone background synchronization daemon
  status    Display real-time Agent status, PID, cycles, and disk metrics
  verify    Verify local file integrity (SHA-256, sizes, manifest)
  audit     Compare remote Supabase storage vs local backup
  restore   Restore local backup images to a new Supabase project

Options:
  --dry-run Simulate execution without downloading, writing, or uploading files
`);
    }

  } catch (err) {
    logger.error(`Fatal CLI Error executing command '${command}':`, err);
    process.exit(1);
  }
}

main();
