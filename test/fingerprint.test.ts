import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { computeFingerprint } from '../src/fingerprint.js';

describe('computeFingerprint', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `fp-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns consistent hash for same files', () => {
    const f1 = join(tmpDir, 'a.md');
    writeFileSync(f1, 'content');
    const h1 = computeFingerprint([f1]);
    const h2 = computeFingerprint([f1]);
    expect(h1).toBe(h2);
  });

  it('returns different hash when file list changes', () => {
    const f1 = join(tmpDir, 'a.md');
    const f2 = join(tmpDir, 'b.md');
    writeFileSync(f1, 'content');
    writeFileSync(f2, 'content');
    const h1 = computeFingerprint([f1]);
    const h2 = computeFingerprint([f1, f2]);
    expect(h1).not.toBe(h2);
  });

  it('returns same hash regardless of input order', () => {
    const f1 = join(tmpDir, 'a.md');
    const f2 = join(tmpDir, 'b.md');
    writeFileSync(f1, 'c1');
    writeFileSync(f2, 'c2');
    const h1 = computeFingerprint([f1, f2]);
    const h2 = computeFingerprint([f2, f1]);
    expect(h1).toBe(h2);
  });

  it('returns hash for empty list', () => {
    const h = computeFingerprint([]);
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });

  it('handles missing files gracefully', () => {
    const h = computeFingerprint(['/nonexistent/path/SKILL.md']);
    expect(typeof h).toBe('string');
  });
});
