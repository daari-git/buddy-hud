// Promo-only scene: fake desktop, terminal mock, captions. Loaded with ?promo.
document.body.classList.add('promo');
// virtual clock so the recorder can step time deterministically
(() => {
  let vt = 0; const base = Date.now(); const timers = []; const starts = new WeakMap();
  Date.now = () => base + vt;
  window.setTimeout = (fn, ms = 0) => { timers.push({ t: vt + ms, fn }); };
  window.__tick = (t) => {
    vt = t;
    for (let i = 0; i < timers.length;) { if (timers[i].t <= vt) { const [x] = timers.splice(i, 1); try { x.fn(); } catch {} } else i++; }
    for (const a of document.getAnimations()) {
      if (!starts.has(a)) { starts.set(a, vt); a.pause(); }
      a.currentTime = Math.max(0, vt - starts.get(a));
    }
    return true;
  };
})();
const css = document.createElement('style');
css.textContent = `
body.promo { padding: 0; width: 100vw; height: 100vh; background: radial-gradient(1200px 700px at 75% 70%, #3a2218 0%, #15110f 55%, #0c0a09 100%); overflow: hidden; }
body.promo::before { content: ""; position: fixed; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 64px 64px; mask-image: radial-gradient(circle at 60% 60%, #000, transparent 75%); }
body.promo #stage { z-index: 5; position: fixed; right: 110px; bottom: 150px; float: none; zoom: 2; }
body.promo .bubble { animation: none !important; }
#term { position: fixed; left: 80px; top: 110px; width: 860px; height: 700px; border-radius: 18px; background: #181513; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 30px 80px rgba(0,0,0,.6); overflow: hidden; font: 22px/1.55 "JetBrains Mono", ui-monospace, monospace; }
#term .bar { height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: #221e1b; color: #8c8279; font: 16px system-ui; }
#term .bar i { width: 14px; height: 14px; border-radius: 50%; display: block; }
#term .body { padding: 20px 26px; color: #e9e2db; white-space: pre-wrap; }
#term .ln { opacity: 0; transform: translateY(6px); animation: lnin .25s forwards; }
@keyframes lnin { to { opacity: 1; transform: none; } }
#term .dim { color: #8c8279; } #term .ok { color: #5fd38d; } #term .org { color: #e58b6b; } #term .red { color: #ff8a8a; } #term .grn { color: #8fe3b0; }
#cap { position: fixed; left: 0; right: 0; bottom: 56px; text-align: center; font: 700 54px/1.2 system-ui, "Noto Color Emoji", sans-serif; color: #fff; letter-spacing: -.5px; text-shadow: 0 4px 24px rgba(0,0,0,.6); transition: opacity .35s, transform .35s; }
#cap small { display: block; font: 500 28px system-ui; color: #cdbfb2; margin-top: 8px; letter-spacing: 0; }
#cap.off { opacity: 0; transform: translateY(14px); }
#cap em { font-style: normal; color: #e58b6b; }
#title { z-index: 20; position: fixed; inset: 0; display: grid; place-items: center; text-align: center; background: rgba(12,10,9,.0); opacity: 0; transition: opacity .6s; pointer-events: none; }
#title.on { opacity: 1; background: rgba(12,10,9,.88); }
#title h1 { font: 800 96px/1.05 system-ui; color: #fff; letter-spacing: -2px; }
#title h1 em { font-style: normal; color: #e58b6b; }
#title p { font: 500 34px system-ui; color: #cdbfb2; margin-top: 18px; }
#title .tag { display: inline-block; margin-top: 28px; padding: 6px 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); color: #a79d92; font: 22px system-ui; }
@media (orientation: portrait) {
  #term { left: 50%; transform: translateX(-50%); top: 80px; width: 940px; height: 340px; font-size: 25px; }
  #term .bar { height: 54px; font-size: 19px; }
  body.promo #stage { right: 48px; bottom: 340px; zoom: 2.3; }
  #cap { bottom: 110px; font-size: 70px; padding: 0 50px; }
  #cap small { font-size: 36px; }
  #title h1 { font-size: 124px; padding: 0 40px; }
  #title p { font-size: 42px; padding: 0 70px; }
  #title .tag { font-size: 28px; }
}`;
document.head.appendChild(css);

document.body.insertAdjacentHTML('beforeend', `
<div id="term"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span style="margin-left:14px">claude — ~/my-app</span></div><div class="body" id="termBody"></div></div>
<div id="cap" class="off"></div>
<div id="title"><div><h1 id="t1"></h1><p id="t2"></p><span class="tag" id="t3"></span></div></div>`);

window.__term = (html, cls = '') => {
  const b = document.getElementById('termBody');
  const d = document.createElement('div'); d.className = 'ln ' + cls; d.innerHTML = html; b.appendChild(d);
  while (b.scrollHeight > b.clientHeight + 40 && b.firstChild) b.removeChild(b.firstChild);
};
window.__cap = (html, sub = '') => {
  const c = document.getElementById('cap');
  c.classList.add('off');
  setTimeout(() => { c.innerHTML = html + (sub ? `<small>${sub}</small>` : ''); c.classList.toggle('off', !html); }, 260);
};
window.__title = (h, p, tag) => {
  const t = document.getElementById('title');
  document.getElementById('t1').innerHTML = h || ''; document.getElementById('t2').innerHTML = p || ''; document.getElementById('t3').innerHTML = tag || '';
  t.classList.toggle('on', !!h);
};
window.__type = (text) => { const i = document.getElementById('replyInput'); i.value = text; i.dispatchEvent(new Event('input')); };
