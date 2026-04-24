import { describe, it, expect } from 'vitest';
import { buildGeneratedSkill, renderSkillFile, slugify } from '../src/transformer.js';

describe('slugify', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(slugify('Spec Driven Development')).toBe('spec-driven-development');
  });

  it('removes non-alphanumeric chars', () => {
    expect(slugify('test & review!')).toBe('test--review');
  });
});

describe('buildGeneratedSkill', () => {
  const meta = { name: 'spec-driven-development', description: 'Write a spec before coding' };
  const body = 'Some skill body content';

  it('uses trigger overrides when provided', () => {
    const skill = buildGeneratedSkill(meta, body, '/origin.md', 'addy-agent-skills', 'addy', {
      'spec-driven-development': ['spec', 'specification', 'requirements'],
    });
    expect(skill.triggers).toEqual(['spec', 'specification', 'requirements']);
    expect(skill.prefixedId).toBe('addy-spec-driven-development');
  });

  it('auto-derives triggers when no override', () => {
    const skill = buildGeneratedSkill(meta, body, '/origin.md', 'addy-agent-skills', 'addy', {});
    expect(skill.triggers.length).toBeGreaterThan(0);
    expect(skill.triggers.some(t => t.includes('spec'))).toBe(true);
  });

  it('truncates body exceeding 4000 chars', () => {
    const longBody = 'x'.repeat(5000);
    const skill = buildGeneratedSkill(meta, longBody, '/origin.md', 'src', 'addy', {});
    expect(skill.truncated).toBe(true);
    expect(skill.body.length).toBeLessThanOrEqual(4100);
    expect(skill.body).toContain('truncated');
  });

  it('keeps body under 4000 chars intact', () => {
    const skill = buildGeneratedSkill(meta, body, '/origin.md', 'src', 'addy', {});
    expect(skill.truncated).toBe(false);
    expect(skill.body).toBe(body);
  });

  it('tags include source name and prefix', () => {
    const skill = buildGeneratedSkill(meta, body, '/origin.md', 'addy-agent-skills', 'addy', {});
    expect(skill.tags).toContain('addy-agent-skills');
    expect(skill.tags).toContain('addy');
  });

  it('sets adapter marker fields', () => {
    const skill = buildGeneratedSkill(meta, body, '/path/to/SKILL.md', 'addy-agent-skills', 'addy', {});
    expect(skill.marker.source).toBe('addy-agent-skills');
    expect(skill.marker.originPath).toBe('/path/to/SKILL.md');
    expect(skill.marker.originSkill).toBe('spec-driven-development');
    expect(skill.marker.generatedAt).toBeTruthy();
  });
});

describe('renderSkillFile', () => {
  it('produces valid OMC frontmatter with required fields', () => {
    const meta = { name: 'test-skill', description: 'A test skill' };
    const skill = buildGeneratedSkill(meta, 'body', '/origin.md', 'src', 'pfx', { 'test-skill': ['test'] });
    const rendered = renderSkillFile(skill);

    expect(rendered).toContain('id: "pfx-test-skill"');
    expect(rendered).toContain('source: manual');
    expect(rendered).toContain('triggers:');
    expect(rendered).toContain('- "test"');
    expect(rendered).toContain('adapter_source:');
    expect(rendered).toContain('adapter_origin_skill: "test-skill"');
    expect(rendered).toContain('body');
  });

  it('escapes double quotes in description', () => {
    const meta = { name: 'test', description: 'Say "hello" world' };
    const skill = buildGeneratedSkill(meta, 'body', '/o.md', 'src', 'p', {});
    const rendered = renderSkillFile(skill);
    expect(rendered).toContain('\\"hello\\"');
  });

  it('escapes backslashes and control chars in frontmatter strings', () => {
    const meta = { name: 'test', description: 'path C:\\temp\\foo\nnext line' };
    const skill = buildGeneratedSkill(meta, 'body', '/o\\src.md', 'src', 'p', {
      test: ['C:\\run\\now'],
    });
    const rendered = renderSkillFile(skill);
    expect(rendered).toContain('description: "path C:\\\\temp\\\\foo\\nnext line"');
    expect(rendered).toContain('  - "C:\\\\run\\\\now"');
    expect(rendered).toContain('adapter_origin_path: "/o\\\\src.md"');
  });
});
