// Dance scene (?dance): the buddy dancing on a beat, silent, for social clips. Loaded only for recording.
document.body.classList.add('dance');
// design size is 1080x1920 CSS px; normalise whatever viewport the recorder gives us
const fitZoom = () => { document.documentElement.style.zoom = String(innerWidth / 1080); };
fitZoom(); addEventListener('resize', fitZoom);
let last = null;
(() => { // virtual clock, same contract as promo.js
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
    if (last) window.__dance(...last);
    return true;
  };
})();

const css = document.createElement('style');
css.textContent = `
:root { --beat: .6s; }
body.dance { padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: linear-gradient(180deg, #1b1020 0%, #3a1a2c 45%, #7a3326 100%); }
body.dance #stage { display: none; }
#bg { position: fixed; inset: 0; overflow: hidden; }
#glow { position: absolute; left: 50%; top: 52%; width: 1100px; height: 1100px; margin: -550px 0 0 -550px; border-radius: 50%; background: radial-gradient(circle, rgba(255,150,100,.55), rgba(255,100,80,.18) 45%, transparent 70%); animation: pulse var(--beat) ease-in-out infinite; }
@keyframes pulse { 0%, 100% { scale: .92; opacity: .7; } 30% { scale: 1.08; opacity: 1; } }
.beam { position: absolute; top: -200px; width: 260px; height: 2200px; background: linear-gradient(180deg, rgba(255,210,170,.22), transparent 80%); transform-origin: 50% 0; filter: blur(20px); }
#beam1 { left: 160px; animation: beamL calc(var(--beat) * 8) ease-in-out infinite; }
#beam2 { right: 160px; animation: beamR calc(var(--beat) * 8) ease-in-out infinite; }
@keyframes beamL { 0%, 100% { transform: rotate(-22deg); } 50% { transform: rotate(14deg); } }
@keyframes beamR { 0%, 100% { transform: rotate(22deg); } 50% { transform: rotate(-14deg); } }
#floor { position: absolute; left: 0; right: 0; bottom: 0; height: 560px; background: linear-gradient(180deg, transparent, rgba(0,0,0,.45)); }
#floor::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: linear-gradient(90deg, transparent, rgba(255,170,130,.6), transparent); }
.note { position: absolute; bottom: 560px; font-size: 90px; opacity: 0; font-family: "Noto Color Emoji", sans-serif; animation: rise calc(var(--beat) * 6) linear infinite; }
@keyframes rise { 0% { translate: 0 0; opacity: 0; scale: .6; } 15% { opacity: .95; } 100% { translate: var(--dx, 60px) -1100px; opacity: 0; scale: 1.2; rotate: var(--rot, 20deg); } }
#shadow { position: absolute; left: 50%; bottom: 470px; width: 620px; height: 70px; margin-left: -310px; border-radius: 50%; background: rgba(0,0,0,.5); filter: blur(18px); animation: shadowBeat var(--beat) ease-in-out infinite; }
@keyframes shadowBeat { 0%, 100% { scale: 1 1; opacity: .75; } 55% { scale: .78 .8; opacity: .45; } }
#brand { position: fixed; left: 0; right: 0; bottom: 120px; text-align: center; white-space: nowrap; font: 600 34px system-ui; color: rgba(255,255,255,.45); letter-spacing: 1px; }

body.dance #mascot { position: fixed; left: 50%; top: 560px; margin-left: -450px; width: 900px; height: 840px; cursor: default; }
body.dance #mascot .shadow { display: none; }
body.dance #clawd { filter: drop-shadow(0 0 60px rgba(255,150,100,.5)); overflow: visible; }
body.dance #clawd text { font-size: 38px; }

/* ---- choreography (beat = var(--beat)) ---- */
#clawd[data-act=dance] .body { animation: bounce var(--beat) ease-in-out infinite; }
@keyframes bounce { 0%, 100% { translate: 0 0; scale: 1 1; } 22% { translate: 0 8px; scale: 1.05 .93; } 55% { translate: 0 -34px; scale: .97 1.05; } }
#clawd[data-act=dance] .rig { animation: sway calc(var(--beat) * 2) ease-in-out infinite; transform-origin: 50% 100%; }
@keyframes sway { 0%, 100% { transform: rotate(-4.5deg); } 50% { transform: rotate(4.5deg); } }
#clawd[data-act=dance] #legA { animation: stepA calc(var(--beat) * 2) ease-in-out infinite; }
#clawd[data-act=dance] #legB { animation: stepB calc(var(--beat) * 2) ease-in-out infinite; }
@keyframes stepA { 0%, 50%, 100% { translate: 0 0; } 25% { translate: 0 -14px; } }
@keyframes stepB { 0%, 50%, 100% { translate: 0 0; } 75% { translate: 0 -14px; } }
#clawd[data-act=dance] #item { opacity: 1; animation: floaty calc(var(--beat)) ease-in-out infinite; }
@keyframes floaty { 50% { translate: 0 -16px; } }
#clawd[data-act=dance] .hand rect { fill: #f0956f; }

/* pump: arms alternate up on the beat */
#clawd[data-move=pump] #handL { transform: translate(6px, 0); animation: pumpL calc(var(--beat) * 2) ease-in-out infinite; }
#clawd[data-move=pump] #handR { transform: translate(-6px, 0); animation: pumpR calc(var(--beat) * 2) ease-in-out infinite; }
@keyframes pumpL { 0%, 50%, 100% { translate: 0 0; } 25% { translate: 0 -70px; } }
@keyframes pumpR { 0%, 50%, 100% { translate: 0 0; } 75% { translate: 0 -70px; } }
/* wave: both hands overhead, waving */
#clawd[data-move=wave] #handL { transform: translate(8px, -78px) rotate(-14deg); animation: waveL var(--beat) ease-in-out infinite; }
#clawd[data-move=wave] #handR { transform: translate(-8px, -78px) rotate(14deg); animation: waveR var(--beat) ease-in-out infinite; }
@keyframes waveL { 50% { translate: -14px -16px; rotate: -18deg; } }
@keyframes waveR { 50% { translate: 14px -16px; rotate: 18deg; } }
/* disco: point up-right, then up-left */
#clawd[data-move=disco] #handR { animation: pointR calc(var(--beat) * 2) steps(1) infinite; }
#clawd[data-move=disco] #handL { animation: pointL calc(var(--beat) * 2) steps(1) infinite; }
@keyframes pointR { 0% { transform: translate(-14px, -92px) rotate(-26deg); } 50% { transform: translate(0, 18px); } }
@keyframes pointL { 0% { transform: translate(0, 18px); } 50% { transform: translate(14px, -92px) rotate(26deg); } }
#clawd[data-move=disco] .rig { animation: swayBig calc(var(--beat) * 2) ease-in-out infinite; }
@keyframes swayBig { 0%, 100% { transform: rotate(-9deg) translateX(-30px); } 50% { transform: rotate(9deg) translateX(30px); } }
/* spin: turn around every 2 beats with a hop */
#clawd[data-move=spin] .rig { animation: turn calc(var(--beat) * 4) ease-in-out infinite; transform-origin: 50% 70%; }
@keyframes turn { 0% { transform: scaleX(1) rotate(0); } 25% { transform: scaleX(-1) rotate(-6deg) translateY(-30px); } 50% { transform: scaleX(1) rotate(6deg); } 75% { transform: scaleX(-1) rotate(-6deg) translateY(-30px); } 100% { transform: scaleX(1) rotate(0); } }
#clawd[data-move=spin] #handL { transform: translate(0, -60px); animation: waveL var(--beat) ease-in-out infinite; }
#clawd[data-move=spin] #handR { transform: translate(0, -60px); animation: waveR var(--beat) ease-in-out infinite; }
/* finale: cheer pose */
#clawd[data-move=pose] #handL { transform: translate(-4px, -92px) rotate(-12deg); }
#clawd[data-move=pose] #handR { transform: translate(4px, -92px) rotate(12deg); }
#clawd[data-move=pose] .body { animation: bounce calc(var(--beat) * 2) ease-in-out infinite; }
`;
document.head.appendChild(css);

