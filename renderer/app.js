const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n));
const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000 | 0); return s < 60 ? s + 's' : s < 3600 ? (s / 60 | 0) + 'm' : (s / 3600 | 0) + 'h'; };

const VERB = { Read: 'Reading', Edit: 'Editing', MultiEdit: 'Editing', Write: 'Writing', NotebookEdit: 'Editing notebook', Bash: 'Running command', Grep: 'Searching', Glob: 'Finding files', WebFetch: 'Fetching page', WebSearch: 'Searching the web', Task: 'Delegating to agent', Agent: 'Delegating to agent', TodoWrite: 'Planning' };
const ACT = { Read: 'read', Edit: 'type', MultiEdit: 'type', Write: 'type', NotebookEdit: 'type', Bash: 'type', Grep: 'search', Glob: 'search', WebSearch: 'search', WebFetch: 'search', Task: 'think', Agent: 'think', TodoWrite: 'type' };
const ITEM2 = { Edit: '✨', MultiEdit: '✨', Write: '✨', Bash: '⌨️', TodoWrite: '📋' };

let state = { sessions: [], perms: [], settings: {} };
let selected = null;
let drawer = false;
const open = new Set();
let lastFit = '';

// ---------- drag / click ----------
function dragger(el, onClick) {
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') && el !== $('mascot')) return;
    let moved = 0, lx = e.screenX, ly = e.screenY;
    const mv = (m) => { const dx = m.screenX - lx, dy = m.screenY - ly; moved += Math.abs(dx) + Math.abs(dy); lx = m.screenX; ly = m.screenY; if (moved > 4) hud.send('move', { dx, dy }); };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved <= 4 && onClick) onClick(); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
}
dragger($('mascot'), toggleDrawer);
$('pill').onclick = toggleDrawer;
function toggleDrawer() { drawer = !drawer; render(); if (drawer) setTimeout(() => $('replyInput').focus(), 50); }

$('btnQuit').onclick = () => hud.send('quit');
$('optReply').onchange = (e) => hud.send('set', { replyMode: e.target.checked });
$('optCtx').onchange = (e) => hud.send('set', { ctxMax: +e.target.value });

