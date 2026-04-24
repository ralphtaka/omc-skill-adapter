#!/usr/bin/env bash
# omc-skill-adapter — fallback install script (no Claude Code plugin marketplace needed)
# Usage: curl -fsSL <url>/install.sh | sh
#    or: ./scripts/install.sh (from repo root after building)

set -e

INSTALL_DIR="$HOME/.local/share/omc-skill-adapter"
DIST_FILE="dist/omc-skill-adapter.mjs"
SETTINGS_FILE="$HOME/.claude/settings.json"

# ── 1. Build if needed ───────────────────────────────────────────────────────
if [ ! -f "$DIST_FILE" ]; then
  echo "[omc-skill-adapter] Building..."
  npm run build
fi

# ── 2. Install bundle ────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/dist"
cp "$DIST_FILE" "$INSTALL_DIR/dist/omc-skill-adapter.mjs"
chmod +x "$INSTALL_DIR/dist/omc-skill-adapter.mjs"
echo "[omc-skill-adapter] Installed to $INSTALL_DIR/dist/omc-skill-adapter.mjs"

# ── 3. Install default config if not present ────────────────────────────────
OMC_DIR="$HOME/.omc"
CONFIG_FILE="$OMC_DIR/skill-sources.yaml"
TRIGGERS_DIR="$OMC_DIR/skill-triggers"

mkdir -p "$OMC_DIR" "$TRIGGERS_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  cp templates/skill-sources.default.yaml "$CONFIG_FILE"
  echo "[omc-skill-adapter] Created default config at $CONFIG_FILE"
else
  echo "[omc-skill-adapter] Config already exists at $CONFIG_FILE (not overwritten)"
fi

for f in triggers/*.yaml; do
  name=$(basename "$f")
  dest="$TRIGGERS_DIR/$name"
  if [ ! -f "$dest" ]; then
    cp "$f" "$dest"
    echo "[omc-skill-adapter] Installed trigger override: $dest"
  fi
done

# ── 4. Register SessionStart hook in ~/.claude/settings.json ────────────────
HOOK_CMD="node $INSTALL_DIR/dist/omc-skill-adapter.mjs sync --quiet"

if [ ! -f "$SETTINGS_FILE" ]; then
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  cat > "$SETTINGS_FILE" <<EOF
{
  "hooks": {
    "SessionStart": [
      {
        "command": "$HOOK_CMD",
        "timeoutMs": 3000
      }
    ]
  }
}
EOF
  echo "[omc-skill-adapter] Created $SETTINGS_FILE with SessionStart hook"
else
  # Check if hook already registered
  if grep -q "omc-skill-adapter" "$SETTINGS_FILE" 2>/dev/null; then
    echo "[omc-skill-adapter] Hook already registered in $SETTINGS_FILE"
  else
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  ACTION NEEDED: Add the following to ~/.claude/settings.json ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo '  "hooks": {'
    echo '    "SessionStart": ['
    echo '      {'
    echo "        \"command\": \"$HOOK_CMD\","
    echo '        "timeoutMs": 3000'
    echo '      }'
    echo '    ]'
    echo '  }'
    echo ""
    echo "(Could not auto-merge: $SETTINGS_FILE already exists with other content)"
  fi
fi

# ── 5. Run initial sync ──────────────────────────────────────────────────────
echo ""
echo "[omc-skill-adapter] Running initial sync..."
node "$INSTALL_DIR/dist/omc-skill-adapter.mjs" sync

echo ""
echo "[omc-skill-adapter] Install complete."
echo "  Config:   $CONFIG_FILE"
echo "  Triggers: $TRIGGERS_DIR"
echo "  Bundle:   $INSTALL_DIR/dist/omc-skill-adapter.mjs"
echo ""
echo "Run 'node $INSTALL_DIR/dist/omc-skill-adapter.mjs status' to check."
