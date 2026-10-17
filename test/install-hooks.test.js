// Run with: node test/install-hooks.test.js  (uses a throwaway HOME, never touches real settings)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-hud-test-'));
process.env.HOME = home; process.env.USERPROFILE = home;
const settingsPath = path.join(home, '.claude', 'settings.json');
const { run } = require('../install-hooks');

// 1. fresh install on a machine with no settings file
run(false);
let s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
for (const ev of ['PreToolUse', 'PostToolUse', 'Stop', 'PermissionRequest', 'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Notification', 'SubagentStop'])
  assert.ok(s.hooks[ev], 'missing hook ' + ev);
assert.ok(s.hooks.Stop[0].hooks[0].timeout >= 600, 'Stop hook needs a long timeout');

// 2. idempotent: running twice does not duplicate
run(false);
s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
assert.strictEqual(s.hooks.PreToolUse.length, 1);

// 3. keeps other tools' hooks and unrelated settings
s.model = 'sonnet';
s.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] });
fs.writeFileSync(settingsPath, JSON.stringify(s));
run(false);
s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
assert.strictEqual(s.model, 'sonnet');
assert.ok(s.hooks.PreToolUse.some((g) => g.hooks.some((h) => h.command === 'echo mine')));
assert.strictEqual(s.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.command.includes('47800'))).length, 1);

// 4. uninstall removes only ours and leaves a backup
run(true);
s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
assert.ok(s.hooks.PreToolUse.every((g) => g.hooks.every((h) => !h.command.includes('47800'))));
assert.ok(s.hooks.PreToolUse.some((g) => g.hooks.some((h) => h.command === 'echo mine')));
assert.ok(!s.hooks.Stop, 'Stop hook should be gone');
assert.ok(fs.existsSync(settingsPath + '.bak-buddy-hud'));

// 5. default-model helper keeps hooks and rejects junk
const { setModel } = require('../install-hooks');
run(false);
setModel('claude-haiku-4-5');
s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
assert.strictEqual(s.model, 'claude-haiku-4-5');
assert.ok(s.hooks.Stop, 'setModel must not drop hooks');
assert.throws(() => setModel('x; rm -rf /'));

console.log('install-hooks: all tests passed');
