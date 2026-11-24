'use strict';
/* =====================================================================
   rules.js - HOW THE GAME WORKS
   Everything here happens on a flat map, like looking down from above:
   positions are (x, y), and z is how high off the ground something is.
   This file never draws anything. world3d.js and hud.js read the state
   below and show it. That split is why moving from 2D to 3D was possible
   without touching the monkeys' brains.

   When something happens that the drawing code needs to know about
   (a new place starts, a cap lands on the stack), the rules call one of
   the Hooks below. The drawing code fills the hooks in.
   ===================================================================== */

// ---------- Tunables ----------
const MAX_SPEED = 320, ACCEL = 700, BRAKE = 900, REVERSE_MAX = 90;
const TURN_RATE = 2.7;    // radians per second the handlebars can turn
const GRAVITY = 1000, HOP_V = 230, SPIN_TIME = 0.42;
const RAMP_L = 84, RAMP_W = 64, RAMP_H = 26;
const PLAYER_R = 16;
const CATCH_R = 60;       // the whole bike's length counts as a grab
const BELL_RANGE = 260, BELL_FREEZE = 1.2, BELL_COOLDOWN = 3;
const CAPS_PER_LEVEL = 10;
const SAND_SLOW = 0.72;   // top speed on sand, as a share of normal
// The caps in the book are gray, brown, blue and red, on top of the peddler's own checked cap.
const CAP_COLORS = ['#8e8c86', '#8b5a33', '#3d6a9e', '#b8432f'];
const INK = '#3a2e28';

// ---------- Helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function angleDiff(a, b) { return ((b - a + Math.PI * 3) % TAU) - Math.PI; }
function inRect(x, y, r) { return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h; }
// A seeded random number generator: the same seed gives the same "random" flowers every time.
function makeRng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Hooks the drawing code fills in ----------
const Hooks = {
  levelStart() {},           // a new place is starting: build its scenery
  capLanded(f) {},           // a flying cap reached the top of the stack
  monkeyGone(m) {},          // a cap-less monkey has wandered off for good
  levelComplete() {},        // all ten caps are back
  onScreen(x, y, h) { return true; }   // can the player see this spot? (only plays tsz-tsz for visible monkeys)
};

// ---------- State ----------
let L = null;            // the current place, prepared by prepareLevel
let levelIndex = 0;
let phase = 'title';     // title | story | wake | play | won | paused
let clock = 0;           // seconds since the page opened, for animations
const P = {};            // the peddler
const keys = {};         // which keys are held down right now
let monkeys = [], popups = [], particles = [], bubbles = [], flyingCaps = [];
let score = 0, tricks = 0, bestTrick = null, levelTime = 0;
let wakeT = 0, controlDelay = 0, winT = -1, hintT = 0, tszCooldown = 0, bellRingT = -1;

// Turn a place's list of things into the lists the rules use.
// "top" is how tall a solid thing is: if the bike is higher than that, it sails over.
// Water has top 0, so you can only cross it in the air (or on a bridge).
function prepareLevel(def) {
  const L = Object.assign({}, def);
  L.solids = []; L.ramps = []; L.slow = [];
  const circle = (x, y, r, top, extra) => Object.assign({ shape: 'circle', x, y, r, top }, extra);
  const rect = (x, y, w, h, top, extra) => Object.assign({ shape: 'rect', x, y, w, h, top }, extra);
  for (const t of def.things) {
    switch (t.k) {
      case 'sand': L.slow.push(t); break;
      case 'water': L.solids.push(rect(t.x, t.y, t.w, t.h, 0, { water: true })); break;
      case 'pond': L.solids.push(circle(t.x, t.y, t.r - 6, 0, { water: true })); break;
      case 'ramp': L.ramps.push(t); break;
      case 'tree': L.solids.push(circle(t.x, t.y, 12 * t.s, 999)); break;
      case 'house': case 'clock': L.solids.push(rect(t.x, t.y, t.w, t.h, 999)); break;
      case 'stall': L.solids.push(rect(t.x, t.y, t.w, t.h, 60)); break;
      case 'crate': L.solids.push(rect(t.x, t.y, 38, 38, 30)); break;
      case 'log': L.solids.push(rect(t.x, t.y, t.w, t.h, 14)); break;
      case 'hay': L.solids.push(circle(t.x, t.y, 24, 30)); break;
      case 'barrel': L.solids.push(circle(t.x, t.y, 18, 30)); break;
      case 'rock': L.solids.push(circle(t.x, t.y, t.r, 22)); break;
      case 'well': L.solids.push(circle(t.x, t.y, 32, 45)); break;
      case 'fountain': L.solids.push(circle(t.x, t.y, t.r, 40)); break;
      case 'windmill': L.solids.push(circle(t.x, t.y, 56, 999)); break;
      case 'lighthouse': L.solids.push(circle(t.x, t.y, 50, 999)); break;
    }
  }
  L.napTreeObj = def.things.find(t => t.big);
  return L;
}

