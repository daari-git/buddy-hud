const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan, priceFor } = require('../lib/usage');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-usage-'));
const file = path.join(dir, 't.jsonl');
const line = (id, model, u) => JSON.stringify({ type: 'assistant', message: { id, model, content: [], usage: u } }) + '\n';
const h = {};

// duplicates of one message (one line per content block) are counted once, keeping the fullest usage
fs.writeFileSync(file, line('a', 'claude-sonnet-4-5', { input_tokens: 1000, output_tokens: 10 }) + line('a', 'claude-sonnet-4-5', { input_tokens: 1000, output_tokens: 500 }) + 'not json\n');
let t = scan(h, file);
assert.strictEqual(t.msgs, 1); assert.strictEqual(t.in, 1000); assert.strictEqual(t.out, 500);
assert.ok(Math.abs(t.cost - (1000 * 3 + 500 * 15) / 1e6) < 1e-9);

// incremental: appends are picked up, a half-written last line waits for its newline
const half = line('b', 'claude-haiku-4-5', { input_tokens: 2000, output_tokens: 100, cache_read_input_tokens: 10000 });
fs.appendFileSync(file, half.slice(0, 40));
t = scan(h, file); assert.strictEqual(t.msgs, 1);
fs.appendFileSync(file, half.slice(40));
t = scan(h, file); assert.strictEqual(t.msgs, 2); assert.strictEqual(t.cacheRead, 10000);

// unknown model: tokens counted, cost not invented
fs.appendFileSync(file, line('c', 'claude-fable-9-9', { input_tokens: 5, output_tokens: 5 }));
t = scan(h, file); assert.strictEqual(t.msgs, 3); assert.deepStrictEqual(t.unpriced, ['claude-fable-9-9']);
assert.strictEqual(priceFor('claude-fable-9-9'), null);
assert.deepStrictEqual(priceFor('claude-fable-9-9', { 'claude-fable-9-9': [1, 2] }), [1, 2]);
assert.deepStrictEqual(priceFor('claude-sonnet-4-5-20250929'), [3, 15]);
assert.deepStrictEqual(priceFor('claude-opus-4-1-20250805'), [15, 75]);
assert.deepStrictEqual(priceFor('claude-opus-4-5'), [5, 25]);
assert.strictEqual(priceFor('claude-opus-5-5'), null);

// truncated/replaced file restarts cleanly; missing file does not throw
fs.writeFileSync(file, line('z', 'claude-haiku-4-5', { input_tokens: 1, output_tokens: 1 }));
t = scan(h, file); assert.strictEqual(t.msgs, 1);
assert.doesNotThrow(() => scan({}, path.join(dir, 'missing.jsonl')));
// today's messages only, by local date
const now = new Date();
const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const h2 = {}; const f2 = path.join(dir, 't2.jsonl');
fs.writeFileSync(f2, JSON.stringify({ type: 'assistant', timestamp: now.toISOString(), message: { id: 'n', model: 'claude-haiku-4-5', usage: { input_tokens: 7, output_tokens: 3 } } }) + '\n' + JSON.stringify({ type: 'assistant', timestamp: '2001-01-01T00:00:00Z', message: { id: 'o', model: 'claude-haiku-4-5', usage: { input_tokens: 99, output_tokens: 99 } } }) + '\n');
scan(h2, f2);
const te = require('../lib/usage').todayEntries(h2, key);
assert.strictEqual(te.length, 1); assert.strictEqual(te[0][0], 'n'); assert.strictEqual(te[0][1].in, 7);
console.log('usage: all tests passed');
