import { describe, it, expect } from 'vitest';
import { parseYaml } from '../src/yaml-mini.js';

describe('parseYaml', () => {
  it('parses simple key-value', () => {
    const r = parseYaml('name: hello\ndescription: world');
    expect(r['name']).toBe('hello');
    expect(r['description']).toBe('world');
  });

  it('strips quotes', () => {
    const r = parseYaml('name: "quoted value"\ndescription: \'single quoted\'');
    expect(r['name']).toBe('quoted value');
    expect(r['description']).toBe('single quoted');
  });

  it('parses inline array', () => {
    const r = parseYaml('triggers: [spec, plan, build]');
    expect(r['triggers']).toEqual(['spec', 'plan', 'build']);
  });

  it('parses multi-line array', () => {
    const r = parseYaml('triggers:\n  - spec\n  - plan\n  - build');
    expect(r['triggers']).toEqual(['spec', 'plan', 'build']);
  });

  it('ignores comments', () => {
    const r = parseYaml('# this is a comment\nname: value # inline');
    expect(r['name']).toBe('value');
    expect(r['#']).toBeUndefined();
  });

  it('returns empty object for empty string', () => {
    expect(parseYaml('')).toEqual({});
  });

  it('handles version number', () => {
    const r = parseYaml('version: 1');
    expect(r['version']).toBe('1');
  });

  it('handles enabled: true/false', () => {
    const r = parseYaml('enabled: true\ndisabled: false');
    expect(r['enabled']).toBe('true');
    expect(r['disabled']).toBe('false');
  });

  it('parses nested object (key whose value is an indented key-value block)', () => {
    const yaml = `server:\n  host: localhost\n  port: 8080\nname: myapp`;
    const r = parseYaml(yaml);
    const server = r['server'] as Record<string, string>;
    expect(typeof server).toBe('object');
    expect(Array.isArray(server)).toBe(false);
    expect(server['host']).toBe('localhost');
    expect(server['port']).toBe('8080');
    expect(r['name']).toBe('myapp');
  });

  it('parses block sequence of objects (config format)', () => {
    const yaml = `version: 1
sources:
  - name: addy-agent-skills
    glob: "~/.claude/plugins/cache/addy-agent-skills/**/SKILL.md"
    prefix: addy
    enabled: true
  - name: superpowers
    glob: "~/.claude/plugins/cache/superpowers/**/SKILL.md"
    prefix: sp
    enabled: false
`;
    const r = parseYaml(yaml);
    expect(r['version']).toBe('1');
    const sources = r['sources'] as Array<Record<string, string>>;
    expect(Array.isArray(sources)).toBe(true);
    expect(sources).toHaveLength(2);
    expect(sources[0]['name']).toBe('addy-agent-skills');
    expect(sources[0]['prefix']).toBe('addy');
    expect(sources[0]['enabled']).toBe('true');
    expect(sources[1]['name']).toBe('superpowers');
    expect(sources[1]['enabled']).toBe('false');
  });
});
