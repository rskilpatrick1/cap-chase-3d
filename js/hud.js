'use strict';
/* =====================================================================
   hud.js - EVERYTHING FLAT ON TOP OF THE 3D VIEW
   A transparent 2D canvas laid over the 3D one. It draws the caps
   counter, score, mini-map and monkey compass, plus things that float in
   the world (speech bubbles, score popups, dust). For those, toScreen()
   asks the camera where a 3D point lands on the screen.
   ===================================================================== */

const hud = document.getElementById('hud'), ctx = hud.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  W = window.innerWidth; H = window.innerHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  hud.width = Math.round(W * DPR); hud.height = Math.round(H * DPR);
  if (L) buildMinimap();
}
window.addEventListener('resize', resize);

// Where a map point (x, y) at height h lands on the screen, or null if it's behind the camera.
const tmpV = new THREE.Vector3(), tmpC = new THREE.Vector3();
function toScreen(x, y, h) {
  tmpC.set(x, h, y).applyMatrix4(camera.matrixWorldInverse);
  if (tmpC.z > -5) return null;
  tmpV.set(x, h, y).project(camera);
  return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * H, scale: clamp(300 / -tmpC.z, 0.5, 1.6) };
}
Hooks.onScreen = (x, y, h) => { const s = toScreen(x, y, h); return !!s && s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40; };

