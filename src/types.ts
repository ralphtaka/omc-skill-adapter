export interface SourceConfig {
  name: string;
  glob: string;
  prefix: string;
  triggers: string;
  enabled: boolean;
}

export interface AdapterConfig {
  version: number;
  sources: SourceConfig[];
}

export interface TriggerMap {
  [skillId: string]: string[];
}

export interface ExternalSkillMeta {
  name: string;
  description: string;
}

export interface AdapterMarker {
  source: string;
  originPath: string;
  originSkill: string;
  generatedAt: string;
}

export interface GeneratedSkill {
  prefixedId: string;
  name: string;
  description: string;
  triggers: string[];
  tags: string[];
  body: string;
  truncated: boolean;
  marker: AdapterMarker;
}

export interface SyncResult {
  sourceName: string;
  written: number;
  unchanged: number;
  pruned: number;
  skipped: boolean;
}
