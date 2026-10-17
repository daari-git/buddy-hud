// Records the real HUD renderer driven by a scripted timeline -> mp4 via ffmpeg.
// usage: electron promo/record.js <landscape|portrait> <out.mp4>
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

app.commandLine.appendSwitch('ozone-platform', 'x11');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
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
  const TOTAL = 32.2;
  let finished = false;
  const script = async () => {
  // ---------- showcase: 3D, looks, model colours, walking ----------
  const portrait = mode === 'portrait';
  const Z = portrait ? 2.55 : 2.3;
  await js(`window.__zoom3d = ${Z}; __layout({ zoom: ${Z}, right: ${portrait ? 40 : 160}, bottom: ${portrait ? 175 : 130}, term: true })`);
  let skin = '3d';
  const snap2 = () => ({ ...snap(), settings: { replyMode: false, ctxMax: 200000, skin, walk: true } });
  const push2 = () => js(`__push(${JSON.stringify(snap2())})`);
  S.model = 'claude-sonnet-5-5';
  await push2(); await sleep(400); await push2(); // load the 3D bundle

  await js(`__title('Your Claude Code,<br><em>now in 3D.</em>', 'A floating buddy that shows what Claude is doing.', 'free · open source')`);
  await term('<span class="org">✻</span> Welcome to Claude Code'); await term('<span class="dim">&gt;</span> add dark mode to settings');
  await at(2.6); await js(`__title('')`);

  tool('Read', '📖', '~/my-app/src/Settings.tsx'); await push2(); await term('<span class="ok">●</span> Read(<span class="org">src/Settings.tsx</span>)');
  await cap('It <em>reads</em> with you 📖');
  await at(5.2); endTool('reads'); await push2();

  const diff = { file: 'src/theme.ts', hunks: [{ start: 14, del: ['export const theme = light;'], add: ['const mode = prefersDark() ? dark : light;', 'export const theme = mode;'] }] };
  tool('Edit', '✏️', '~/my-app/src/theme.ts', { diff }); await push2();
  await term('<span class="ok">●</span> Update(<span class="org">src/theme.ts</span>)'); await term('<span class="red">  - export const theme = light;</span>'); await term('<span class="grn">  + const mode = prefersDark() ? dark : light;</span>');
  await cap('Edits live, <em>line by line</em> ✏️');
  await at(8.6); endTool('edits'); await push2();

  tool('Grep', '🔍', '/darkMode/ src'); await push2(); await term('<span class="ok">●</span> Search(<span class="org">darkMode</span>)');
  await cap('Searches your <em>code</em> 🔍');
  await at(11.0); endTool('reads'); await push2();

  tool('Bash', '💻', 'git push origin main'); S.tool = null; S.status = 'permission';
  perms = [{ id: 'p1', sessionId: 's1', tool: 'Bash', emoji: '💻', summary: 'git push origin main', diff: null, t: Date.now() }];
  await push2(); await term('<span class="org">?</span> Allow Bash(git push)?');
  await cap('Approve from <em>anywhere</em> 🔐');
  await at(14.2); perms = []; S.status = 'done'; S.lastMsg = ''; S.feed[0].running = false; await push2(); await term('<span class="ok">✓ approved from the buddy</span>');
  await at(15.2);

  // looks
  S.status = 'idle'; await push2();
  await cap('Pick your <em>look</em>', '3D · Bot · Cat · Classic');
  for (const [k, t] of [['bot', 16.3], ['cat', 17.4], ['classic', 18.5], ['3d', 19.6]]) { skin = k; await push2(); await at(t); }

  // model colours
  await cap('Colour follows your <em>model</em>', 'Opus · Sonnet · Haiku · Fable');
  for (const [m, t] of [['claude-opus-5-5', 20.7], ['claude-haiku-5-5', 21.8], ['claude-fable-5-1', 22.9], ['claude-sonnet-5-5', 24.0]]) { S.model = m; await push2(); await at(t); }

  // walking
  await cap('When Claude rests, it <em>strolls</em> your screen 🚶');
  const far = Math.round((portrait ? -520 : -420) / Z); // CSS zoom scales the translate too
  await js(`__ui({ pet: { phase: 'walk', dir: -1 } }); __walkStage(${far}, 2100)`);
  await at(26.2);
  await js(`__ui({ pet: { phase: 'walk', dir: 1 } }); __walkStage(0, 2100)`);
  await at(28.4);
  await js(`__ui({ pet: { phase: null, dir: 1 } })`); S.status = 'waiting'; await push2(); await cap('');

  await js(`__title('<em>Buddy</em> HUD', 'Live diffs · permissions · alerts · 3D', 'github.com/premanand8800/buddy-hud')`);
  await at(32);
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
