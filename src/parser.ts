import { parseYaml } from './yaml-mini.js';
import type { ExternalSkillMeta, AdapterMarker } from './types.js';

export interface ParsedSkill {
  meta: ExternalSkillMeta;
  body: string;
  valid: boolean;
  error?: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseExternalSkill(rawContent: string): ParsedSkill {
  const match = rawContent.match(FRONTMATTER_RE);
  if (!match) {
    return { meta: { name: '', description: '' }, body: rawContent, valid: false, error: 'Missing YAML frontmatter' };
  }

  try {
    const yaml = parseYaml(match[1]);
    const name = String(yaml['name'] ?? '');
    const description = String(yaml['description'] ?? '');
    const body = match[2].trim();

    if (!name) return { meta: { name, description }, body, valid: false, error: 'Missing name' };
    if (!description) return { meta: { name, description }, body, valid: false, error: 'Missing description' };

    return { meta: { name, description }, body, valid: true };
  } catch (e) {
    return { meta: { name: '', description: '' }, body: '', valid: false, error: String(e) };
  }
}

export function readAdapterMarker(rawContent: string): AdapterMarker | null {
  const match = rawContent.match(FRONTMATTER_RE);
  if (!match) return null;

  try {
    const yaml = parseYaml(match[1]);
    const source = yaml['adapter_source'];
    const originPath = yaml['adapter_origin_path'];
    const originSkill = yaml['adapter_origin_skill'];
    const generatedAt = yaml['adapter_generated_at'];

    if (typeof source !== 'string' || typeof originPath !== 'string' ||
        typeof originSkill !== 'string' || typeof generatedAt !== 'string') return null;

    return { source, originPath, originSkill, generatedAt };
  } catch {
    return null;
  }
}