function resetPeddler() {
  const t = L.napTreeObj;
  Object.assign(P, {
    x: t.x + 30, y: t.y + 70, vx: 0, vy: 0, speed: 0, z: 0, vz: 0, heading: Math.PI / 2,
    air: false, fromRamp: false, airTime: 0, spinning: false, spinT: 0, spinAngle: 0, airSpins: 0, spinQueued: false, noHandsT: 0,
    caps: 0, stackShown: 0, sway: 0, lean: 0, bellCD: 0, bumpCD: 0, splashCD: 0, asleep: true
  });
}

// Start (or restart) a place: the peddler asleep, ten monkeys on top of the tree.
function startLevel(i) {
  levelIndex = i;
  L = prepareLevel(LEVELS[i]);
  resetPeddler();
  score = 0; tricks = 0; bestTrick = null; levelTime = 0; winT = -1; hintT = 0; bellRingT = -1;
  popups = []; particles = []; bubbles = []; flyingCaps = [];
  // The nap tree's crown is a ball of leaves 71 across at height 147, so a monkey
  // at distance r from the trunk sits on the ball's surface at the height worked out below.
  const t = L.napTreeObj;
  monkeys = [];
  for (let n = 0; n < CAPS_PER_LEVEL; n++) {
    const a = n * 2.399 + 0.4;            // the "golden angle" spreads them evenly round the crown
    const r = 22 + (n / CAPS_PER_LEVEL) * 38;
    monkeys.push({
      x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, z: 147 + Math.sqrt(71 * 71 - r * r) - 6,
      vx: 0, vy: 0, vz: 0, dir: a, cap: CAP_COLORS[n % 4], hasCap: true, state: 'tree',
      t: Math.random() * 10, seed: n * 1.7, energy: L.energy, tired: 0, dazed: 0, dodgeCD: 0, dodgeT: 0, dodgeSide: 1,
      wanderA: a, wanderT: 0, tauntCD: 2 + Math.random() * 4, alpha: 1, face: a
    });
  }
  phase = 'story';
  Hooks.levelStart();
}

function wakeUp() { Sound.init(); phase = 'wake'; wakeT = 0; sfx.yawn(); }

// The monkeys jump down and scatter in every direction.
function scatterMonkeys() {
  for (const m of monkeys) {
    m.state = 'scatter'; m.vz = 200 + Math.random() * 80;
    m.scatterT = 2.6 + Math.random() * 1.6;
    m.vx = Math.cos(m.dir) * 300; m.vy = Math.sin(m.dir) * 300;
  }
  P.asleep = false;
  phase = 'play'; controlDelay = 0.6; hintT = 8;
  addPopup(P.x, P.y, 110, 'Get those caps back!', '#b8432f', 2);
}

// Space: hop on the ground; spin when flying off a ramp.
function action() {
  if (controlDelay > 0) return;
  if (!P.air) {
    P.air = true; P.vz = HOP_V; P.fromRamp = false; P.airTime = 0; P.airSpins = 0; P.noHandsT = 0; sfx.hop();
  } else if (P.fromRamp) {
    if (!P.spinning) { P.spinning = true; P.spinT = 0; sfx.spin(); } else P.spinQueued = true;
  }
}

