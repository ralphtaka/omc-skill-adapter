import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readAdapterMarker } from './parser.js';
import type { GeneratedSkill } from './types.js';

export const SKILLS_DIR = join(homedir(), '.omc', 'skills');

export function skillDir(prefixedId: string): string {
  return join(SKILLS_DIR, prefixedId);
}

export function writeSkill(skill: GeneratedSkill, content: string, dryRun = false): void {
  const dir = skillDir(skill.prefixedId);
  if (!dryRun) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  }
}

/**
 * Delete all skill dirs that belong to `sourceName` (by adapter marker).
 */
export function pruneSourceSkills(sourceName: string, dryRun = false): string[] {
  const pruned: string[] = [];
  if (!existsSync(SKILLS_DIR)) return pruned;

  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    try {
      const raw = readFileSync(skillFile, 'utf-8');
      const marker = readAdapterMarker(raw);
      if (marker?.source === sourceName) {
        pruned.push(entry.name);
        if (!dryRun) rmSync(join(SKILLS_DIR, entry.name), { recursive: true, force: true });
      }
    } catch { /* unreadable, skip */ }
  }

  return pruned;
}

/**
 * Reconcile: remove any adapter-managed skills whose prefixedId is not in expectedIds.
 */
export function reconcile(expectedIds: Set<string>, dryRun = false): string[] {
  const orphans: string[] = [];
  if (!existsSync(SKILLS_DIR)) return orphans;

  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    try {
      const raw = readFileSync(skillFile, 'utf-8');
      const marker = readAdapterMarker(raw);
      if (!marker) continue; // not adapter-managed, never touch

      if (!expectedIds.has(entry.name)) {
        orphans.push(entry.name);
        if (!dryRun) rmSync(join(SKILLS_DIR, entry.name), { recursive: true, force: true });
      }
    } catch { /* skip */ }
  }

  return orphans;
}
