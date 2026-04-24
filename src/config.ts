import { existsSync, readFileSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { homedir } from 'os';
import { parseYaml } from './yaml-mini.js';
import type { AdapterConfig, SourceConfig, TriggerMap } from './types.js';

export const DEFAULT_CONFIG_PATH = join(homedir(), '.omc', 'skill-sources.yaml');
export const DEFAULT_TRIGGERS_DIR = join(homedir(), '.omc', 'skill-triggers');

export function loadConfig(configPath = DEFAULT_CONFIG_PATH): AdapterConfig {
  if (!existsSync(configPath)) {
    return { version: 1, sources: [] };
  }

  const raw = readFileSync(configPath, 'utf-8');
  const yaml = parseYaml(raw);

  const rawSources = yaml['sources'];
  if (!Array.isArray(rawSources)) return { version: 1, sources: [] };

  const sources: SourceConfig[] = (rawSources as unknown[])
    .filter(s => !!s && typeof s === 'object' && !Array.isArray(s))
    .map(s => {
      const obj = s as Record<string, unknown>;
      return {
        name: String(obj['name'] ?? ''),
        glob: String(obj['glob'] ?? ''),
        prefix: String(obj['prefix'] ?? ''),
        triggers: String(obj['triggers'] ?? ''),
        enabled: obj['enabled'] !== false,
      };
    })
    .filter(s => s.name && s.glob && s.prefix);

  return { version: Number(yaml['version'] ?? 1), sources };
}

export function loadTriggerMap(
  triggersRef: string,
  configPath = DEFAULT_CONFIG_PATH
): TriggerMap {
  const configDir = dirname(configPath);

  // Resolve triggers ref: absolute path, or relative to config dir, or relative to triggers dir
  let resolved: string;
  if (isAbsolute(triggersRef)) {
    resolved = triggersRef;
  } else if (existsSync(join(configDir, triggersRef))) {
    resolved = join(configDir, triggersRef);
  } else if (existsSync(join(DEFAULT_TRIGGERS_DIR, triggersRef))) {
    resolved = join(DEFAULT_TRIGGERS_DIR, triggersRef);
  } else {
    return {};
  }

  if (!existsSync(resolved)) return {};

  try {
    const raw = readFileSync(resolved, 'utf-8');
    const yaml = parseYaml(raw);
    const result: TriggerMap = {};

    for (const [key, val] of Object.entries(yaml)) {
      if (Array.isArray(val)) {
        result[key] = val.map(String);
      } else if (typeof val === 'string') {
        result[key] = [val];
      }
    }

    return result;
  } catch {
    return {};
  }
}
