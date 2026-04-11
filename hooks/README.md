# Caveman Hooks

These hooks are **bundled with the caveman plugin** and activate automatically when the plugin is installed. No manual setup required.

If you installed caveman standalone (without the plugin), you can use `bash hooks/install.sh` to wire them into your settings.json manually.

## What's Included

### `caveman-activate.js` — SessionStart hook

- Runs once when Claude Code starts
- Writes `full` to `~/.claude/.caveman-active` (flag file)
- Emits caveman rules as hidden SessionStart context
- Detects missing statusline config and emits setup nudge (Claude will offer to help)

### `caveman-mode-tracker.js` — UserPromptSubmit hook

- Fires on every user prompt, checks for `/caveman` commands
- Writes the active mode to the flag file when a caveman command is detected
- Supports: `full`, `lite`, `ultra`, `wenyan`, `wenyan-lite`, `wenyan-ultra`, `commit`, `review`, `compress`

### `caveman-statusline.sh` — Statusline badge script

- Reads `~/.claude/.caveman-active` and outputs a colored badge
- Shows `[CAVEMAN]`, `[CAVEMAN:ULTRA]`, `[CAVEMAN:WENYAN]`, etc.

## Statusline Badge

The statusline badge shows which caveman mode is active directly in your Claude Code status bar.

**Plugin users:** On your first session after install, Claude will detect the missing statusline config and offer to set it up for you. Accept and you're done.

**Standalone users:** `install.sh` wires the statusline automatically — no manual step needed.

**Manual setup:** If you need to configure it yourself, add this to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash /path/to/caveman-statusline.sh"
  }
}
```

Replace `/path/to/` with the actual path to the script (e.g. `~/.claude/hooks/` for standalone installs, or the plugin install directory for plugin installs).

**Custom statusline:** If you already have a statusline script, add this snippet to it:

```bash
caveman_text=""
caveman_flag="$HOME/.claude/.caveman-active"
if [ -f "$caveman_flag" ]; then
  caveman_mode=$(cat "$caveman_flag" 2>/dev/null)
  if [ "$caveman_mode" = "full" ] || [ -z "$caveman_mode" ]; then
    caveman_text=$'\033[38;5;172m[CAVEMAN]\033[0m'
  else
    caveman_suffix=$(echo "$caveman_mode" | tr '[:lower:]' '[:upper:]')
    caveman_text=$'\033[38;5;172m[CAVEMAN:'"${caveman_suffix}"$']\033[0m'
  fi
fi
```

Badge examples:
- `/caveman` → `[CAVEMAN]`
- `/caveman ultra` → `[CAVEMAN:ULTRA]`
- `/caveman wenyan` → `[CAVEMAN:WENYAN]`
- `/caveman-commit` → `[CAVEMAN:COMMIT]`
- `/caveman-review` → `[CAVEMAN:REVIEW]`

## How It Works

```
SessionStart hook ──writes "full"──▶ ~/.claude/.caveman-active ◀──writes mode── UserPromptSubmit hook
                                              │
                                           reads
                                              ▼
                                     Statusline script
                                    [CAVEMAN:ULTRA] │ ...
```

SessionStart stdout is injected as hidden system context — Claude sees it, users don't. The statusline runs as a separate process. The flag file is the bridge.

## Uninstall

If installed via plugin: disable the plugin — hooks deactivate automatically.

If installed via `install.sh`:
```bash
bash hooks/uninstall.sh
```

Or manually:
1. Remove `~/.claude/hooks/caveman-activate.js`, `~/.claude/hooks/caveman-mode-tracker.js`, and `~/.claude/hooks/caveman-statusline.sh`
2. Remove the SessionStart, UserPromptSubmit, and statusLine entries from `~/.claude/settings.json`
3. Delete `~/.claude/.caveman-active`
