#!/usr/bin/env node
// Adds / removes Buddy HUD hooks in ~/.claude/settings.json (idempotent, backs the file up first).
// Hooks are plain `curl` calls, so users need no Node install and the same command works on Linux, macOS and Windows 10+.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = path.join(os.homedir(), '.claude', 'settings.json');
const URL = 'http://127.0.0.1:47800/hook';
const LEGACY = 'claude-hud/hook.js';
// Permission / Stop hooks wait for the overlay, so they get a long timeout and no curl cap.
const EVENTS = { SessionStart: 0, SessionEnd: 0, UserPromptSubmit: 0, PreToolUse: 0, PostToolUse: 0, Notification: 0, SubagentStop: 0, PermissionRequest: 900, Stop: 900 };

const command = (long) =>
  `curl -s ${long ? '' : '-m 3 '}-X POST -H "Content-Type: application/json" -H "X-Buddy-Tmux: \${TMUX:-}" -H "X-Buddy-Pane: \${TMUX_PANE:-}" --data-binary @- ${URL} || true`;

function run(uninstall) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  let settings = {};
  if (fs.existsSync(FILE)) {
    settings = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    fs.copyFileSync(FILE, FILE + '.bak-buddy-hud');
  }
  settings.hooks = settings.hooks || {};
  const ours = (h) => String(h.command || '').includes(URL) || String(h.command || '').includes(LEGACY);
  for (const [ev, timeout] of Object.entries(EVENTS)) {
    const groups = (settings.hooks[ev] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ours(h)) }))
      .filter((g) => g.hooks.length);
    if (!uninstall) groups.push({ matcher: '*', hooks: [{ type: 'command', command: command(!!timeout), timeout: timeout || 5 }] });
    if (groups.length) settings.hooks[ev] = groups; else delete settings.hooks[ev];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  fs.writeFileSync(FILE, JSON.stringify(settings, null, 2) + '\n');
  return uninstall ? 'Hooks removed from ' + FILE : 'Hooks installed in ' + FILE + ' - restart running Claude Code sessions';
}

// Default model for NEW sessions (a running session can only be changed with /model inside it).
function setModel(model) {
  if (!/^[A-Za-z0-9._\-\[\]]+$/.test(model)) throw new Error('invalid model name');
  let settings = {};
  if (fs.existsSync(FILE)) { settings = JSON.parse(fs.readFileSync(FILE, 'utf8')); fs.copyFileSync(FILE, FILE + '.bak-buddy-hud'); }
  settings.model = model;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(settings, null, 2) + '\n');
  return `Default model for new Claude Code sessions: ${model}`;
}

module.exports = { run, setModel };
if (require.main === module) console.log(run(process.argv.includes('--uninstall')));
