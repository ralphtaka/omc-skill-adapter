# omc-skill-adapter — Project Context for Codex

## What this project is

A **zero-dependency bridge** between external Codex skill plugins and [oh-my-Codex (OMC)](https://github.com/yeachan-heo/oh-my-Codex)'s skill loader.

**Problem:** OMC's skill loader scans hardcoded directories (`~/.omc/skills/`, `.omc/skills/`, etc.) and requires specific frontmatter fields (`id`, `triggers`, `source`). External skill plugins (addy-agent-skills, anthropic-skills, superpowers, etc.) use the minimal Anthropic standard (`name` + `description` only) and live in `~/.Codex/plugins/cache/`. OMC cannot see them, so its skill-injector and `list_omc_skills` MCP tool never return external skills.

**Solution:** A config-driven transformer + SessionStart hook that:
1. Reads external SKILL.md files (read-only)
2. Augments frontmatter with `id`, `triggers`, `source` fields
3. Embeds an `adapter_source` marker for safe reconciliation
4. Writes to `~/.omc/skills/<prefix>-<name>/SKILL.md`
5. Uses fingerprint cache so unchanged sources cost <50ms per session

Neither OMC nor any external plugin is ever modified.

---

## Architecture

```
External plugin cache (read-only)
    └── skills/*/SKILL.md  (name + description only)
            │
            ▼ read
    omc-skill-adapter
    ├── config:      ~/.omc/skill-sources.yaml
    ├── triggers:    ~/.omc/skill-triggers/<source>.yaml
    └── fingerprint: ~/.omc/.skill-adapter/<source>.hash
            │
            ▼ write (only on fingerprint change)
    ~/.omc/skills/<prefix>-<name>/SKILL.md  (OMC format)
            │
            ▼ read (OMC native mechanism, zero changes)
    OMC skill loader / skill-injector / list_omc_skills
```

**Trigger injection flow:** OMC's `skill-injector.mjs` hook fires on `UserPromptSubmit`, scans `~/.omc/skills/` for skills whose `triggers` array contains keywords found in the user's message, then injects matching skill content into context. This is deterministic (string match), not agent-decided. Agent compliance with the injected skill content is model-dependent.

---

## Source files

| File | Purpose |
|------|---------|
| `src/yaml-mini.ts` | ~100-line YAML subset parser (no deps). Handles flat k/v, inline arrays, block sequences, block sequences of objects, `#` comments. |
| `src/parser.ts` | Reads external SKILL.md frontmatter (Anthropic standard). Also reads `adapter_source/origin_path/origin_skill/generated_at` markers from generated skills. |
| `src/fingerprint.ts` | SHA-256 over sorted `(path + mtime + size)` tuples. Per-source hash files at `~/.omc/.skill-adapter/<source>.hash`. |
| `src/finder.ts` | Resolves glob patterns using `fs.readdirSync({recursive:true})`. Handles `~` expansion. Walks from the fixed prefix before the first wildcard segment. |
| `src/config.ts` | Loads `skill-sources.yaml` and `triggers/*.yaml` via yaml-mini. |
| `src/transformer.ts` | Builds `GeneratedSkill` from external meta + body. Applies trigger overrides (from trigger map) then auto-derives from name/description. Truncates body to 4000 chars (OMC limit). |
| `src/writer.ts` | Writes skill dirs to `~/.omc/skills/`. `reconcile()` removes adapter-managed orphans (identified by `adapter_source` marker) not in the current expected set. Never touches non-adapter-managed files. |
| `src/sync.ts` | Main pipeline: build expected set → per-source fingerprint check → rebuild on miss → reconcile orphans → prune stale fingerprint files. |
| `src/cli.ts` | CLI entry: `sync`, `status`, `prune`, `--dry-run`, `--quiet`, `--force`, `--config`. |

---

## Key design decisions

### Flat adapter marker fields (not nested YAML object)
The adapter marker is stored as flat top-level fields (`adapter_source`, `adapter_origin_path`, `adapter_origin_skill`, `adapter_generated_at`) rather than a nested `adapter:` block. Reason: yaml-mini doesn't need to parse nested objects for this use case, and the OMC parser (which only reads `id/name/description/source/triggers/tags/quality/usageCount`) ignores unknown fields safely.

### Zero runtime dependencies
All Node.js built-ins: `fs.readdirSync` (recursive, Node 18.17+), `crypto.createHash`, `path.join`, `os.homedir`. The yaml-mini parser is inlined (~100 lines). Build output is a single esbuild-bundled `.mjs` file (~50-100 KB).

### SessionStart hook, not daemon
Runs on every Codex session start. If fingerprint matches → exits in <50ms. If no sessions open → no work done. 3-second hard timeout prevents blocking session start. Missed sync (e.g. timeout) is fine — next session catches up.

### Adapter marker as safety gate for reconciliation
`reconcile()` only deletes skill dirs with a valid `adapter_source` marker. Files without this marker (user-written skills, OMC built-ins, skills from other tools) are never touched. This is the critical safety invariant.

### Plugin-first distribution
Ships as a Codex plugin (`.Codex-plugin/plugin.json` + `hooks/hooks.json`). Plugin manager handles installation, hook registration, and updates. A fallback `scripts/install.sh` exists for non-plugin usage.

---

## Development workflow

```bash
npm test          # vitest (35 tests, ~350ms)
npm run typecheck # tsc --noEmit
npm run build     # esbuild → dist/omc-skill-adapter.mjs

# Dogfood against real addy cache:
node dist/omc-skill-adapter.mjs sync --config dogfood-config.yaml --force
node dist/omc-skill-adapter.mjs status --config dogfood-config.yaml
```

Tests are in `test/` with fixtures in `test/fixtures/`. No mocking of the filesystem for unit tests — fingerprint and writer tests use real temp dirs.

---

## Configuration files (runtime, not in repo)

| File | Description |
|------|-------------|
| `~/.omc/skill-sources.yaml` | Source list. Installed from `templates/skill-sources.default.yaml`. |
| `~/.omc/skill-triggers/<source>.yaml` | Trigger keyword overrides per source. Installed from `triggers/`. |
| `~/.omc/.skill-adapter/<source>.hash` | Fingerprint cache. Auto-managed. |
| `~/.omc/skills/addy-*/SKILL.md` | Generated skill files. Auto-managed. |

---

## Adding a new skill source

1. Add entry to `~/.omc/skill-sources.yaml` with a unique `name` and `prefix`
2. Create `~/.omc/skill-triggers/<name>.yaml` mapping skill slugs → trigger keywords
3. Run `omc-skill-adapter sync` or open a new session

The trigger file is optional — if missing, triggers are auto-derived from skill `name` and `description` keywords (slugified name + top nouns from description). Auto-derived triggers are lower quality; a hand-curated trigger file is recommended for serious use.

---

## OMC internals referenced

These files were read during design (do not modify them):

- `~/.Codex/plugins/cache/omc/.../src/hooks/learner/constants.ts` — hardcoded skill paths, `REQUIRED_METADATA_FIELDS`, `MAX_SKILL_CONTENT_LENGTH = 4000`
- `~/.Codex/plugins/cache/omc/.../src/hooks/learner/parser.ts` — truly required: `name`, `description`, `triggers`; `id` derived from `name`; `source` defaults to `'manual'`
- `~/.Codex/plugins/cache/omc/.../src/hooks/learner/finder.ts` — scans project + user skill dirs; symlink boundary check enforced
- `~/.Codex/plugins/cache/omc/.../src/hooks/learner/loader.ts` — invalid skills silently skipped; project scope overrides user scope

**Key insight:** OMC parser only hard-requires `name`, `description`, and `triggers`. Fields `id` and `source` have fallbacks. Unknown fields (like our `adapter_*` markers) are silently ignored.

---

## Future work

### Near-term (v0.2)

- **`omc-skill-adapter init`** — interactive setup wizard: detects installed plugins, generates `skill-sources.yaml` and trigger files automatically without manual editing
- **Auto-discover installed plugins** — scan `~/.Codex/plugins/cache/` on first run, propose new sources to add to config
- **Superpowers trigger file** — hand-curate `triggers/superpowers.yaml` for the superpowers-dev skill collection (brainstorming, writing-plans, executing-plans, systematic-debugging, etc.)
- **Anthropic-skills trigger file** — after exploring the official anthropic-skills plugin contents

### Medium-term (v0.3)

- **Body splitting for oversized skills** — instead of hard-truncating at 4000 chars, split long skills into a summary file (core + triggers) and a detail file (full content), linked via a reference in the summary. OMC injects the summary; user can explicitly request details.
- **`omc-skill-adapter update`** — check plugin cache for version changes and report which sources need a sync (useful for CI/reporting without running a full sync)
- **Per-skill enable/disable** — add an `exclude` list per source in `skill-sources.yaml` to skip specific skills from a source

### Longer-term

- **`OMC_EXTRA_SKILL_PATHS` env var** — submit PR to OMC upstream so its loader can directly scan additional paths. If accepted, this adapter could work without touching `~/.omc/skills/` at all — just point OMC at the plugin cache dir and let it scan natively. The adapter's only remaining job would be trigger enrichment.
- **Per-source parser plugins** — for skill sources that don't use Anthropic standard frontmatter (e.g. custom formats, TOML, JSON). Currently all sources are assumed to follow `name` + `description` frontmatter.
- **Trigger learning** — track which injected skills the agent actually used (observable via session logs), and auto-boost or auto-demote trigger weights over time.
- **Cross-agent skill visibility** — investigate whether OMC team worker subprocesses (tmux-spawned Codex CLI instances) inherit the parent session's skill context, and if not, find the right injection point. Currently, team workers may not benefit from adapter-managed skills unless they start a fresh session that triggers the hook.
- **Plugin marketplace publishing** — publish to the Codex plugin registry for one-command install
