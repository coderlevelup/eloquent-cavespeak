#!/bin/bash
# caveman — one-command hook installer for Claude Code
# Installs: SessionStart hook (auto-load rules) + UserPromptSubmit hook (mode tracking)
# Usage: bash hooks/install.sh
#   or:  bash <(curl -s https://raw.githubusercontent.com/JuliusBrussee/caveman/main/hooks/install.sh)
set -e

# Require node — we use it to merge the hook config into settings.json
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' is required to install the caveman hooks (used to merge"
  echo "       the hook config into ~/.claude/settings.json safely)."
  echo "       Install Node.js from https://nodejs.org and re-run this script."
  exit 1
fi

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"
REPO_URL="https://raw.githubusercontent.com/JuliusBrussee/caveman/main/hooks"

HOOK_FILES=("caveman-activate.js" "caveman-mode-tracker.js" "caveman-statusline.sh")

# Resolve source — works from repo clone or curl pipe
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" 2>/dev/null)" 2>/dev/null && pwd)"

echo "Installing caveman hooks..."

# 1. Ensure hooks dir exists
mkdir -p "$HOOKS_DIR"

# 2. Copy or download hook files
for hook in "${HOOK_FILES[@]}"; do
  if [ -f "$SCRIPT_DIR/$hook" ]; then
    cp "$SCRIPT_DIR/$hook" "$HOOKS_DIR/$hook"
  else
    curl -fsSL "$REPO_URL/$hook" -o "$HOOKS_DIR/$hook"
  fi
  echo "  Installed: $HOOKS_DIR/$hook"
done

# Make statusline script executable
chmod +x "$HOOKS_DIR/caveman-statusline.sh"

# 3. Wire hooks + statusline into settings.json (idempotent)
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

# Back up existing settings.json before touching it
cp "$SETTINGS" "$SETTINGS.bak"

node -e "
  const fs = require('fs');
  const settings = JSON.parse(fs.readFileSync('$SETTINGS', 'utf8'));
  if (!settings.hooks) settings.hooks = {};

  // SessionStart — auto-load caveman rules
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const hasStart = settings.hooks.SessionStart.some(e =>
    e.hooks && e.hooks.some(h => h.command && h.command.includes('caveman'))
  );
  if (!hasStart) {
    settings.hooks.SessionStart.push({
      hooks: [{
        type: 'command',
        command: 'node $HOOKS_DIR/caveman-activate.js',
        timeout: 5,
        statusMessage: 'Loading caveman mode...'
      }]
    });
  }

  // UserPromptSubmit — track mode changes when user types /caveman commands
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
  const hasPrompt = settings.hooks.UserPromptSubmit.some(e =>
    e.hooks && e.hooks.some(h => h.command && h.command.includes('caveman'))
  );
  if (!hasPrompt) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{
        type: 'command',
        command: 'node $HOOKS_DIR/caveman-mode-tracker.js',
        timeout: 5,
        statusMessage: 'Tracking caveman mode...'
      }]
    });
  }

  // Statusline — wire caveman badge (only if no statusLine is already configured)
  if (!settings.statusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'bash $HOOKS_DIR/caveman-statusline.sh'
    };
  }

  fs.writeFileSync('$SETTINGS', JSON.stringify(settings, null, 2) + '\n');
"
echo "  Hooks + statusline wired in settings.json"

echo ""
echo "Done! Restart Claude Code to activate."
echo ""
echo "What's installed:"
echo "  - SessionStart hook: auto-loads caveman rules every session"
echo "  - Mode tracker hook: updates statusline badge when you switch modes"
echo "    (/caveman lite, /caveman ultra, /caveman-commit, etc.)"
echo "  - Statusline badge: shows [CAVEMAN] or [CAVEMAN:ULTRA] etc."