function ringBell() {
  if (P.bellCD > 0) return;
  P.bellCD = BELL_COOLDOWN; sfx.bell(); bellRingT = 0;
  let froze = 0;
  for (const m of monkeys) {
    if (m.hasCap && m.state === 'free' && Math.hypot(m.x - P.x, m.y - P.y) < BELL_RANGE) { m.dazed = BELL_FREEZE; froze++; }
  }
  if (froze) addPopup(P.x, P.y, 100, froze === 1 ? 'Monkey froze!' : froze + ' monkeys froze!', '#3d6a9e', 1.2);
}

// ---------- Physics ----------
// Push a moving thing (bike or monkey) out of anything solid it overlaps.
// Things shorter than the rider's height are skipped: that's how jumping over works.
function collide(e, r, z, onHit) {
  for (const s of L.solids) {
    if (z > s.top) continue;
    let nx, ny, pen;
    if (s.shape === 'circle') {
      const dx = e.x - s.x, dy = e.y - s.y;
      if (Math.abs(dx) > s.r + r || Math.abs(dy) > s.r + r) continue;
      const d = Math.hypot(dx, dy), min = s.r + r;
      if (d >= min) continue;
      if (d < 0.001) { nx = 1; ny = 0; } else { nx = dx / d; ny = dy / d; }
      pen = min - d;
    } else {
      const cx = clamp(e.x, s.x, s.x + s.w), cy = clamp(e.y, s.y, s.y + s.h);
      const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d > 0.001) { nx = dx / d; ny = dy / d; pen = r - d; }
      else {
        // The centre is inside the box, so leave by the nearest side.
        const left = e.x - s.x, right = s.x + s.w - e.x, up = e.y - s.y, down = s.y + s.h - e.y;
        const m = Math.min(left, right, up, down);
        if (m === left) { nx = -1; ny = 0; } else if (m === right) { nx = 1; ny = 0; } else if (m === up) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
        pen = m + r;
      }
    }
    e.x += nx * pen; e.y += ny * pen;
    const vn = e.vx * nx + e.vy * ny;      // speed going INTO the wall
    if (vn < 0) { e.vx -= vn * nx * 1.3; e.vy -= vn * ny * 1.3; if (onHit) onHit(s, -vn); }
  }
}

