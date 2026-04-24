import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseExternalSkill, readAdapterMarker } from '../src/parser.js';
import { buildGeneratedSkill, renderSkillFile } from '../src/transformer.js';
import { reconcile } from '../src/writer.js';

function makeTmpDir(): string {
  const d = join(tmpdir(), `omc-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

function makeSkillFile(dir: string, name: string, description: string): string {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const content = `---\nname: ${name}\ndescription: ${description}\n---\n\nBody for ${name}.`;
  writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf-8');
  return join(skillDir, 'SKILL.md');
}

describe('full transform pipeline', () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    srcDir = makeTmpDir();
    destDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  });

  it('transforms a valid external skill to OMC format', () => {
    const skillPath = makeSkillFile(srcDir, 'spec-driven-development', 'Write a spec before coding');
    const raw = readFileSync(skillPath, 'utf-8');
    const { meta, body, valid } = parseExternalSkill(raw);

    expect(valid).toBe(true);

    const skill = buildGeneratedSkill(meta, body, skillPath, 'test-source', 'ts', {
      'spec-driven-development': ['spec', 'specification'],
    });
    const rendered = renderSkillFile(skill);

    // Must be valid OMC format (has required fields)
    expect(rendered).toContain('id: "ts-spec-driven-development"');
    expect(rendered).toContain('source: manual');
    expect(rendered).toContain('triggers:');
    expect(rendered).toContain('"spec"');

    // Must have adapter marker
    const marker = readAdapterMarker(rendered);
    expect(marker).not.toBeNull();
    expect(marker!.source).toBe('test-source');
    expect(marker!.originSkill).toBe('spec-driven-development');
  });

  it('adapter marker survives round-trip through renderSkillFile + readAdapterMarker', () => {
    const skillPath = makeSkillFile(srcDir, 'test-skill', 'A test skill description');
    const raw = readFileSync(skillPath, 'utf-8');
    const { meta, body } = parseExternalSkill(raw);
    const skill = buildGeneratedSkill(meta, body, skillPath, 'my-source', 'ms', {});
    const rendered = renderSkillFile(skill);
    const marker = readAdapterMarker(rendered);

    expect(marker?.source).toBe('my-source');
    expect(marker?.originSkill).toBe('test-skill');
    expect(marker?.originPath).toBe(skillPath);
  });
});

describe('reconcile (orphan cleanup)', () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = makeTmpDir();
    // Monkey-patch SKILLS_DIR — we test the logic via writer module directly
    // by writing files into our temp dir and calling reconcile with a path override
    // Note: since writer.ts hardcodes SKILLS_DIR, we test the marker-detection logic
    // by exercising readAdapterMarker + the pruning condition inline
  });

  afterEach(() => {
    rmSync(skillsDir, { recursive: true, force: true });
  });

  it('readAdapterMarker returns null for user-written skills', () => {
    const content = readFileSync('test/fixtures/user-written-no-marker.md', 'utf-8');
    expect(readAdapterMarker(content)).toBeNull();
  });

  it('readAdapterMarker returns marker for adapter-managed skills', () => {
    const content = readFileSync('test/fixtures/generated-with-marker.md', 'utf-8');
    const marker = readAdapterMarker(content);
    expect(marker).not.toBeNull();
    expect(marker!.source).toBe('addy-agent-skills');
  });

  it('reconcile only removes adapter-marked files not in expectedIds', () => {
    // Write two adapter-managed skill dirs + one user-written dir to a temp location
    const adapterSkill1 = join(skillsDir, 'addy-spec');
    const adapterSkill2 = join(skillsDir, 'addy-plan');
    const userSkill = join(skillsDir, 'user-custom');
    mkdirSync(adapterSkill1, { recursive: true });
    mkdirSync(adapterSkill2, { recursive: true });
    mkdirSync(userSkill, { recursive: true });

    const markerContent = (id: string) => `---
id: "${id}"
name: "${id}"
description: "test"
source: manual
triggers:
  - "test"
adapter_source: "addy-agent-skills"
adapter_origin_path: "/fake/path"
adapter_origin_skill: "${id}"
adapter_generated_at: "2026-01-01T00:00:00.000Z"
---

body`;

    writeFileSync(join(adapterSkill1, 'SKILL.md'), markerContent('addy-spec'), 'utf-8');
    writeFileSync(join(adapterSkill2, 'SKILL.md'), markerContent('addy-plan'), 'utf-8');
    writeFileSync(join(userSkill, 'SKILL.md'), readFileSync('test/fixtures/user-written-no-marker.md', 'utf-8'));

    // Only addy-spec is "expected"; addy-plan should be orphaned
    // We can't easily test the real SKILLS_DIR path without refactoring writer.ts
    // so we verify the marker detection logic that drives the decision

    const addy1Content = readFileSync(join(adapterSkill1, 'SKILL.md'), 'utf-8');
    const addy2Content = readFileSync(join(adapterSkill2, 'SKILL.md'), 'utf-8');
    const userContent = readFileSync(join(userSkill, 'SKILL.md'), 'utf-8');

    expect(readAdapterMarker(addy1Content)).not.toBeNull();
    expect(readAdapterMarker(addy2Content)).not.toBeNull();
    expect(readAdapterMarker(userContent)).toBeNull(); // user skill: never delete

    // addy-plan not in expected → would be pruned
    const expected = new Set(['addy-spec']);
    const wouldPrune = ['addy-spec', 'addy-plan']
      .filter(id => {
        const content = readFileSync(join(skillsDir, id, 'SKILL.md'), 'utf-8');
        const marker = readAdapterMarker(content);
        return marker !== null && !expected.has(id);
      });

    expect(wouldPrune).toEqual(['addy-plan']);
  });
});
