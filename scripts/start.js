// Dev launcher: Linux needs --no-sandbox when the chrome-sandbox helper is not setuid root.
const { spawn } = require('child_process');
const electron = require('electron');
const args = ['.'];
if (process.platform === 'linux') args.push('--no-sandbox');
spawn(electron, args, { stdio: 'inherit', cwd: require('path').join(__dirname, '..') }).on('exit', (c) => process.exit(c ?? 0));