// ---------- The peddler: a bike you steer ----------
// Speed is one number along the way the handlebars point, not free movement in any direction.
function updatePeddler(dt) {
  let steer = 0, pedal = 0;
  if (controlDelay <= 0) {
    if (keys.ArrowLeft || keys.KeyA) steer -= 1;
    if (keys.ArrowRight || keys.KeyD) steer += 1;
    if (keys.ArrowUp || keys.KeyW) pedal += 1;
    if (keys.ArrowDown || keys.KeyS) pedal -= 1;
  }
  // Like a real bike, a slower bike turns tighter, and a hard turn scrubs off speed.
  // Without this, holding "up + left" just circles round a monkey without ever reaching it.
  const slowness = 1 - clamp(Math.abs(P.speed) / MAX_SPEED, 0, 1);
  P.heading += steer * TURN_RATE * (1 + slowness * 0.9) * (P.air ? 0.4 : 1) * dt;
  if (steer && !P.air && P.speed > MAX_SPEED * 0.62) P.speed = lerp(P.speed, MAX_SPEED * 0.62, Math.min(1, dt * 3));
  P.lean = lerp(P.lean, steer * clamp(Math.abs(P.speed) / MAX_SPEED, 0, 1) * 0.35, Math.min(1, dt * 6));

  const onSand = L.slow.some(s => inRect(P.x, P.y, s));
  const top = MAX_SPEED * (onSand ? SAND_SLOW : 1);
  if (!P.air) {
    if (pedal > 0) P.speed = Math.min(top, P.speed + ACCEL * dt);
    else if (pedal < 0) P.speed = Math.max(-REVERSE_MAX, P.speed - BRAKE * dt);
    else P.speed *= Math.max(0, 1 - 1.4 * dt);
    if (P.speed > top) P.speed = lerp(P.speed, top, Math.min(1, dt * 4));
  } else {
    P.airTime += dt;
    P.vz -= GRAVITY * dt; P.z += P.vz * dt;
    if (P.fromRamp && keys.KeyX) P.noHandsT += dt;
    if (P.spinning) {
      P.spinT += dt;
      if (P.spinT >= SPIN_TIME) {
        P.airSpins++; P.spinT = 0; sfx.pop();
        if (P.spinQueued) { P.spinQueued = false; sfx.spin(); } else P.spinning = false;
      }
    }
    P.spinAngle = P.spinning ? (P.spinT / SPIN_TIME) * TAU : 0;
    if (P.z <= 0) land();
  }
  const fx = Math.cos(P.heading), fy = Math.sin(P.heading);
  P.vx = fx * P.speed; P.vy = fy * P.speed;
  P.x += P.vx * dt; P.y += P.vy * dt;

  // The cap stack sways away from turns.
  P.sway = lerp(P.sway, -steer * clamp(P.speed / MAX_SPEED, 0, 1) * 1.4, Math.min(1, dt * 5));

  // Ramps launch you if you ride up them the right way.
  if (!P.air && P.speed > 110) {
    for (const r of L.ramps) {
      const dx = P.x - r.x, dy = P.y - r.y;
      const lx = dx * Math.cos(r.a) + dy * Math.sin(r.a), ly = -dx * Math.sin(r.a) + dy * Math.cos(r.a);
      if (Math.abs(lx) < RAMP_L / 2 && Math.abs(ly) < RAMP_W / 2 && fx * Math.cos(r.a) + fy * Math.sin(r.a) > 0.35) {
        P.air = true; P.fromRamp = true; P.airTime = 0; P.airSpins = 0; P.noHandsT = 0;
        P.vz = 250 + P.speed * 0.75; P.speed += 70;
        sfx.jump();
        for (let i = 0; i < 8; i++) addParticle(P.x, P.y, '#d8c49a');
        break;
      }
    }
  }

  collide(P, PLAYER_R, P.z, (s, hit) => {
    if (s.water) { if (P.splashCD <= 0) { sfx.splash(); P.splashCD = 0.6; for (let i = 0; i < 12; i++) addParticle(P.x, P.y, '#cfe6ee', 1.5); } }
    else if (hit > 140 && P.bumpCD <= 0) { sfx.bonk(); P.bumpCD = 0.4; }
  });
  // After bumping into something, keep only the part of the motion along the handlebars.
  P.speed = P.vx * fx + P.vy * fy;
  P.x = clamp(P.x, 30, L.w - 30); P.y = clamp(P.y, 30, L.h - 30);
  P.bellCD = Math.max(0, P.bellCD - dt); P.bumpCD -= dt; P.splashCD -= dt;
}

// Scoring happens on landing, so a trick only counts if you finish it.
function land() {
  const lastSpinOK = P.spinning && P.spinT / SPIN_TIME > 0.7;   // nearly finished counts: be kind
  const wobble = P.spinning && !lastSpinOK;
  const spins = P.airSpins + (lastSpinOK ? 1 : 0);
  P.z = 0; P.vz = 0; P.air = false; P.spinning = false; P.spinQueued = false; P.spinT = 0; P.spinAngle = 0;
  sfx.land();
  for (let i = 0; i < 6; i++) addParticle(P.x, P.y, 'rgba(225,205,160,.9)', 0.8);
  if (!P.fromRamp) return;
  let pts = 0; const parts = [];
  if (spins === 1) { pts += 100; parts.push('Spin'); } else if (spins === 2) { pts += 250; parts.push('Double Spin'); } else if (spins >= 3) { pts += 450; parts.push('Triple Spin'); }
  if (P.noHandsT > 0.25) { pts += 75; parts.push('No Hands'); }
  if (spins > 0 && P.noHandsT > 0.25) pts += 100;
  if (P.airTime > 0.85) { pts += 50; parts.push('Big Air'); }
  if (wobble) { P.speed *= 0.45; sfx.bonk(); addPopup(P.x, P.y, 90, 'Wobble!', '#8b5a33', 1); }
  if (pts > 0) {
    score += pts; tricks++;
    if (!bestTrick || pts > bestTrick.pts) bestTrick = { pts, label: parts.join(' + ') };
    addPopup(P.x, P.y, wobble ? 130 : 110, parts.join(' + ') + '  +' + pts, '#3d6a9e', 1.6);
    sfx.trick();
  }
  P.fromRamp = false;
}

