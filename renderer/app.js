const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n));
const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000 | 0); return s < 60 ? s + 's' : s < 3600 ? (s / 60 | 0) + 'm' : (s / 3600 | 0) + 'h'; };

const VERB = { Read: 'Reading', Edit: 'Editing', MultiEdit: 'Editing', Write: 'Writing', NotebookEdit: 'Editing notebook', Bash: 'Running command', Grep: 'Searching', Glob: 'Finding files', WebFetch: 'Fetching page', WebSearch: 'Searching the web', Task: 'Delegating to agent', Agent: 'Delegating to agent', TodoWrite: 'Planning' };
const ACT = { Read: 'read', Edit: 'type', MultiEdit: 'type', Write: 'type', NotebookEdit: 'type', Bash: 'type', Grep: 'search', Glob: 'search', WebSearch: 'search', WebFetch: 'search', Task: 'think', Agent: 'think', TodoWrite: 'type' };
const ITEM2 = { Edit: '✨', MultiEdit: '✨', Write: '✨', Bash: '⌨️', TodoWrite: '📋' };

// ---------- model themes ----------
const FAMILIES = {
  fable: { name: 'Fable', c: '#d65db1', c2: '#f59bd9', arg: 'claude-fable-5-1' },
  opus: { name: 'Opus', c: '#9b7bf2', c2: '#c4b0ff', arg: 'opus' },
  sonnet: { name: 'Sonnet', c: '#d97757', c2: '#f0956f', arg: 'sonnet' },
  haiku: { name: 'Haiku', c: '#2fb7a3', c2: '#7ee2d1', arg: 'haiku' },
};
const famOf = (m) => ((String(m || '').match(/fable|opus|sonnet|haiku/i) || [''])[0]).toLowerCase();
const modelLabel = (m) => {
  const x = String(m || '').match(/claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?/i);
  if (x) return FAMILIES[x[1].toLowerCase()].name + ' ' + x[2] + (x[3] ? '.' + x[3] : '');
  return famOf(m) ? FAMILIES[famOf(m)].name : '';
};

