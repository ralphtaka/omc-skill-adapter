import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseExternalSkill, readAdapterMarker } from '../src/parser.js';

const fix = (name: string) => readFileSync(join('test/fixtures', name), 'utf-8');

describe('parseExternalSkill', () => {
  it('parses valid external skill', () => {
    const { meta, body, valid } = parseExternalSkill(fix('external-valid.md'));
    expect(valid).toBe(true);
    expect(meta.name).toBe('spec-driven-development');
    expect(meta.description).toContain('structured specification');
    expect(body).toContain('## Overview');
  });

  it('rejects skill missing description', () => {
    const { valid, error } = parseExternalSkill(fix('external-missing-description.md'));
    expect(valid).toBe(false);
    expect(error).toMatch(/description/i);
  });

  it('rejects content with no frontmatter', () => {
    const { valid, error } = parseExternalSkill('no frontmatter here');
    expect(valid).toBe(false);
    expect(error).toMatch(/frontmatter/i);
  });
});

describe('readAdapterMarker', () => {
  it('reads marker from generated skill', () => {
    const marker = readAdapterMarker(fix('generated-with-marker.md'));
    expect(marker).not.toBeNull();
    expect(marker!.source).toBe('addy-agent-skills');
    expect(marker!.originSkill).toBe('spec-driven-development');
  });

  it('returns null for user-written skill (no adapter block)', () => {
    const marker = readAdapterMarker(fix('user-written-no-marker.md'));
    expect(marker).toBeNull();
  });

  it('returns null for content with no frontmatter', () => {
    expect(readAdapterMarker('just body text')).toBeNull();
  });
});
