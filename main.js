const { execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, screen, Notification, Menu, Tray, nativeImage, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47800;
const SETTINGS_FILE = path.join(os.homedir(), '.buddy-hud', 'settings.json');
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';

// Wayland compositors ignore always-on-top for native windows, so run through XWayland on Linux
if (isLinux) { app.commandLine.appendSwitch('ozone-platform', 'x11'); app.commandLine.appendSwitch('no-sandbox'); }
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- state ----------
const sessions = new Map(); // id -> session
const pendingPerms = new Map(); // id -> { res, sessionId, tool, summary, diff }
const stopHolds = new Map(); // sessionId -> res
const queued = new Map(); // sessionId -> [text]
let settings = { replyMode: false, ctxMax: 200000, mode: 'orb' };
try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch {}
let win, hideTimer, seq = 0;

const saveSettings = () => {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));
  } catch {}
};

const TOOL_EMOJI = {
  Read: '📖', Edit: '✏️', MultiEdit: '✏️', Write: '📝', NotebookEdit: '📓', Bash: '💻',
  Grep: '🔍', Glob: '🗂️', WebFetch: '🌐', WebSearch: '🔎', Task: '🤖', Agent: '🤖',
  TodoWrite: '📋', AskUserQuestion: '🙋',
};
const emojiFor = (t) => TOOL_EMOJI[t] || (t && t.startsWith('mcp__') ? '🔌' : '🛠️');

function getSession(id, ev) {
  let s = sessions.get(id);
  if (!s) {
    s = {
      id, cwd: ev.cwd || '', project: path.basename(ev.cwd || '') || 'session', model: '',
      status: 'idle', note: '', tool: null, feed: [], ctx: { used: 0, max: settings.ctxMax },
      stats: { reads: 0, edits: 0, cmds: 0, other: 0 }, prompt: '', transcript: ev.transcript_path || '',
      started: Date.now(), updated: Date.now(),
    };
    sessions.set(id, s);
  }
  if (ev.cwd) { s.cwd = ev.cwd; s.project = path.basename(ev.cwd) || s.project; }
  if (ev.transcript_path) s.transcript = ev.transcript_path;
  if (ev.hud && ev.hud.pane) s.tmux = { socket: ev.hud.tmux.split(',')[0], pane: ev.hud.pane };
  s.updated = Date.now();
  return s;
}

// ---------- tool summaries / diffs ----------
const clip = (str, n = 160) => (str.length > n ? str.slice(0, n - 1) + '…' : str);
const short = (p) => (p ? p.replace(os.homedir(), '~') : '');

function summarize(tool, i = {}) {
  switch (tool) {
    case 'Read': return { file: i.file_path, text: short(i.file_path) + (i.offset ? `  L${i.offset}–${i.offset + (i.limit || 2000)}` : '') };
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit':
      return { file: i.file_path || i.notebook_path, text: short(i.file_path || i.notebook_path) };
    case 'Bash': return { text: clip(i.command || '', 200) };
    case 'Grep': return { text: `/${i.pattern}/ ${short(i.path || '')}` };
    case 'Glob': return { text: `${i.pattern} ${short(i.path || '')}` };
    case 'WebFetch': return { text: i.url };
    case 'WebSearch': return { text: i.query };
    case 'Task': case 'Agent': return { text: i.description || i.subagent_type || '' };
    case 'TodoWrite': return { text: `${(i.todos || []).length} todos` };
    default: return { text: clip(JSON.stringify(i), 140) };
  }
}

const lines = (s) => String(s ?? '').split('\n');
const cap = (a, n = 40) => (a.length > n ? [...a.slice(0, n), `… ${a.length - n} more lines`] : a);

function buildDiff(tool, i = {}) {
  try {
    const file = i.file_path;
    if (tool === 'Edit' || tool === 'MultiEdit') {
      const edits = tool === 'Edit' ? [i] : i.edits || [];
      let content = '';
      try { content = fs.readFileSync(file, 'utf8'); } catch {}
      const hunks = edits.map((e) => {
        const idx = content.indexOf(e.old_string);
        const start = idx >= 0 ? content.slice(0, idx).split('\n').length : null;
        return { start, del: cap(lines(e.old_string)), add: cap(lines(e.new_string)) };
      });
      return { file, hunks };
    }
    if (tool === 'Write') {
      let old = null;
      try { old = fs.readFileSync(file, 'utf8'); } catch {}
      const nw = lines(i.content);
      if (old === null) return { file, isNew: true, hunks: [{ start: 1, del: [], add: cap(nw) }] };
      const o = lines(old);
      let p = 0;
      while (p < o.length && p < nw.length && o[p] === nw[p]) p++;
      let e = 0;
      while (e < o.length - p && e < nw.length - p && o[o.length - 1 - e] === nw[nw.length - 1 - e]) e++;
      return { file, hunks: [{ start: p + 1, del: cap(o.slice(p, o.length - e)), add: cap(nw.slice(p, nw.length - e)) }] };
    }
  } catch {}
  return null;
}

