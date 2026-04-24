import { readdirSync, statSync, existsSync } from 'fs';
import { join, normalize, sep } from 'path';
import { homedir } from 'os';

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/**
 * Recursively find all SKILL.md files under the given directory.
 */
function findSkillMdsInDir(dir: string, results: string[], depth = 0): void {
  if (depth > 10 || !existsSync(dir)) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        findSkillMdsInDir(full, results, depth + 1);
      } else if (e.isFile() && e.name === 'SKILL.md') {
        results.push(full);
      }
    }
  } catch { /* skip unreadable dirs */ }
}

// Resolve a glob pattern into a list of SKILL.md paths.
// Supported form: /some/fixed/path/DOUBLE_STAR/skills/STAR/SKILL.md
// Walks from the longest fixed prefix before the first wildcard segment.
export function resolveGlob(globPattern: string): string[] {
  const expanded = expandHome(globPattern);

  // Find the index of the first wildcard segment
  const parts = expanded.split(sep === '\\' ? '\\' : '/');
  const starIdx = parts.findIndex(p => p.includes('*'));

  if (starIdx === -1) {
    // No wildcard — treat as literal path
    return existsSync(expanded) ? [expanded] : [];
  }

  // Walk from the fixed prefix
  const fixedPrefix = parts.slice(0, starIdx).join('/') || '/';
  const results: string[] = [];
  findSkillMdsInDir(fixedPrefix, results);
  return results;
}

/**
 * Given a list of already-found SKILL.md paths, check if they're still accessible.
 */
export function filterExisting(paths: string[]): string[] {
  return paths.filter(p => {
    try { statSync(p); return true; } catch { return false; }
  });
}
