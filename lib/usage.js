// Token and cost accounting from a Claude Code transcript (JSONL). Incremental: each call reads only new bytes.
const fs = require('fs');

// USD per million tokens [input, output]. Only models whose price is certain are listed;
// anything else is counted in tokens but not priced. Users can add/override via ~/.buddy-hud/prices.json
const PRICES = [
  [/haiku-3-5/, [0.8, 4]],
  [/haiku-4-5/, [1, 5]],
  [/sonnet-3-7|sonnet-4(?!-[5-9])/, [3, 15]],
  [/sonnet-4-5/, [3, 15]],
  [/opus-4-5/, [5, 25]],
  [/opus-4-1|opus-4(?![-\d])|opus-4-0|opus-4-2025/, [15, 75]],
];

function priceFor(model, overrides = {}) {
  const key = String(model || '').replace(/\[1m\]$/, '');
  if (overrides[key]) return overrides[key];
  for (const [re, p] of PRICES) if (re.test(key)) return p;
  return null;
}

function newState() { return { off: 0, rem: Buffer.alloc(0), byId: new Map(), anon: 0 }; }

function msgCost(model, u, overrides) {
  const p = priceFor(model, overrides);
  if (!p) return null;
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[0] * 0.1 + (u.cache_creation_input_tokens || 0) * p[0] * 1.25) / 1e6;
}

function totals(st, overrides) {
  const t = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, msgs: 0, cost: 0, unpriced: [] };
  for (const { model, u } of st.byId.values()) {  // eslint-disable-line
    const i = u.input_tokens || 0, o = u.output_tokens || 0, cr = u.cache_read_input_tokens || 0, cw = u.cache_creation_input_tokens || 0;
    t.in += i; t.out += o; t.cacheRead += cr; t.cacheWrite += cw; t.msgs++;
    const c = msgCost(model, u, overrides);
    if (c !== null) t.cost += c;
    else if (model && !t.unpriced.includes(model)) t.unpriced.push(model);
  }
  return t;
}

// Mutates `holder._usageState`; returns the totals (or null if nothing readable).
function scan(holder, file, overrides) {
  if (!file) return null;
  const st = holder._usageState || (holder._usageState = newState());
  let size;
  try { size = fs.statSync(file).size; } catch { return holder._usage || null; }
  if (size < st.off) Object.assign(st, newState()); // file was replaced/truncated: start over
  if (size === st.off) return holder._usage || totals(st, overrides);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    while (st.off < size) {
      const len = Math.min(size - st.off, 16 * 1024 * 1024);
      const buf = Buffer.alloc(len);
      const n = fs.readSync(fd, buf, 0, len, st.off);
      if (!n) break;
      st.off += n;
      const data = Buffer.concat([st.rem, buf.subarray(0, n)]);
      const nl = data.lastIndexOf(10);
      if (nl < 0) { st.rem = data; continue; }
      st.rem = data.subarray(nl + 1);
      for (const line of data.subarray(0, nl).toString('utf8').split('\n')) {
        if (!line.includes('"usage"')) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        const msg = m && m.type === 'assistant' && m.message;
        if (!msg || !msg.usage || msg.model === '<synthetic>') continue;
        const id = msg.id || m.uuid || 'anon' + st.anon++;
        const prev = st.byId.get(id);
        // the same message is written once per content block; keep the most complete usage
        if (!prev || (msg.usage.output_tokens || 0) >= (prev.u.output_tokens || 0)) st.byId.set(id, { model: msg.model, u: msg.usage, ts: m.timestamp ? Date.parse(m.timestamp) : Date.now() });
      }
    }
  } catch { /* unreadable file: keep what we have */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  holder._usage = totals(st, overrides);
  return holder._usage;
}

// Messages written on the given local calendar day, as plain numbers (for the persistent daily total).
function todayEntries(holder, dayKey, overrides) {
  const st = holder._usageState; const out = [];
  if (!st) return out;
  for (const [id, { model, u, ts }] of st.byId) {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (key !== dayKey) continue;
    out.push([id, { in: u.input_tokens || 0, out: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, cw: u.cache_creation_input_tokens || 0, cost: msgCost(model, u, overrides) }]);
  }
  return out;
}

module.exports = { scan, priceFor, msgCost, todayEntries, PRICES };