document.body.insertAdjacentHTML('afterbegin', `<div id="bg"><div id="glow"></div><div class="beam" id="beam1"></div><div class="beam" id="beam2"></div><div id="floor"></div><div id="shadow"></div></div>`);
const notes = ['🎵', '🎶', '✨', '🎵', '🎶', '✨', '🎵', '🎶'];
notes.forEach((n, i) => {
  const d = document.createElement('div'); d.className = 'note'; d.textContent = n;
  d.style.left = (90 + i * 120) + 'px'; d.style.animationDelay = (-i * 0.45) + 's';
  d.style.setProperty('--dx', (i % 2 ? -1 : 1) * (40 + (i * 13) % 60) + 'px'); d.style.setProperty('--rot', (i % 2 ? -1 : 1) * 25 + 'deg');
  document.getElementById('bg').appendChild(d);
});
document.body.insertAdjacentHTML('beforeend', `<div id="brand">Buddy HUD · desktop buddy for Claude Code</div>`);

document.body.appendChild(document.getElementById('mascot')); // out of the hidden HUD stage
window.__dance = (move, eyes, item) => {
  last = [move, eyes, item];
  const s = document.getElementById('clawd');
  s.dataset.act = 'dance'; s.dataset.move = move; s.dataset.eyes = eyes; s.dataset.look = '';
  document.getElementById('item').textContent = item || '';
};

// app.js re-renders on a real-time timer and resets the face; snap back to the choreography immediately
new MutationObserver(() => { if (last) { const s = document.getElementById('clawd'); if (s.dataset.act !== 'dance' || s.dataset.eyes !== last[1] || s.dataset.move !== last[0]) window.__dance(...last); } })
  .observe(document.getElementById('clawd'), { attributes: true, attributeFilter: ['data-act', 'data-eyes', 'data-move', 'data-look'] });
