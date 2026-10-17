// Records the real HUD renderer driven by a scripted timeline -> mp4 via ffmpeg.
// usage: electron promo/record.js <landscape|portrait> <out.mp4>
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

app.commandLine.appendSwitch('ozone-platform', 'x11');
app.disableHardwareAcceleration();
const mode = process.argv[2] === 'portrait' ? 'portrait' : 'landscape';
const out = process.argv[3] || path.join(__dirname, `claude-hud-${mode}.mp4`);
const [W, H] = mode === 'portrait' ? [1080, 1920] : [1920, 1080];
const FPS = 30;

const rsleep = (ms) => new Promise((r) => setTimeout(r, ms));
let vnow = 0;
const waiters = [];
const sleep = (ms) => new Promise((r) => waiters.push({ t: vnow + ms, r }));
const at = (sec) => new Promise((r) => waiters.push({ t: sec * 1000, r }));

// ---------- fake session snapshot ----------
const S = { id: 's1', project: 'my-app', cwd: '/home/dev/my-app', model: 'claude-sonnet-5-5', status: 'idle', note: '', tool: null, feed: [], ctx: { used: 18000, max: 200000 }, stats: { reads: 0, edits: 0, cmds: 0, other: 0 }, prompt: '', lastMsg: '', canReply: false, canType: false, queued: 0, started: Date.now(), updated: Date.now() };
let perms = [];
let seq = 0;
const snap = () => ({ settings: { replyMode: false, ctxMax: 200000 }, sessions: [JSON.parse(JSON.stringify(S))], perms });
const feed = (e) => S.feed.unshift({ id: ++seq, t: Date.now(), ...e });
const tool = (name, emoji, text, extra = {}) => { S.status = 'tool'; S.tool = { name, emoji, text, started: Date.now(), ...extra }; feed({ emoji, tool: name, text, kind: 'tool', running: true, diff: extra.diff }); };
const endTool = (kind) => { S.tool = null; S.status = 'thinking'; if (S.feed[0]) { S.feed[0].running = false; S.feed[0].ms = 240 + (seq * 37) % 600; } if (kind) S.stats[kind]++; };

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ width: 1280, height: 720, show: true, x: 30, y: 30, frame: false, backgroundColor: '#0c0a09', webPreferences: {  preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
  let ff = null;
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { search: 'promo' });
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: W / 2, height: H / 2, deviceScaleFactor: 2, mobile: false });
  const js = (code) => win.webContents.executeJavaScript(code);
  const push = () => js(`__push(${JSON.stringify(snap())})`);
  const cap = (h, s = '') => js(`__cap(${JSON.stringify(h)}, ${JSON.stringify(s)})`);
  const term = (h, c = '') => js(`__term(${JSON.stringify(h)}, ${JSON.stringify(c)})`);
  const ctx = (n) => { S.ctx.used = n; };

  await rsleep(500);
  const TOTAL = 15;
  let finished = false;
  const script = async () => {
  // 15s cut, silent
  await push();
  await js(`__title('Your Claude Code,<br><em>now with a face.</em>', '', 'unofficial · open source')`);
  await at(1.6); await js(`__title('')`);
  await term('<span class="org">✻</span> Welcome to Claude Code'); await term('<span class="dim">~/my-app</span>');
  await term('<span class="dim">&gt;</span> add dark mode to the settings page');
  S.status = 'thinking'; S.prompt = 'add dark mode to the settings page'; feed({ emoji: '💬', text: S.prompt, kind: 'prompt' }); ctx(26000); await push();
  await cap('It <em>thinks</em> with you 💭');
  await at(3.0);

  tool('Read', '📖', '~/my-app/src/Settings.tsx'); await push(); await term('<span class="ok">●</span> Read(<span class="org">src/Settings.tsx</span>)');
  await cap('Reads files 📖');
  await at(4.4); endTool('reads'); ctx(41000); await push(); await sleep(100);

  tool('Grep', '🔍', '/darkMode/ src'); await push(); await term('<span class="ok">●</span> Search(<span class="org">darkMode</span>)');
  await cap('Searches your code 🔍');
  await at(5.6); endTool('reads'); ctx(52000); await push(); await sleep(100);

  const diff = { file: 'src/theme.ts', hunks: [{ start: 14, del: ["export const theme = light;"], add: ["const mode = prefersDark() ? dark : light;", "export const theme = mode;"] }] };
  tool('Edit', '✏️', '~/my-app/src/theme.ts', { diff }); await push();
  await term('<span class="ok">●</span> Update(<span class="org">src/theme.ts</span>)'); await term('<span class="red">  - export const theme = light;</span>'); await term('<span class="grn">  + const mode = prefersDark() ? dark : light;</span>');
  await cap('Edits live — <em>exact lines</em> ✏️');
  await at(8.4); endTool('edits'); ctx(77000); await push(); await sleep(100);

  tool('Bash', '💻', 'npm test'); await push(); await term('<span class="ok">●</span> Bash(<span class="org">npm test</span>)');
  await cap('Runs commands 💻');
  await at(10.0); endTool('cmds'); await term('<span class="grn">  ✓ 24 tests passed</span>'); ctx(96000); await push(); await sleep(100);

  tool('Bash', '💻', 'git push origin main'); S.tool = null; S.status = 'permission';
  perms = [{ id: 'p1', sessionId: 's1', tool: 'Bash', emoji: '💻', summary: 'git push origin main', diff: null, t: Date.now() }];
  await push(); await term('<span class="org">?</span> Allow Bash(git push)?');
  await cap('Needs you? <em>Allow or deny</em> 🔐');
  await at(12.0); perms = []; S.status = 'thinking'; S.stats.cmds++; S.feed[0].running = false; S.feed[0].ms = 1180; S.tool = null; await push(); await term('<span class="ok">✓ approved from overlay</span>');
  await at(12.5);

  S.status = 'done'; S.lastMsg = 'Dark mode is in and pushed. Want me to remember the choice too?'; S.canType = true; ctx(112000);
  feed({ emoji: '💬', text: S.lastMsg, kind: 'done' }); await push();
  await cap('Reply from <em>anywhere</em> 💬');
  await at(14.2); await cap('');
  await js(`__title('<em>Buddy</em> HUD', '', 'unofficial companion for Claude Code')`);
  await at(TOTAL - 0.05);
  finished = true;
  };
  script().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });

  ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'png', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '12', '-preset', 'slow', '-tune', 'animation', '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'inherit'] });
  ff.on('close', () => { console.log('wrote', out); app.quit(); });
  const frames = Math.round(TOTAL * FPS);
  for (let f = 0; f < frames; f++) {
    vnow = (f * 1000) / FPS;
    waiters.sort((x, y) => x.t - y.t);
    while (waiters.length && waiters[0].t <= vnow) waiters.shift().r();
    await rsleep(25); // let the scripted chain run its JS calls
    await js(`__tick(${vnow})`);
    const { data } = await dbg.sendCommand('Page.captureScreenshot', { format: 'png' });
    ff.stdin.write(Buffer.from(data, 'base64'));
    if (f % 150 === 0) console.log('frame', f, '/', frames);
  }
  ff.stdin.end();
})().catch((e) => { console.error('RECORD ERROR', e); process.exit(1); });