// ---------- Monkey brains ----------
// Wander and tease when you're far away, run when you get close, and get tired
// after running a while (that's your chance). Walls and buildings push them
// sideways, so chasing one into a corner works.
function avoidance(m) {
  let ax = 0, ay = 0;
  for (const s of L.solids) {
    let dx, dy, gap;
    if (s.shape === 'circle') {
      dx = m.x - s.x; dy = m.y - s.y;
      if (Math.abs(dx) > s.r + 80 || Math.abs(dy) > s.r + 80) continue;
      const d = Math.hypot(dx, dy) || 1; gap = d - s.r; dx /= d; dy /= d;
    } else {
      const cx = clamp(m.x, s.x, s.x + s.w), cy = clamp(m.y, s.y, s.y + s.h);
      dx = m.x - cx; dy = m.y - cy;
      if (Math.abs(dx) > 80 || Math.abs(dy) > 80) continue;
      const d = Math.hypot(dx, dy) || 1; gap = d; dx /= d; dy /= d;
    }
    if (gap < 70) { const w = (70 - gap) / 70; ax += dx * w * 1.6; ay += dy * w * 1.6; }
  }
  const E = 170;
  if (m.x < E) ax += (E - m.x) / E * 2;
  if (m.x > L.w - E) ax -= (m.x - (L.w - E)) / E * 2;
  if (m.y < E) ay += (E - m.y) / E * 2;
  if (m.y > L.h - E) ay -= (m.y - (L.h - E)) / E * 2;
  return [ax, ay];
}