// ---------- reply ----------
function send() {
  const text = $('replyInput').value.trim();
  if (!text || !selected) return;
  hud.send('reply', { sessionId: selected, text });
  $('replyInput').value = ''; autosize();
}
const autosize = () => { const t = $('replyInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 90) + 'px'; t.style.overflowY = t.scrollHeight > 90 ? 'auto' : 'hidden'; };
$('btnSend').onclick = send;
$('btnSkip').onclick = () => selected && hud.send('release', selected);
$('replyInput').addEventListener('input', autosize);
$('replyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

// ---------- helpers ----------
function diffHtml(d, max = 14) {
  if (!d || !d.hunks) return '';
  let budget = max;
  const out = d.hunks.map((h) => {
    const head = `<div class="hunk">${d.isNew ? '✨ new file' : h.start ? 'line ' + h.start : 'line ?'} · <span style="color:#ffc2c2">−${h.del.length}</span> <span style="color:#b6f0cc">+${h.add.length}</span></div>`;
    const take = (arr, cls, sign) => arr.slice(0, Math.max(0, budget)).map((l) => { budget--; return `<div class="l ${cls}">${sign} ${esc(l)}</div>`; }).join('');
    return head + take(h.del, 'del', '-') + take(h.add, 'add', '+');
  }).join('');
  return `<div class="diff">${out}</div>`;
}

function actFor(s, perms) {
  if (perms.length) return { act: 'wait', eyes: 'wide', item: '❗', item2: '', look: '' };
  if (!s) return { act: 'idle', eyes: 'sleep', item: '💤', item2: '', look: '' };
  if (s.tool) {
    const a = ACT[s.tool.name] || (s.tool.name.startsWith('mcp__') ? 'type' : 'type');
    return { act: a, eyes: a === 'type' ? 'squint' : 'open', item: s.tool.emoji, item2: ITEM2[s.tool.name] || '', look: a === 'type' ? '' : '' };
  }
  switch (s.status) {
    case 'thinking': return { act: 'think', eyes: 'open', item: '💭', item2: '', look: 'up' };
    case 'waiting': return { act: 'wait', eyes: 'wide', item: '💬', item2: '', look: '' };
    case 'permission': return { act: 'wait', eyes: 'wide', item: '🔐', item2: '', look: '' };
    case 'done': return { act: 'wait', eyes: 'wide', item: '💬', item2: '', look: '' };
    default: return { act: 'idle', eyes: 'sleep', item: '💤', item2: '', look: '' };
  }
}

// ---------- render ----------
function render() {
  const ss = state.sessions;
  if (!ss.find((s) => s.id === selected)) selected = ss[0] ? ss[0].id : null;
  const s = ss.find((x) => x.id === selected);
  const perms = state.perms;
  const a = actFor(s, perms);
  document.body.dataset.act = a.act;

  const svg = $('clawd');
  svg.dataset.act = a.act; svg.dataset.eyes = a.eyes; svg.dataset.look = a.look;
  $('item').textContent = a.item; $('item2').textContent = a.item2;

  // context pill
  const pct = s && s.ctx.max ? Math.min(100, (s.ctx.used / s.ctx.max) * 100) : 0;
  const col = pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--amber)' : 'var(--green)';
  $('arc').style.strokeDasharray = `${pct} 100`; $('arc').style.stroke = col;
  $('pillPct').textContent = s ? `${pct.toFixed(0)}%` : '—';
  $('pillSub').textContent = s ? `${s.project} · ${fmt(s.ctx.used)}` : 'no session';

  // permission bubbles
  $('perms').innerHTML = perms.map((p) => {
    const proj = (ss.find((x) => x.id === p.sessionId) || {}).project || '';
    return `<div class="bubble perm"><div class="h">${p.emoji} <span>Can I use <b>${esc(p.tool)}</b>?</span><span class="grow"></span><span class="dim">${esc(proj)}</span></div>
      <div class="sub">${esc(p.summary)}</div>${diffHtml(p.diff)}
      <div class="acts"><button class="allow" data-d="allow" data-id="${p.id}">✅ Allow</button><button class="deny" data-d="deny" data-id="${p.id}">⛔ Deny</button><button data-d="terminal" data-id="${p.id}">⌨️ Terminal</button></div></div>`;
  }).join('');
  $('perms').querySelectorAll('button').forEach((b) => (b.onclick = () => hud.send('decide', { id: b.dataset.id, behavior: b.dataset.d })));

  // action bubble: current tool, or last tool for 3s, or done summary
  const act = $('action');
  let html = '';
  if (s && s.tool && !perms.length) {
    html = `<div class="h"><span class="dot"></span>${s.tool.emoji} <span>${VERB[s.tool.name] || esc(s.tool.name)}</span><span class="grow"></span><span class="dim">${ago(s.tool.started)}</span></div><div class="sub">${esc(s.tool.text)}</div>${diffHtml(s.tool.diff, 10)}`;
  } else if (s && !perms.length) {
    const last = s.feed.find((f) => f.kind === 'tool' && !f.running);
    const recent = last && Date.now() - (last.t + (last.ms || 0)) < 3500;
    if (s.status === 'done') {
      html = `<div class="h">💬 <span>Claude</span><span class="grow"></span><span class="dim">${s.stats.edits} edits · ${s.stats.reads} reads · ${s.stats.cmds} cmds</span></div>${s.lastMsg ? `<div class="say">${esc(s.lastMsg)}</div>` : ''}`;
    } else if (s.status === 'waiting') {
      html = `<div class="h">🙋 <span>${esc(s.note || 'Needs you')}</span></div>`;
    } else if (s.status === 'thinking' && recent) {
      html = `<div class="fade"><div class="h">✓ ${last.emoji} <span>${esc(last.tool)}</span></div><div class="sub">${esc(last.text)}</div></div>`;
    } else if (s.status === 'thinking') {
      html = `<div class="h"><span class="dot"></span>💭 <span>Thinking…</span></div>${s.prompt ? `<div class="sub">${esc(s.prompt)}</div>` : ''}`;
    }
  }
  act.hidden = !html || drawer;
  if (html && !drawer) act.innerHTML = html;

  // drawer
  $('drawer').hidden = !drawer;
  if (drawer) {
    $('optReply').checked = !!state.settings.replyMode;
    $('optCtx').value = String(state.settings.ctxMax || 200000);
    $('tabs').hidden = ss.length < 2;
    $('tabs').innerHTML = ss.map((x) => `<button data-id="${x.id}" class="${x.id === selected ? 'on' : ''}">${esc(x.project)}</button>`).join('');
    $('tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { selected = b.dataset.id; render(); }));
    $('chips').innerHTML = s ? `<span class="chip">🧠 ${fmt(s.ctx.used)} / ${fmt(s.ctx.max)}</span><span class="chip">📖 ${s.stats.reads}</span><span class="chip">✏️ ${s.stats.edits}</span><span class="chip">💻 ${s.stats.cmds}</span><span class="chip">🛠️ ${s.stats.other}</span>${s.model ? `<span class="chip">${esc(s.model.replace(/^claude-/, ''))}</span>` : ''}` : '';
    $('feed').innerHTML = s ? s.feed.map((f) => `<div class="item ${f.kind || ''}" data-id="${f.id}"><span class="e">${f.running ? '⏳' : f.emoji}</span><span class="t">${f.tool ? `<b>${esc(f.tool)}</b> ` : ''}${esc(f.text)}</span><span class="m">${f.ms != null ? f.ms + 'ms · ' : ''}${ago(f.t)}</span>${f.diff && open.has(f.id) ? diffHtml(f.diff, 30) : ''}</div>`).join('') : '';
    $('feed').querySelectorAll('.item').forEach((el) => (el.onclick = () => { const id = +el.dataset.id; open.has(id) ? open.delete(id) : open.add(id); render(); }));
  }

  // reply bubble (auto when Claude waits, or in drawer)
  const can = s && s.canReply;
  const idle = s && ['done', 'waiting'].includes(s.status);
  const showReply = !!s && (can || drawer || (idle && s.canType));
  $('reply').hidden = !showReply;
  $('replyHint').className = 'hint' + (can ? ' live' : '');
  $('replyHint').textContent = can ? '🟢 Claude is waiting — reply goes straight into the session' : idle && s.canType ? '⌨️ typed into your tmux pane' : '📬 queued — delivered at Claude’s next step (type in terminal if idle)';
  $('btnSkip').hidden = !can;

  requestAnimationFrame(fit);
}

function fit() {
  const st = $('stage');
  const w = st.offsetWidth + 20, h = st.offsetHeight + 20;
  const k = w + 'x' + h;
  if (k !== lastFit) { lastFit = k; hud.send('fit', { w, h }); }
}
new ResizeObserver(fit).observe($('stage'));

hud.onState((s) => { state = s; render(); });
window.__push = (s) => { state = s; render(); };
window.__ui = (o) => { if ('drawer' in o) drawer = o.drawer; render(); };
setInterval(render, 1500);
render();

if (location.search.includes('promo')) { const s = document.createElement('script'); s.src = 'promo.js'; document.body.appendChild(s); }
