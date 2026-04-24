import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, DEFAULT_CONFIG_PATH } from './config.js';
import { resolveGlob } from './finder.js';
import { readFingerprint, listFingerprintSources } from './fingerprint.js';
import { runSync, runPrune } from './sync.js';

const VERSION = process.env.npm_package_version ?? '0.1.0';

function printHelp(): void {
  console.log(`omc-skill-adapter v${VERSION}

Usage:
  omc-skill-adapter sync [--dry-run] [--quiet] [--force] [--config PATH]
  omc-skill-adapter prune [--dry-run] [--quiet] [--config PATH]
  omc-skill-adapter status [--config PATH]
  omc-skill-adapter help

Commands:
  sync     Transform and sync external skills → ~/.omc/skills/ (default)
  prune    Remove orphan skills without syncing
  status   Show source status and fingerprint cache
  help     Show this help

Options:
  --dry-run   Show what would change, don't write
  --quiet     Suppress progress output (exit code still signals errors)
  --force     Ignore fingerprint cache, rebuild all
  --config    Path to skill-sources.yaml (default: ~/.omc/skill-sources.yaml)
`);
}

function parseArgs(args: string[]): {
  command: string;
  dryRun: boolean;
  quiet: boolean;
  force: boolean;
  configPath: string;
} {
  let command = 'sync';
  let dryRun = false;
  let quiet = false;
  let force = false;
  let configPath = DEFAULT_CONFIG_PATH;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'sync' || a === 'prune' || a === 'status' || a === 'help') {
      command = a;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--force') {
      force = true;
    } else if (a === '--config' && args[i + 1]) {
      configPath = args[++i];
    }
  }

  return { command, dryRun, quiet, force, configPath };
}

function runStatus(configPath: string): void {
  const config = loadConfig(configPath);

  if (config.sources.length === 0) {
    console.log(`Config: ${configPath} (${existsSync(configPath) ? 'found' : 'not found — using defaults'})`);
    console.log('No sources configured.');
    return;
  }

  console.log(`Config: ${configPath}\n`);
  for (const source of config.sources) {
    const paths = resolveGlob(source.glob);
    const cached = readFingerprint(source.name);
    const status = source.enabled ? (cached ? 'synced' : 'not synced') : 'disabled';
    console.log(`  ${source.enabled ? '✓' : '✗'} ${source.name} (prefix: ${source.prefix})`);
    console.log(`    glob: ${source.glob}`);
    console.log(`    skills found: ${paths.length}`);
    console.log(`    status: ${status}`);
  }

  const stale = listFingerprintSources().filter(n => !config.sources.find(s => s.name === n));
  if (stale.length > 0) {
    console.log(`\nStale fingerprints (run prune to clean): ${stale.join(', ')}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, dryRun, quiet, force, configPath } = parseArgs(args);

  if (command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (command === 'status') {
    runStatus(configPath);
    process.exit(0);
  }

  if (command === 'prune') {
    runPrune({ dryRun, quiet, configPath });
    process.exit(0);
  }

  // Default: sync
  try {
    runSync({ dryRun, quiet, force, configPath });
    process.exit(0);
  } catch (e) {
    console.error(`[omc-skill-adapter] Error: ${e}`);
    process.exit(1);
  }
}

main();