function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ellipse(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), f = c => clamp(Math.round(c + c * amt), 0, 255); return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
function drawCap2D(x, y, color, s = 1) {
  ellipse(x, y + 2 * s, 13 * s, 4 * s, shade(color, -0.25));
  ctx.beginPath(); ctx.ellipse(x, y + s, 10 * s, 8 * s, 0, Math.PI, TAU); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * s; ctx.stroke();
}
function outlinedText(text, x, y, fill) {
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff8e8'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// ---------- Mini-map: painted once per place, then dots move over it ----------
let minimap = null, mmScale = 1;
function buildMinimap() {
  const mw = clamp(Math.round(W * 0.2), 170, 240); mmScale = mw / L.w; const mh = Math.round(L.h * mmScale);
  const c = document.createElement('canvas'); c.width = mw * DPR; c.height = mh * DPR;
  const g = c.getContext('2d'); g.scale(DPR * mmScale, DPR * mmScale);
  g.fillStyle = L.grass; g.fillRect(0, 0, L.w, L.h);
  const order = { sand: 0, rocky: 0, meadow: 0, plaza: 1, path: 1, water: 2, pond: 2, bridge: 3, pier: 3 };
  const ground = L.things.filter(t => t.k in order).sort((a, b) => order[a.k] - order[b.k]);
  for (const t of ground) {
    if (t.k === 'sand') { g.fillStyle = '#e8d29b'; g.fillRect(t.x, t.y, t.w, t.h); }
    if (t.k === 'rocky') { g.fillStyle = '#b7b09b'; g.fillRect(t.x, t.y, t.w, t.h); }
    if (t.k === 'plaza') { g.fillStyle = '#cdbf9f'; g.fillRect(t.x, t.y, t.w, t.h); }
    if (t.k === 'path') { g.strokeStyle = '#dcc394'; g.lineWidth = t.w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); t.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
    if (t.k === 'water') { g.fillStyle = '#6a9db6'; g.fillRect(t.x, t.y, t.w, t.h); }
    if (t.k === 'pond') { g.fillStyle = '#6a9db6'; g.beginPath(); g.arc(t.x, t.y, t.r, 0, TAU); g.fill(); }
    if (t.k === 'bridge' || t.k === 'pier') { g.fillStyle = '#b98b55'; g.fillRect(t.x, t.y, t.w, t.h); }
  }
  for (const t of L.things) {
    if (t.k === 'ramp') { g.fillStyle = '#f6d65a'; g.fillRect(t.x - 40, t.y - 40, 80, 80); }
    else if (t.k === 'tree') { g.fillStyle = '#5a7c3c'; g.beginPath(); g.arc(t.x, t.y, 32 * t.s, 0, TAU); g.fill(); }
    else if (t.k === 'house' || t.k === 'stall' || t.k === 'clock') { g.fillStyle = t.roof || t.c || '#c98f6a'; g.fillRect(t.x, t.y, t.w, t.h); }
    else if (['windmill', 'well', 'fountain', 'lighthouse'].includes(t.k)) {
      g.fillStyle = t.k === 'lighthouse' ? '#c0392b' : t.k === 'fountain' ? '#9fc6d6' : '#e9dcc0';
      g.beginPath(); g.arc(t.x, t.y, 70, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 14; g.stroke();
    }
  }
  minimap = { canvas: c, w: mw, h: mh };
}

// ---------- Drawing the HUD each frame ----------
function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const inGame = phase === 'play' || phase === 'won' || phase === 'paused';

  // Floating things in the world: dust, the bell ring, Zzz, speech bubbles, score popups.
  for (const p of particles) {
    const s = toScreen(p.x, p.y, p.z); if (!s) continue;
    ctx.globalAlpha = 1 - p.t / p.life; ellipse(s.x, s.y, p.r * s.scale, p.r * s.scale, p.color);
  }
  ctx.globalAlpha = 1;
  if (bellRingT >= 0) {
    const s = toScreen(P.x, P.y, 0);
    if (s) { ctx.strokeStyle = 'rgba(61,106,158,' + (1 - bellRingT / 0.8) + ')'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(s.x, s.y, bellRingT / 0.8 * 300, bellRingT / 0.8 * 90, 0, 0, TAU); ctx.stroke(); }
  }
  if (P.asleep && phase === 'story') {
    const s = toScreen(P.x, P.y, 100);
    if (s) {
      ctx.fillStyle = '#3d6a9e'; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const k = (clock * 0.45 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.font = '700 ' + (16 + k * 16) + 'px Fredoka, sans-serif'; ctx.fillText('z', s.x + 10 + k * 30, s.y - k * 60); }
      ctx.globalAlpha = 1;
    }
  }
  for (const b of bubbles) {
    const m = b.m, s = toScreen(m.x, m.y, (m.z || 0) + (m.isPeddler ? 120 : 62)); if (!s) continue;
    ctx.font = '700 17px Fredoka, sans-serif';
    const w = ctx.measureText(b.text).width + 20, h = 30, pop = Math.min(1, b.t * 8);
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(pop, pop);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(-w / 2, -h, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(0, 9); ctx.lineTo(6, -1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 9); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = m.isPeddler ? '#b8432f' : INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, 0, -h / 2 + 1); ctx.restore(); ctx.textBaseline = 'alphabetic';
  }
  ctx.textAlign = 'center';
  for (const p of popups) {
    const s = toScreen(p.x, p.y, p.h); if (!s) continue;
    const k = p.t / p.life; ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.font = '700 26px Fredoka, sans-serif';
    outlinedText(p.text, s.x, s.y - k * 40, p.color);
  }
  ctx.globalAlpha = 1;
  if (!inGame) return;

  // Caps counter: ten slots that fill in with each cap you win back.
  ctx.textAlign = 'left';
  const x0 = 16, y0 = 14, slot = 30, panelW = 26 + slot * CAPS_PER_LEVEL;
  ctx.fillStyle = 'rgba(244,231,201,.94)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; rr(x0, y0, panelW, 78, 16); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '700 19px Fredoka, sans-serif'; ctx.fillText('Caps  ' + P.caps + ' of ' + CAPS_PER_LEVEL, x0 + 14, y0 + 26);
  ctx.font = '600 14px Fredoka, sans-serif'; ctx.fillStyle = '#3d6a9e'; ctx.textAlign = 'right'; ctx.fillText(L.short, x0 + panelW - 14, y0 + 25); ctx.textAlign = 'left';
  for (let i = 0; i < CAPS_PER_LEVEL; i++) {
    const cx = x0 + 26 + i * slot, cy = y0 + 58;
    if (i < P.caps) drawCap2D(cx, cy, CAP_COLORS[i % 4], 1.05);
    else { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(58,46,40,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 10, 8, 0, Math.PI, TAU); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); }
  }
  // Score and bell, under the corner buttons.
  ctx.textAlign = 'right'; ctx.font = '700 28px Fredoka, sans-serif';
  outlinedText('Score ' + score.toLocaleString(), W - 18, 84, INK);
  ctx.font = '600 15px Fredoka, sans-serif';
  ctx.globalAlpha = P.bellCD > 0 ? 0.55 : 1;
  outlinedText(P.bellCD > 0 ? 'Bell in ' + Math.ceil(P.bellCD) : 'B  Bell ready', W - 18, 108, '#3d6a9e');
  ctx.globalAlpha = 1;

  // Mini-map (north is up).
  if (minimap) {
    const mx = W - minimap.w - 16, my = H - minimap.h - 16;
    ctx.fillStyle = INK; rr(mx - 6, my - 26, minimap.w + 12, minimap.h + 32, 12); ctx.fill();
    ctx.fillStyle = '#f4e7c9'; ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('MAP', mx + 2, my - 9);
    const left = monkeys.filter(m => m.hasCap).length;
    ctx.textAlign = 'right'; ctx.fillText(left + (left === 1 ? ' monkey left' : ' monkeys left'), mx + minimap.w - 2, my - 9);
    ctx.drawImage(minimap.canvas, mx, my, minimap.w, minimap.h);
    ctx.save(); ctx.beginPath(); ctx.rect(mx, my, minimap.w, minimap.h); ctx.clip();
    const pulse = 4.5 + Math.sin(clock * 6) * 1.2;
    for (const m of monkeys) {
      if (!m.hasCap) continue;
      ctx.beginPath(); ctx.arc(mx + m.x * mmScale, my + m.y * mmScale, pulse, 0, TAU);
      ctx.fillStyle = m.cap; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.save(); ctx.translate(mx + P.x * mmScale, my + P.y * mmScale); ctx.rotate(P.heading);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fillStyle = '#f6d65a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore(); ctx.restore();
  }

  // Compass at the bottom: points to the nearest monkey, relative to where you're riding.
  // Straight up means "ride straight ahead".
  const best = nearestMonkey(), goal = guideTarget(best);
  if (best && goal && phase === 'play') {
    const rel = angleDiff(P.heading, Math.atan2(goal.y - P.y, goal.x - P.x));
    const cx = W / 2, cy = H - 70;
    ctx.fillStyle = 'rgba(244,231,201,.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rel);
    ctx.beginPath();
    ctx.moveTo(0, -27); ctx.lineTo(15, -8); ctx.lineTo(6, -8); ctx.lineTo(6, 22); ctx.lineTo(-6, 22); ctx.lineTo(-6, -8); ctx.lineTo(-15, -8); ctx.closePath();
    ctx.fillStyle = best.cap; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
    ctx.font = '600 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = INK;
    const turn = Math.abs(rel) < 0.35 ? 'Straight ahead!' : rel < 0 ? 'Turn left' : 'Turn right';
    ctx.fillText(goal.viaBridge ? 'Use the bridge! ' + turn : turn, cx, cy + 52);
  }
  if (hintT > 0 && phase === 'play') {
    ctx.globalAlpha = clamp(hintT, 0, 1);
    // Arrow symbols built from their character codes, so the source stays plain ASCII.
    const A = String.fromCharCode;
    const msg = A(8593) + ' pedal   ' + A(8592) + ' ' + A(8594) + ' steer   The big arrow points to the nearest monkey';
    ctx.font = '600 18px Fredoka, sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(msg).width + 32;
    ctx.fillStyle = 'rgba(244,231,201,.95)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(W / 2 - w / 2, H - 190, w, 40, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillText(msg, W / 2, H - 164);
    ctx.globalAlpha = 1;
  }
}