// minimal, safe markdown for Claude's replies (escape first, then format)
function md(src) {
  let t = esc(src);
  const blocks = [], codes = [];
  t = t.replace(/```[a-zA-Z0-9_+-]*\n?([\s\S]*?)```/g, (_, c) => { blocks.push(c.replace(/\n$/, '')); return `\u0000B${blocks.length - 1}\u0000`; });
  t = t.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000C${codes.length - 1}\u0000`; });
  t = t.replace(/^#{1,6}\s+(.+)$/gm, '<div class="mdh">$1</div>');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/__([^_\n]+)__/g, '<b>$1</b>');
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<span class="lnk">$1</span>');
  t = t.replace(/^\s*[-*]\s+/gm, '• ');
  t = t.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`).replace(/\u0000B(\d+)\u0000/g, (_, i) => `<pre>${blocks[i]}</pre>`);
  return t;
}
const plain = (s) => String(s ?? '').replace(/\*\*|__|`/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/\s*\n\s*/g, ' ');
const base = (p) => String(p).split(/[\\/]/).pop();

let state = { sessions: [], perms: [], settings: {}, hooksInstalled: true };
let picker = false;
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
dragger($('mascot'), togglePicker);
$('pill').onclick = toggleDrawer;
function toggleDrawer() { drawer = !drawer; if (drawer) picker = false; render(); if (drawer) setTimeout(() => $('replyInput').focus(), 50); }
function togglePicker() { picker = !picker; if (picker) drawer = false; render(); }

$('btnQuit').onclick = () => hud.send('quit');
$('optReply').onchange = (e) => hud.send('set', { replyMode: e.target.checked });
$('optCtx').onchange = (e) => hud.send('set', { ctxMax: +e.target.value });
$('optScale').onchange = (e) => hud.send('set', { scale: +e.target.value });
$('optPrivacy').onchange = (e) => hud.send('set', { privacy: e.target.checked });
$('btnHide').onclick = () => hud.send('hide');
hud.onRefit(() => { lastFit = ''; fit(); });

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
  ss.forEach((x) => { x.files = x.files || { read: [], edited: [] }; });
  if (!ss.find((s) => s.id === selected)) selected = ss[0] ? ss[0].id : null;
  const s = ss.find((x) => x.id === selected);
  const perms = state.perms;
  const a = actFor(s, perms);
  document.body.dataset.act = a.act;

  // theme follows the model (picked model shows immediately, real model confirms later)
  const fam = (s && (s.pickedModel || famOf(s.model))) || 'sonnet';
  const th = FAMILIES[fam] || FAMILIES.sonnet;
  const rs = document.documentElement.style;
  rs.setProperty('--orange', th.c); rs.setProperty('--orange2', th.c2);
  document.body.classList.toggle('privacy', !!(state.settings && state.settings.privacy));
  const label = s ? (s.pickedModel && s.pickedModel !== famOf(s.model) ? th.name + ' …' : modelLabel(s.model) || th.name) : '';
  $('modelTag').hidden = !s; $('modelTag').querySelector('span').textContent = label;

  const svg = $('clawd');
  svg.dataset.act = a.act; svg.dataset.eyes = a.eyes; svg.dataset.look = a.look;
  $('item').textContent = a.item; $('item2').textContent = a.item2;

  // context pill
  const pct = s && s.ctx.max ? Math.min(100, (s.ctx.used / s.ctx.max) * 100) : 0;
  const col = pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--amber)' : 'var(--green)';
  $('arc').style.strokeDasharray = `${pct} 100`; $('arc').style.stroke = col;
  $('pillPct').textContent = s ? `${pct.toFixed(0)}% · ${fmt(s.ctx.used)}` : '—';
  $('pillSub').textContent = s ? `📖 ${s.files.read.length}  ✏️ ${s.files.edited.length}  💻 ${s.stats.cmds}` : 'no session';
  $('pill').title = s ? `${s.files.read.length} files read · ${s.files.edited.length} files edited · ${s.stats.cmds} commands` : '';

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
      html = `<div class="h">💬 <span>Claude</span><span class="grow"></span><span class="dim">${s.files.edited.length} edited · ${s.files.read.length} read · ${s.stats.cmds} cmds</span></div>${s.lastMsg ? `<div class="say">${md(s.lastMsg)}</div>` : ''}`;
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
    $('optScale').value = String(state.settings.scale || 1);
    $('optPrivacy').checked = !!state.settings.privacy;
    $('ver').textContent = 'Buddy HUD v' + (state.version || '');
    $('tabs').hidden = ss.length < 2;
    $('tabs').innerHTML = ss.map((x) => `<button data-id="${x.id}" class="${x.id === selected ? 'on' : ''}">${esc(x.project)}</button>`).join('');
    $('tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { selected = b.dataset.id; render(); }));
    $('chips').innerHTML = s ? `<span class="chip">🧠 ${fmt(s.ctx.used)} / ${fmt(s.ctx.max)}</span><span class="chip">📖 ${s.stats.reads} reads</span><span class="chip">✏️ ${s.stats.edits} edits</span><span class="chip">💻 ${s.stats.cmds} cmds</span><span class="chip">🛠️ ${s.stats.other} other</span><span class="chip proj">${esc(s.project)}</span>` : '';
    $('files').innerHTML = s ? `<div><div class="fh">✏️ Edited — ${s.files.edited.length} file${s.files.edited.length === 1 ? '' : 's'}</div><div class="fl ed">${s.files.edited.slice(-12).reverse().map((p) => `<span title="${esc(p)}">${esc(base(p))}</span>`).join('') || '<span>none yet</span>'}</div></div><div><div class="fh">📖 Read — ${s.files.read.length} file${s.files.read.length === 1 ? '' : 's'}</div><div class="fl">${s.files.read.slice(-12).reverse().map((p) => `<span title="${esc(p)}">${esc(base(p))}</span>`).join('') || '<span>none yet</span>'}</div></div>` : '';
    $('feed').innerHTML = s ? s.feed.map((f) => `<div class="item ${f.kind || ''}" data-id="${f.id}"><span class="e">${f.running ? '⏳' : f.emoji}</span><span class="t">${f.tool ? `<b>${esc(f.tool)}</b> ` : ''}${esc(plain(f.text))}</span><span class="m">${f.ms != null ? f.ms + 'ms · ' : ''}${ago(f.t)}</span>${f.diff && open.has(f.id) ? diffHtml(f.diff, 30) : ''}</div>`).join('') : '';
    $('feed').querySelectorAll('.item').forEach((el) => (el.onclick = () => { const id = +el.dataset.id; open.has(id) ? open.delete(id) : open.add(id); render(); }));
  }

  // model picker (opened by clicking the buddy)
  $('picker').hidden = !picker || !s;
  if (picker && s) {
    const cur = s.pickedModel || famOf(s.model);
    $('picker').innerHTML = `<div class="ph">Switch model for <b>${esc(s.project)}</b></div>` + Object.entries(FAMILIES).map(([k, f]) => `<button data-f="${k}" class="${cur === k ? 'on' : ''}" style="--c:${f.c}"><i></i><span class="nm">${f.name}</span><span class="sm">${cur === k ? '✓ in use' : '/model ' + f.arg}</span></button>`).join('') + `<div class="ph">${s.tmux || s.canType ? 'Sent to your tmux pane when Claude is idle.' : 'Copies the /model command — paste it into Claude Code.'}</div>`;
    $('picker').querySelectorAll('button').forEach((b) => (b.onclick = () => { hud.send('pickModel', { sessionId: s.id, family: b.dataset.f, arg: FAMILIES[b.dataset.f].arg }); picker = false; render(); }));
  }

  // onboarding / empty states
  const ob = $('onboard');
  if (state.hooksInstalled === false) {
    ob.hidden = false;
    ob.innerHTML = `<div class="h">👋 <span>Hi! I’m your Claude Code buddy</span></div><div class="sub" style="font-family:inherit">Connect me so I can show what Claude is doing. This adds a few hooks to <code>~/.claude/settings.json</code> (backup saved, removable any time).</div><div class="btnRow"><button class="primary" id="obInstall">Connect to Claude Code</button></div>`;
    $('obInstall').onclick = () => hud.send('installHooks');
  } else if (!ss.length) {
    ob.hidden = false;
    ob.innerHTML = `<div class="h">😴 <span>Waiting for Claude Code…</span></div><div class="sub" style="font-family:inherit">Start <code>claude</code> in a terminal and I’ll wake up. New sessions only; restart any that were already running.</div>`;
  } else ob.hidden = true;

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
window.__ui = (o) => { if ('drawer' in o) drawer = o.drawer; if ('picker' in o) picker = o.picker; render(); };
setInterval(render, 1500);
render();

if (location.search.includes('promo') || location.search.includes('dance')) { const s = document.createElement('script'); s.src = location.search.includes('dance') ? 'dance.js' : 'promo.js'; document.body.appendChild(s); }
