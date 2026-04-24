# omc-skill-adapter

Bridges external Claude Code skill collections into [oh-my-claudecode (OMC)](https://github.com/yeachan-heo/oh-my-claudecode)'s skill loader — automatically, with zero changes to either side.

## What it does

OMC has its own skill loader that scans `~/.omc/skills/` and injects matching skills into your session. External skill plugins (e.g. [addy-agent-skills](https://github.com/addyosmani/agent-skills)) use a different frontmatter schema and live in a different directory — so OMC can't see them.

`omc-skill-adapter` transforms external skills into OMC's format and syncs them to `~/.omc/skills/` on every session start. When an external plugin updates, the next session auto-regenerates. When a plugin is removed, the corresponding skills are pruned.

**Nothing is modified**: not OMC, not the external plugins, not your existing `~/.omc/skills/` entries.

## Install

### Option A: Claude Code plugin (recommended)

```
/plugin install https://github.com/<user>/omc-skill-adapter
```

The plugin registers the SessionStart hook automatically. Upgrades via `/plugin update`.

### Option B: Fallback script

```bash
git clone https://github.com/<user>/omc-skill-adapter
cd omc-skill-adapter
npm install
./scripts/install.sh
```

## Requirements

- Node.js ≥ 18.17 (already required by Claude Code)
- oh-my-claudecode plugin installed
- Zero additional runtime dependencies

## Configuration

After install, edit `~/.omc/skill-sources.yaml`:

```yaml
version: 1
sources:
  - name: addy-agent-skills
    glob: "~/.claude/plugins/cache/addy-agent-skills/**/skills/*/SKILL.md"
    prefix: addy
    triggers: triggers/addy-agent-skills.yaml
    enabled: true

  # Add more sources:
  # - name: superpowers
  #   glob: "~/.claude/plugins/cache/superpowers-dev/**/skills/*/SKILL.md"
  #   prefix: sp
  #   triggers: triggers/superpowers.yaml
  #   enabled: true
```

### Trigger overrides

Each source has a trigger file mapping skill slugs to keywords. When a user message contains a trigger keyword, OMC injects that skill's content into the session context.

Default trigger files are installed to `~/.omc/skill-triggers/`. Edit them to tune which keywords activate which skills.

## CLI

```bash
# Sync all sources (auto-runs at session start)
omc-skill-adapter sync

# Preview what would change without writing
omc-skill-adapter sync --dry-run

# Force full rebuild ignoring cache
omc-skill-adapter sync --force

# Remove orphaned skills without syncing
omc-skill-adapter prune

# Show source status and fingerprint cache
omc-skill-adapter status
```

## How it works

1. **SessionStart hook** runs `sync --quiet` on every Claude Code session start
2. **Fingerprint check**: computes a hash over each source's SKILL.md mtimes+sizes
3. **Fast path**: if unchanged since last run, exits in <50ms
4. **Rebuild**: on change, reads each external SKILL.md, adds required OMC fields (`id`, `triggers`, `source`), truncates body to 4000 chars if needed, writes to `~/.omc/skills/<prefix>-<skill>/SKILL.md`
5. **Reconcile**: removes any adapter-managed skills whose source is no longer active
6. **Safety**: only deletes files it wrote (identified by `adapter_source` marker in frontmatter) — user-written skills are never touched

## Adding a new source

1. Add an entry to `~/.omc/skill-sources.yaml`
2. Create a trigger file at `~/.omc/skill-triggers/<source-name>.yaml`
3. Run `omc-skill-adapter sync` (or just open a new session)

## Architecture

```
External plugin cache (read-only)
    └── skills/*/SKILL.md  (name + description only)
            │
            ▼
    omc-skill-adapter
    ├── config: ~/.omc/skill-sources.yaml
    ├── triggers: ~/.omc/skill-triggers/
    └── fingerprint: ~/.omc/.skill-adapter/
            │
            ▼ (writes only on change)
    ~/.omc/skills/<prefix>-<name>/SKILL.md  (OMC format)
            │
            ▼ (reads, zero changes)
    OMC skill loader / injector / list_omc_skills
```

## License

MIT
