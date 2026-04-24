import { createHash } from 'crypto';
import { statSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const FINGERPRINT_DIR = join(homedir(), '.omc', '.skill-adapter');

export function fingerprintDir(): string {
  return FINGERPRINT_DIR;
}

function fingerprintFile(sourceName: string): string {
  return join(FINGERPRINT_DIR, `${sourceName}.hash`);
}

export function computeFingerprint(filePaths: string[]): string {
  const sorted = [...filePaths].sort();
  const entries = sorted.map(p => {
    try {
      const s = statSync(p);
      return `${p}:${s.mtimeMs}:${s.size}`;
    } catch {
      return `${p}:missing`;
    }
  });
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

export function readFingerprint(sourceName: string): string {
  const file = fingerprintFile(sourceName);
  if (!existsSync(file)) return '';
  try {
    return readFileSync(file, 'utf-8').trim();
  } catch {
    return '';
  }
}

export function writeFingerprint(sourceName: string, hash: string): void {
  mkdirSync(FINGERPRINT_DIR, { recursive: true });
  writeFileSync(fingerprintFile(sourceName), hash + '\n', 'utf-8');
}

export function deleteFingerprint(sourceName: string): void {
  const file = fingerprintFile(sourceName);
  if (existsSync(file)) {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

export function listFingerprintSources(): string[] {
  if (!existsSync(FINGERPRINT_DIR)) return [];
  try {
    return readdirSync(FINGERPRINT_DIR)
      .filter(f => f.endsWith('.hash'))
      .map(f => f.slice(0, -5));
  } catch {
    return [];
  }
}
