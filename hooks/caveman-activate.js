#!/usr/bin/env node
// caveman — Claude Code SessionStart activation hook
//
// Runs on every session start:
//   1. Writes flag file at ~/.claude/.caveman-active (statusline reads this)
//   2. Emits caveman ruleset as hidden SessionStart context
//   3. Detects missing statusline config and emits setup nudge

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.caveman-active');
const settingsPath = path.join(claudeDir, 'settings.json');

// 1. Write flag file
try {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, 'full');
} catch (e) {
  // Silent fail -- flag is best-effort, don't block the hook
}

// 2. Emit caveman rules (always)
let output =
  "CAVEMAN MODE ACTIVE. Rules: Drop articles/filler/pleasantries/hedging. " +
  "Fragments OK. Short synonyms. Pattern: [thing] [action] [reason]. [next step]. " +
  "Not: 'Sure! I'd be happy to help you with that.' " +
  "Yes: 'Bug in auth middleware. Fix:' " +
  "Code/commits/security: write normal. " +
  "User says 'normal' or 'stop caveman' to deactivate.";

// 3. Detect missing statusline config — nudge Claude to help set it up
try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine && typeof settings.statusLine === 'object' &&
        settings.statusLine.command && settings.statusLine.command.includes('caveman')) {
      hasStatusline = true;
    } else if (typeof settings.statusLine === 'string' && settings.statusLine.includes('caveman')) {
      hasStatusline = true;
    }
  }

  if (!hasStatusline) {
    // Resolve the statusline script path — works for both plugin and standalone installs
    const scriptPath = path.join(__dirname, 'caveman-statusline.sh');
    output += "\n\n" +
      "STATUSLINE SETUP NEEDED: The caveman plugin includes a statusline badge showing active mode " +
      "(e.g. [CAVEMAN], [CAVEMAN:ULTRA]). It is not configured yet. " +
      "To enable, add this to ~/.claude/settings.json: " +
      '"statusLine": { "type": "command", "command": "bash ' + scriptPath + '" } ' +
      "Proactively offer to set this up for the user on first interaction.";
  }
} catch (e) {
  // Silent fail — don't block session start over statusline detection
}

process.stdout.write(output);