// ---------- context window ----------
function readContext(s) {
  if (!s.transcript) return;
  try {
    const fd = fs.openSync(s.transcript, 'r');
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const rows = buf.toString('utf8').split('\n');
    for (let k = rows.length - 1; k >= 0; k--) {
      if (!rows[k].includes('"usage"')) continue;
      let m;
      try { m = JSON.parse(rows[k]); } catch { continue; }
      const u = m.message && m.message.usage;
      if (!u) continue;
      s.ctx.used = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
      if (m.message.model) s.model = m.message.model;
      break;
    }
  } catch {}
  s.ctx.max = /1m/i.test(s.model) || s.ctx.used > settings.ctxMax ? Math.max(1000000, settings.ctxMax) : settings.ctxMax;
}

function lastAssistantText(s) {
  if (!s.transcript) return '';
  try {
    const fd = fs.openSync(s.transcript, 'r');
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, 8 * 1024 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const rows = buf.toString('utf8').split('\n');
    for (let k = rows.length - 1; k >= 0; k--) {
      if (!rows[k].includes('"assistant"')) continue;
      let m;
      try { m = JSON.parse(rows[k]); } catch { continue; }
      if (m.type !== 'assistant' || !m.message || !Array.isArray(m.message.content)) continue;
      const text = m.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      if (text) return clip(text, 900);
    }
  } catch {}
  return '';
}

// ---------- event handling ----------
function pushFeed(s, entry) {
  s.feed.unshift({ id: ++seq, t: Date.now(), ...entry });
  if (s.feed.length > 60) s.feed.length = 60;
  return s.feed[0];
}

function handleEvent(ev) {
  const id = ev.session_id || 'unknown';
  const s = getSession(id, ev);
  const name = ev.hook_event_name;
  let extra = null;

  switch (name) {
    case 'SessionStart':
      s.status = 'idle'; s.note = ev.source || 'started';
      pushFeed(s, { emoji: '🚀', text: `session ${ev.source || 'start'}`, kind: 'info' });
      break;
    case 'UserPromptSubmit':
      s.status = 'thinking'; s.prompt = clip(ev.prompt || '', 300); s.tool = null; s.note = '';
      releaseStop(id);
      pushFeed(s, { emoji: '💬', text: clip(ev.prompt || '', 120), kind: 'prompt' });
      extra = takeQueued(id, 'UserPromptSubmit');
      break;
    case 'PreToolUse': {
      const tool = ev.tool_name;
      const sum = summarize(tool, ev.tool_input);
      const diff = buildDiff(tool, ev.tool_input);
      s.status = 'tool';
      s.tool = { name: tool, emoji: emojiFor(tool), ...sum, diff, started: Date.now() };
      if (/^Read$|^Grep$|^Glob$/.test(tool)) s.stats.reads++;
      else if (/Edit|Write|Notebook/.test(tool)) s.stats.edits++;
      else if (tool === 'Bash') s.stats.cmds++;
      else s.stats.other++;
      pushFeed(s, { emoji: emojiFor(tool), tool, text: sum.text, diff, toolUseId: ev.tool_use_id, kind: 'tool', running: true });
      break;
    }
    case 'PostToolUse': {
      const f = s.feed.find((x) => x.toolUseId && x.toolUseId === ev.tool_use_id);
      if (f) { f.running = false; f.ms = Date.now() - f.t; }
      s.tool = null; s.status = 'thinking';
      readContext(s);
      extra = takeQueued(id, 'PostToolUse');
      break;
    }
    case 'Notification':
      s.status = 'waiting'; s.note = ev.message || 'needs your attention';
      pushFeed(s, { emoji: '🙋', text: clip(s.note, 140), kind: 'ask' });
      toast(`Claude · ${s.project}`, s.note);
      break;
    case 'Stop':
      s.status = 'done'; s.tool = null; readContext(s); s.lastMsg = ev.last_assistant_message || lastAssistantText(s);
      pushFeed(s, { emoji: '💬', text: clip(s.lastMsg || 'waiting for you', 120), kind: 'done' });
      break;
    case 'SubagentStop':
      pushFeed(s, { emoji: '🤖', text: 'subagent finished', kind: 'info' });
      break;
    case 'SessionEnd':
      releaseStop(id);
      sessions.delete(id);
      break;
  }
  if (name !== 'SessionEnd') readContext(s);
  emit();
  return extra;
}

function takeQueued(id, evName) {
  const q = queued.get(id);
  if (!q || !q.length) return null;
  queued.delete(id);
  emit();
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: evName,
      additionalContext: `Message from the user, sent from the Buddy HUD desktop overlay while you were working:\n${q.join('\n')}\nTake it into account now.`,
    },
  });
}