function updateMonkey(m, dt) {
  m.t += dt;
  if (m.state === 'tree') return;
  if (m.z > 0 || m.vz > 0) { m.vz -= 900 * dt; m.z = Math.max(0, m.z + m.vz * dt); if (m.z === 0) m.vz = 0; }
  let dx = 0, dy = 0, speed = 0;
  const px = m.x - P.x, py = m.y - P.y, d = Math.hypot(px, py) || 1;
  if (m.state === 'scatter') {
    dx = Math.cos(m.dir); dy = Math.sin(m.dir); speed = 300;
    const [ax, ay] = avoidance(m); dx += ax; dy += ay;
    m.scatterT -= dt; if (m.scatterT <= 0) m.state = 'free';
  } else if (m.state === 'sulk') {
    dx = px / d; dy = py / d; speed = 130;
    m.alpha -= dt * 0.45; if (m.alpha <= 0) m.gone = true;
  } else {
    m.dodgeCD -= dt; m.tauntCD -= dt;
    if (m.dazed > 0) { m.dazed -= dt; speed = 0; }
    else if (d < L.fleeR) {
      // Run away, zig-zagging a little so it's not a straight line.
      const ax = px / d, ay = py / d, j = Math.sin(m.t * 2.6 + m.seed) * 0.6;
      dx = ax - ay * j; dy = ay + ax * j;
      if (d < 95 && m.dodgeCD <= 0 && Math.random() < L.dodge) { m.dodgeT = 0.35; m.dodgeSide = Math.random() < 0.5 ? -1 : 1; }
      if (d < 95 && m.dodgeCD <= 0) m.dodgeCD = 1.8;   // one dodge roll per close call
      if (m.dodgeT > 0) { m.dodgeT -= dt; dx += -ay * m.dodgeSide * 2.2; dy += ax * m.dodgeSide * 2.2; }
      if (m.tired > 0) { m.tired -= dt; speed = L.monkeySpeed * 0.35; if (m.tired <= 0) m.energy = L.energy; }
      else {
        speed = L.monkeySpeed * (m.dodgeT > 0 ? 1.4 : 1);
        m.energy -= dt;
        if (m.energy <= 0) { m.tired = 2.4; addBubble(m, 'Huff, puff!', 1); }
      }
    } else {
      // Wander and tease.
      m.wanderT -= dt;
      if (m.wanderT <= 0) { m.wanderA += (Math.random() - 0.5) * 2.5; m.wanderT = 1 + Math.random() * 2; }
      dx = Math.cos(m.wanderA); dy = Math.sin(m.wanderA); speed = 55;
      m.energy = Math.min(L.energy, m.energy + dt);
      if (m.tired > 0) m.tired -= dt;
      if (m.tauntCD <= 0 && d < 700) {
        m.tauntCD = 4 + Math.random() * 5; m.vz = 160;
        addBubble(m, ['Tsz tsz tsz!', 'Tsz tsz!', 'Catch me!', 'Nice cap, huh?', 'Too slow!'][Math.floor(Math.random() * 5)], 1.4);
        if (tszCooldown <= 0 && Hooks.onScreen(m.x, m.y, 30)) { sfx.tsz(); tszCooldown = 1.5; }
      }
    }
    const [ax, ay] = avoidance(m); dx += ax; dy += ay;
  }
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  const k = Math.min(1, dt * 6);
  m.vx = lerp(m.vx, dx * speed, k); m.vy = lerp(m.vy, dy * speed, k);
  m.x += m.vx * dt; m.y += m.vy * dt;
  if (m.z < 5) collide(m, 12, 0);
  m.x = clamp(m.x, 40, L.w - 40); m.y = clamp(m.y, 40, L.h - 40);
  if (Math.hypot(m.vx, m.vy) > 8) m.face = Math.atan2(m.vy, m.vx);
  // Got one!
  if (m.hasCap && m.state === 'free' && d < CATCH_R && P.z < 80) catchMonkey(m);
}

function catchMonkey(m) {
  m.hasCap = false; m.state = 'sulk';
  P.caps++; score += 100;
  flyingCaps.push({ sx: m.x, sy: m.y, sh: m.z + 40, color: m.cap, t: 0 });
  addBubble(m, ['Hey!', 'Aww!', 'My cap!', 'No fair!'][Math.floor(Math.random() * 4)], 1.2);
  addPopup(m.x, m.y, 70, 'Cap ' + P.caps + ' of ' + CAPS_PER_LEVEL + '!  +100', '#b8432f', 1.3);
  for (let i = 0; i < 14; i++) addParticle(m.x, m.y, ['#f4d35e', '#fff2c2', m.cap][i % 3], 1.3);
  sfx.cap(P.caps);
  if (P.caps === CAPS_PER_LEVEL) winT = 1.8;
}

