import type { ExternalSkillMeta, TriggerMap, GeneratedSkill, AdapterMarker } from './types.js';

const MAX_BODY_CHARS = 4000;

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Derive trigger keywords from skill name and description as fallback.
 * Splits on non-word chars, filters short/common words.
 */
function deriveTriggers(name: string, description: string): string[] {
  const stopWords = new Set(['a','an','the','and','or','for','to','of','in','on','with','that','this','by','is','are','be','from','via','into']);
  const words = `${name} ${description}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Also add the full slugified name as a trigger
  const slug = slugify(name).replace(/-/g, ' ');
  const unique = [...new Set([slug, ...words.slice(0, 5)])].filter(Boolean);
  return unique;
}

export function buildGeneratedSkill(
  meta: ExternalSkillMeta,
  body: string,
  originPath: string,
  sourceName: string,
  prefix: string,
  triggerMap: TriggerMap
): GeneratedSkill {
  const originSkill = slugify(meta.name);
  const prefixedId = `${prefix}-${originSkill}`;

  // Triggers: override map first, then auto-derive
  const overrideTriggers = triggerMap[originSkill] ?? triggerMap[meta.name] ?? [];
  const triggers = overrideTriggers.length > 0
    ? overrideTriggers
    : deriveTriggers(meta.name, meta.description);

  // Ensure at least one trigger
  const finalTriggers = triggers.length > 0 ? triggers : [meta.name];

  // Truncate body
  let finalBody = body;
  let truncated = false;
  if (body.length > MAX_BODY_CHARS) {
    finalBody = body.slice(0, MAX_BODY_CHARS) + '\n\n<!-- (truncated by omc-skill-adapter) -->';
    truncated = true;
  }

  const marker: AdapterMarker = {
    source: sourceName,
    originPath,
    originSkill,
    generatedAt: new Date().toISOString(),
  };

  return {
    prefixedId,
    name: prefixedId,
    description: meta.description,
    triggers: finalTriggers,
    tags: [sourceName, prefix],
    body: finalBody,
    truncated,
    marker,
  };
}

export function renderSkillFile(skill: GeneratedSkill): string {
  const triggersYaml = skill.triggers.map(t => `  - "${t}"`).join('\n');
  const tagsYaml = skill.tags.map(t => `  - "${t}"`).join('\n');

  return [
    '---',
    `id: "${skill.prefixedId}"`,
    `name: "${skill.name}"`,
    `description: "${skill.description.replace(/"/g, '\\"')}"`,
    `source: manual`,
    `triggers:`,
    triggersYaml,
    `tags:`,
    tagsYaml,
    `adapter_source: "${skill.marker.source}"`,
    `adapter_origin_path: "${skill.marker.originPath}"`,
    `adapter_origin_skill: "${skill.marker.originSkill}"`,
    `adapter_generated_at: "${skill.marker.generatedAt}"`,
    '---',
    '',
    skill.body,
  ].join('\n');
}