function releaseStop(id) {
  const res = stopHolds.get(id);
  if (res) { stopHolds.delete(id); try { res.end('{}'); } catch {} }
}

function toast(title, body) {
  try { if (Notification.isSupported()) new Notification({ title, body, silent: false }).show(); } catch {}
}

// ---------- HTTP bridge ----------
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    let ev;
    try { ev = JSON.parse(body); } catch { return res.end('{}'); }
    const route = req.url === '/hook'
      ? (ev.hook_event_name === 'PermissionRequest' ? '/permission' : ev.hook_event_name === 'Stop' ? '/stop' : '/event')
      : req.url;
    const hdr = (k) => { const v = String(req.headers[k] || ''); return v.startsWith('$') ? '' : v; };
    if (hdr('x-buddy-pane')) ev.hud = { tmux: hdr('x-buddy-tmux'), pane: hdr('x-buddy-pane') };
    const id = ev.session_id || 'unknown';
    const extra = handleEvent(ev);

    if (route === '/permission') {
      const pid = 'p' + ++seq;
      const s = getSession(id, ev);
      const tool = ev.tool_name;
      const sum = summarize(tool, ev.tool_input);
      pendingPerms.set(pid, { res, sessionId: id, tool, emoji: emojiFor(tool), summary: sum.text, diff: buildDiff(tool, ev.tool_input), input: ev.tool_input, t: Date.now() });
      s.status = 'permission';
      pushFeed(s, { emoji: '🔐', text: `permission: ${tool} ${clip(sum.text, 90)}`, kind: 'ask' });
      toast(`🔐 ${s.project}: allow ${tool}?`, clip(sum.text, 120));
      res.on('close', () => { if (!res.writableEnded && pendingPerms.delete(pid)) { if (s.status === 'permission') s.status = 'tool'; emit(); } });
      emit();
      return;
    }
    if (route === '/stop') {
      if (!settings.replyMode) return res.end('{}');
      const q = queued.get(id);
      if (q && q.length) {
        queued.delete(id);
        return res.end(JSON.stringify({ decision: 'block', reason: `The user replied via the Buddy HUD desktop overlay:\n${q.join('\n')}` }));
      }
      releaseStop(id);
      stopHolds.set(id, res);
      res.on('close', () => { if (!res.writableEnded && stopHolds.get(id) === res) { stopHolds.delete(id); emit(); } });
      emit();
      return;
    }
    res.end(extra || '{}');
  });
});
server.listen(PORT, '127.0.0.1');

// ---------- window ----------
function snapshot() {
  return {
    settings,
    sessions: [...sessions.values()].sort((a, b) => b.updated - a.updated).map((s) => ({
      ...s, canReply: stopHolds.has(s.id), canType: !!s.tmux, queued: (queued.get(s.id) || []).length,
    })),
    perms: [...pendingPerms.entries()].map(([id, p]) => ({ id, sessionId: p.sessionId, tool: p.tool, emoji: p.emoji, summary: p.summary, diff: p.diff, t: p.t })),
  };
}

let emitTimer;
function emit() {
  clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('state', snapshot());
    const active = sessions.size > 0;
    clearTimeout(hideTimer);
    if (active) {
      if (!win.isVisible()) win.showInactive();
    } else {
      hideTimer = setTimeout(() => { if (!sessions.size && !process.env.HUD_KEEP) win.hide(); }, 15000);
    }
  }, 30);
}

function fit(w, h) {
  if (!win || win.isDestroyed()) return;
  w = Math.max(160, Math.min(520, Math.ceil(w))); h = Math.max(120, Math.min(900, Math.ceil(h)));
  const b = win.getBounds();
  if (b.width === w && b.height === h) return;
  const disp = screen.getDisplayMatching(b).workArea;
  // keep bottom-right corner anchored so bubbles grow up/left
  let x = b.x + b.width - w;
  let y = b.y + b.height - h;
  x = Math.max(disp.x, Math.min(x, disp.x + disp.width - w));
  y = Math.max(disp.y, Math.min(y, disp.y + disp.height - h));
  win.setBounds({ x, y, width: w, height: h });
}

function createWindow() {
  const disp = screen.getPrimaryDisplay().workArea;
  const w = 260, h = 190;
  win = new BrowserWindow({
    width: w, height: h, x: disp.x + disp.width - w - 24, y: disp.y + disp.height - h - 24,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, show: false, focusable: true, backgroundColor: '#00000000', title: 'Buddy HUD', icon: path.join(__dirname, 'build', 'icon.png'), type: isMac ? 'panel' : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('state', snapshot());
    if (process.env.HUD_KEEP || sessions.size) win.showInactive();
    if (process.env.HUD_SHOT) setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.HUD_SHOT, img.toPNG());
      if (process.env.HUD_QUIT) app.quit();
    }, +process.env.HUD_SHOT_DELAY || 2500);
  });
}

