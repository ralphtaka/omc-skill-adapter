import { readFileSync } from 'fs';
import { loadConfig, loadTriggerMap } from './config.js';
import { resolveGlob } from './finder.js';
import { computeFingerprint, readFingerprint, writeFingerprint, deleteFingerprint, listFingerprintSources } from './fingerprint.js';
import { parseExternalSkill } from './parser.js';
import { buildGeneratedSkill, renderSkillFile, slugify } from './transformer.js';
import { writeSkill, reconcile } from './writer.js';
import type { SyncResult } from './types.js';

export interface SyncOptions {
  dryRun?: boolean;
  quiet?: boolean;
  configPath?: string;
  force?: boolean;
}

export function runSync(opts: SyncOptions = {}): SyncResult[] {
  const { dryRun = false, quiet = false, configPath, force = false } = opts;
  const config = loadConfig(configPath);
  const results: SyncResult[] = [];
  const expectedIds = new Set<string>();

  const enabledSources = config.sources.filter(s => s.enabled);

  for (const source of enabledSources) {
    const paths = resolveGlob(source.glob);
    const sig = computeFingerprint(paths);
    const oldSig = force ? '' : readFingerprint(source.name);

    // Always build expected set from current source state
    for (const p of paths) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const { meta, valid } = parseExternalSkill(raw);
        if (valid) expectedIds.add(`${source.prefix}-${slugify(meta.name)}`);
      } catch { /* skip */ }
    }

    if (sig === oldSig) {
      results.push({ sourceName: source.name, written: 0, unchanged: paths.length, pruned: 0, skipped: true });
      if (!quiet) console.log(`[omc-skill-adapter] ${source.name}: up-to-date (${paths.length} skills)`);
      continue;
    }

    // Rebuild this source
    const triggerMap = loadTriggerMap(source.triggers, configPath);
    let written = 0;

    for (const p of paths) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const { meta, body, valid } = parseExternalSkill(raw);
        if (!valid) continue;

        const skill = buildGeneratedSkill(meta, body, p, source.name, source.prefix, triggerMap);
        const content = renderSkillFile(skill);
        writeSkill(skill, content, dryRun);
        written++;
      } catch (e) {
        if (!quiet) console.warn(`[omc-skill-adapter] Warning: failed to process ${p}: ${e}`);
      }
    }

    if (!dryRun) writeFingerprint(source.name, sig);

    results.push({ sourceName: source.name, written, unchanged: 0, pruned: 0, skipped: false });
    if (!quiet) {
      console.log(`[omc-skill-adapter] ${source.name}: wrote ${written} skills${dryRun ? ' [dry-run]' : ''}`);
    }
  }

  // Phase 2: reconcile orphans
  const orphans = reconcile(expectedIds, dryRun);
  if (orphans.length > 0 && !quiet) {
    console.log(`[omc-skill-adapter] pruned ${orphans.length} orphan skills${dryRun ? ' [dry-run]' : ''}: ${orphans.join(', ')}`);
  }

  // Clean stale fingerprints for removed/disabled sources
  const enabledNames = new Set(enabledSources.map(s => s.name));
  for (const name of listFingerprintSources()) {
    if (!enabledNames.has(name)) {
      if (!dryRun) deleteFingerprint(name);
      if (!quiet) console.log(`[omc-skill-adapter] removed stale fingerprint: ${name}`);
    }
  }

  return results;
}

export function runPrune(opts: SyncOptions = {}): string[] {
  const { dryRun = false, quiet = false, configPath } = opts;
  const config = loadConfig(configPath);

  const expectedIds = new Set<string>();
  for (const source of config.sources.filter(s => s.enabled)) {
    const paths = resolveGlob(source.glob);
    for (const p of paths) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const { meta, valid } = parseExternalSkill(raw);
        if (valid) expectedIds.add(`${source.prefix}-${slugify(meta.name)}`);
      } catch { /* skip */ }
    }
  }

  const orphans = reconcile(expectedIds, dryRun);
  if (!quiet) {
    if (orphans.length === 0) {
      console.log('[omc-skill-adapter] prune: no orphans found');
    } else {
      console.log(`[omc-skill-adapter] pruned ${orphans.length} orphans${dryRun ? ' [dry-run]' : ''}: ${orphans.join(', ')}`);
    }
  }
  return orphans;
}
