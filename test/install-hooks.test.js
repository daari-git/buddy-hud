// Run with: node test/install-hooks.test.js  (uses a throwaway HOME, never touches real settings)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-hud-test-'));
process.env.HOME = home; process.env.USERPROFILE = home;
const settingsPath = path.join(home, '.claude', 'settings.json');
const { run } = require('../install-hooks');

// 1. install over an existing settings file (backup is made once, never overwritten)
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify({ theme: 'dark' }));
run(false);
assert.strictEqual(JSON.parse(fs.readFileSync(settingsPath + '.bak-buddy-hud', 'utf8')).theme, 'dark');
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
assert.strictEqual(JSON.parse(fs.readFileSync(settingsPath + '.bak-buddy-hud', 'utf8')).theme, 'dark', 'backup stays pristine across runs');
fs.writeFileSync(settingsPath, '   ');
assert.doesNotThrow(() => run(false), 'empty settings.json is treated as {}');

// 6. Windows hook command: no cmd /c wrapper (Git Bash turns /c into C:/ and cmd then runs the payload), quoted @-
const ih = require('../install-hooks');
const plat = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'win32' });
delete require.cache[require.resolve('../install-hooks')];
const ihWin = require('../install-hooks');
ihWin.run(false);
const winCmd = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes('47800'))).hooks[0].command;
assert.ok(!/cmd \/c/.test(winCmd), 'Windows hook must not use cmd /c: ' + winCmd);
assert.ok(winCmd.startsWith('curl.exe ') && winCmd.includes('--data-binary "@-"'), winCmd);
fs.writeFileSync(settingsPath, JSON.stringify({ hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'cmd /c "curl.exe -s -X POST --data-binary @- http://127.0.0.1:47800/hook || exit /b 0"' }] }] } }));
assert.ok(ihWin.hasUnsafeWindowsHook(), 'old unsafe hook is detected');
ihWin.run(false);
assert.ok(!ihWin.hasUnsafeWindowsHook(), 'reinstall replaces the unsafe hook');
Object.defineProperty(process, 'platform', plat);

console.log('install-hooks: all tests passed');