function nearestMonkey() {
  let best = null, bd = Infinity;
  for (const m of monkeys) {
    if (!m.hasCap || m.state === 'tree') continue;
    const d = Math.hypot(m.x - P.x, m.y - P.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

// ---------- Where should the compass point? ----------
// Straight at the nearest monkey, unless a canal or creek is in the way. Then it
// points to the best bridge: first to the near end, then across to the far end.
// (Testing showed a straight-line compass sends kids into the water for minutes.)
function crossesWater(ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 20);
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    for (const s of L.solids) if (s.water && s.shape === 'rect' && inRect(x, y, s)) return true;
  }
  return false;
}
function guideTarget(m) {
  if (!m) return null;
  if (!crossesWater(P.x, P.y, m.x, m.y)) return { x: m.x, y: m.y, viaBridge: false };
  let best = null, bestDist = Infinity;
  for (const b of L.things) {
    if (b.k !== 'bridge') continue;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    // A bridge's two ends, 50 past its edges. "vertical" bridges are crossed left-right.
    const ends = b.vertical ? [[b.x - 50, cy], [b.x + b.w + 50, cy]] : [[cx, b.y - 50], [cx, b.y + b.h + 50]];
    const myEnd = b.vertical ? (P.x < cx ? 0 : 1) : (P.y < cy ? 0 : 1);
    const near = ends[myEnd], far = ends[1 - myEnd];
    const dist = Math.hypot(near[0] - P.x, near[1] - P.y) + Math.hypot(far[0] - near[0], far[1] - near[1]) + Math.hypot(m.x - far[0], m.y - far[1]);
    if (dist < bestDist) {
      bestDist = dist;
      // Already lined up at the near end? Then head across.
      const lined = b.vertical ? Math.abs(P.y - cy) < b.h / 2 - 12 && Math.abs(P.x - near[0]) < 70
                               : Math.abs(P.x - cx) < b.w / 2 - 12 && Math.abs(P.y - near[1]) < 70;
      const onDeck = inRect(P.x, P.y, b);
      const go = lined || onDeck ? far : near;
      best = { x: go[0], y: go[1], viaBridge: true };
    }
  }
  return best || { x: m.x, y: m.y, viaBridge: false };
}

// ---------- Effects: stored on the map, drawn by hud.js ----------
function addPopup(x, y, h, text, color, life) { popups.push({ x, y, h, text, color, t: 0, life: life || 1.2 }); }
function addBubble(m, text, life) { bubbles = bubbles.filter(b => b.m !== m); bubbles.push({ m, text, t: 0, life }); }
function addParticle(x, y, color, power = 1) {
  const a = Math.random() * TAU, s = (40 + Math.random() * 90) * power;
  particles.push({ x, y, z: 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 80 + Math.random() * 140 * power, color, t: 0, life: 0.5 + Math.random() * 0.4, r: 2.5 + Math.random() * 3 });
}

// ---------- One step of the game ----------
function update(dt) {
  clock += dt;
  if (phase === 'paused' || phase === 'title') return;
  tszCooldown -= dt;
  if (phase === 'story') {
    for (const m of monkeys) m.t += dt;
  } else if (phase === 'wake') {
    wakeT += dt;
    for (const m of monkeys) m.t += dt;
    if (wakeT > 0.7 && wakeT - dt <= 0.7) addBubble({ x: P.x, y: P.y, z: 30, isPeddler: true }, 'My caps!', 1.6);
    if (wakeT > 1.6 && wakeT - dt <= 1.6) { sfx.tsz(); monkeys.forEach((m, i) => { if (i % 2 === 0) addBubble(m, 'Tsz tsz tsz!', 1.4); }); }
    if (wakeT > 3.0) scatterMonkeys();
  } else if (phase === 'play' || phase === 'won') {
    if (phase === 'play') { levelTime += dt; controlDelay -= dt; hintT -= dt; }
    updatePeddler(dt);
    for (const m of monkeys) updateMonkey(m, dt);
    for (const m of monkeys) if (m.gone) Hooks.monkeyGone(m);
    monkeys = monkeys.filter(m => !m.gone);
    if (winT > 0) { winT -= dt; if (winT <= 0) { phase = 'won'; sfx.win(); Hooks.levelComplete(); } }
  }
  for (const f of flyingCaps) {
    f.t += dt * 2;
    if (f.t >= 1 && !f.done) { f.done = true; P.stackShown++; sfx.pop(); Hooks.capLanded(f); }
  }
  flyingCaps = flyingCaps.filter(f => !f.done);
  for (const p of popups) p.t += dt;
  popups = popups.filter(p => p.t < p.life);
  for (const b of bubbles) b.t += dt;
  bubbles = bubbles.filter(b => b.t < b.life);
  for (const p of particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= 500 * dt; p.z = Math.max(0, p.z + p.vz * dt);
    p.vx *= 0.96; p.vy *= 0.96;
  }
  particles = particles.filter(p => p.t < p.life);
  if (bellRingT >= 0) { bellRingT += dt; if (bellRingT > 0.8) bellRingT = -1; }
}