ipcMain.on('decide', (_e, { id, behavior }) => {
  const p = pendingPerms.get(id);
  if (!p) return;
  pendingPerms.delete(id);
  const s = sessions.get(p.sessionId);
  if (s) s.status = behavior === 'terminal' ? 'permission' : 'tool';
  if (behavior === 'allow') p.res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }));
  else if (behavior === 'deny') p.res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denied by the user from the Buddy HUD overlay.' } } }));
  else p.res.end('{}'); // fall back to the terminal dialog
  emit();
});
ipcMain.on('reply', (_e, { sessionId, text }) => {
  const res = stopHolds.get(sessionId);
  if (res) {
    stopHolds.delete(sessionId);
    res.end(JSON.stringify({ decision: 'block', reason: `The user replied via the Buddy HUD desktop overlay:\n${text}` }));
    const s = sessions.get(sessionId);
    if (s) { s.status = 'thinking'; pushFeed(s, { emoji: '📨', text: clip(text, 120), kind: 'prompt' }); }
  } else if (sessions.get(sessionId) && sessions.get(sessionId).tmux && ['done', 'waiting', 'idle'].includes(sessions.get(sessionId).status)) {
    // Claude idle at its prompt inside tmux: type the reply straight into the pane
    const s = sessions.get(sessionId);
    const base = ['-S', s.tmux.socket];
    execFile('tmux', [...base, 'send-keys', '-t', s.tmux.pane, '-l', text], () =>
      setTimeout(() => execFile('tmux', [...base, 'send-keys', '-t', s.tmux.pane, 'Enter'], () => {}), 120));
    s.status = 'thinking';
    pushFeed(s, { emoji: '📨', text: clip(text, 120), kind: 'prompt' });
  } else {
    const q = queued.get(sessionId) || [];
    q.push(text);
    queued.set(sessionId, q);
    const s = sessions.get(sessionId);
    if (s) pushFeed(s, { emoji: '📬', text: 'queued: ' + clip(text, 100), kind: 'prompt' });
  }
  emit();
});
ipcMain.on('release', (_e, sessionId) => { releaseStop(sessionId); emit(); });
ipcMain.on('fit', (_e, { w, h }) => fit(w, h));
ipcMain.on('set', (_e, patch) => {
  settings = { ...settings, ...patch };
  saveSettings();
  if (!settings.replyMode) for (const id of [...stopHolds.keys()]) releaseStop(id);
  for (const s of sessions.values()) readContext(s);
  emit();
});
ipcMain.on('move', (_e, { dx, dy }) => {
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on('quit', () => app.quit());

app.on('second-instance', () => { if (win) { win.showInactive(); emit(); } });
let tray;
function buildTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'build', isMac ? 'tray.png' : 'tray@2x.png'));
    tray = new Tray(img.resize({ width: 18, height: 18 }));
  } catch { return; }
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / hide buddy', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
    { label: 'Install Claude Code hooks', click: () => { try { toast('Buddy HUD', require('./install-hooks').run(false)); } catch (e) { toast('Buddy HUD', 'Hook install failed: ' + e.message); } } },
    { label: 'Remove Claude Code hooks', click: () => { try { toast('Buddy HUD', require('./install-hooks').run(true)); } catch (e) { toast('Buddy HUD', 'Hook removal failed: ' + e.message); } } },
    { label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked }); refresh(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  refresh();
  tray.setToolTip('Buddy HUD');
  tray.on('click', () => (win.isVisible() ? win.hide() : win.showInactive()));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if (isMac && app.dock) app.dock.hide();
  const firstRun = !fs.existsSync(SETTINGS_FILE);
  createWindow();
  buildTray();
  if (firstRun) {
    saveSettings();
    app.setLoginItemSettings({ openAtLogin: true });
    const { response } = await dialog.showMessageBox({
      type: 'question', buttons: ['Install hooks', 'Not now'], defaultId: 0, title: 'Buddy HUD',
      message: 'Connect Buddy HUD to Claude Code?',
      detail: 'This adds a few curl hooks to ~/.claude/settings.json (a backup is saved next to it). You can remove them any time from the tray menu. Buddy HUD also starts at login; toggle that in the tray menu.',
    });
    if (response === 0) { try { toast('Buddy HUD', require('./install-hooks').run(false)); } catch (e) { toast('Buddy HUD', 'Hook install failed: ' + e.message); } }
  }
});
app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { for (const id of [...stopHolds.keys()]) releaseStop(id); for (const [, p] of pendingPerms) try { p.res.end('{}'); } catch {} });
