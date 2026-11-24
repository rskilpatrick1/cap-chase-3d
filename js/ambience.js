'use strict';
/* =====================================================================
   ambience.js - SOUNDS THAT KEEP GOING
   Called once per frame. Some sounds here run all the time with their
   volume turned up and down (tire skid, wind in the air, waves, the
   fountain). Others are one-off sounds on a random timer (birds, gulls,
   the windmill creaking, the clock tower chiming).
   Things far away are quieter: near() gives 1 right next to something
   and 0 once you're "range" away.
   ===================================================================== */

const Ambience = {
  loops: null, tickDist: 0, tickHigh: false, timers: {}, skidding: false,
  setup() {
    this.loops = {
      skid: Sound.loop('bandpass', 2600, 1.5),
      whoosh: Sound.loop('bandpass', 700, 0.8),
      waves: Sound.loop('lowpass', 420, 0.7),
      fountain: Sound.loop('highpass', 2500, 0.5)
    };
  },
  // A new place: reset the random timers so every place starts calm.
  reset() { this.timers = { bird: 2, gull: 3, creak: 3, chime: 10 }; },

  update(dt) {
    if (!Sound.ctx || !L) return;
    if (!this.loops) { this.setup(); this.reset(); }
    const lp = this.loops;
    if (phase === 'paused' || phase === 'title') { for (const k in lp) Sound.level(lp[k], 0); this.skidding = false; return; }
    const riding = phase === 'play' || phase === 'won';

    // --- The bike ---
    // A soft tick-tick from the chain: faster when you go faster.
    // (It started as bursts of hiss, which sounded like loud rustling grass, so now it's a tiny, quiet click.)
    const pedaling = keys.ArrowUp || keys.KeyW;
    if (riding && !P.air && Math.abs(P.speed) > 15) {
      this.tickDist += Math.abs(P.speed) * dt;
      if (this.tickDist > (pedaling ? 110 : 75)) {
        this.tickDist = 0; this.tickHigh = !this.tickHigh;
        Sound.tone(this.tickHigh ? 2200 : 1900, 0.018, { type: 'triangle', vol: pedaling ? 0.018 : 0.01 });
      }
    }
    // Skid: a hard turn at high speed scrubs off speed (rules.js), and that's when the tires hiss.
    const steering = !!(keys.ArrowLeft || keys.KeyA) !== !!(keys.ArrowRight || keys.KeyD);
    this.skidding = riding && !P.air && steering && P.speed > MAX_SPEED * 0.66;
    Sound.level(lp.skid, this.skidding ? 0.07 : 0, 0.04);
    // Wind rushing past while flying off a ramp.
    Sound.level(lp.whoosh, riding && P.air && P.fromRamp ? 0.06 + P.speed / MAX_SPEED * 0.1 : 0, 0.1);

    // --- The place ---
    const near = (x, y, range) => clamp(1 - Math.hypot(P.x - x, P.y - y) / range, 0, 1);
    const T = this.timers;
    const find = k => L.things.find(t => t.k === k);
    const windmill = find('windmill'), clockT = find('clock'), fountain = find('fountain');

    if (!L.seaY) {   // songbirds anywhere but the harbor
      T.bird -= dt; if (T.bird <= 0) { sfx.chirp(rnd(0.6, 1.2)); T.bird = rnd(2.5, 6); }
    } else {         // gulls and waves at the harbor
      T.gull -= dt; if (T.gull <= 0) { sfx.gull(rnd(0.5, 1)); T.gull = rnd(4, 8); }
      const shore = clamp(1 - (L.seaY - P.y) / 1100, 0, 1);
      Sound.level(lp.waves, (0.05 + 0.03 * Math.sin(clock * 0.6)) * (0.35 + 0.65 * shore), 0.3);
    }
    if (windmill) {
      const v = near(windmill.x, windmill.y, 600);
      T.creak -= dt; if (T.creak <= 0) { if (v > 0) sfx.creak(v); T.creak = rnd(3.5, 5.5); }
    }
    if (clockT) {    // the tower chimes now and then; you can hear it all over town
      T.chime -= dt;
      if (T.chime <= 0) { sfx.chime(0.35 + 0.65 * near(clockT.x + clockT.w / 2, clockT.y + clockT.h / 2, 1400)); T.chime = rnd(28, 40); }
    }
    Sound.level(lp.fountain, fountain ? 0.06 * near(fountain.x, fountain.y, 500) : 0, 0.2);
  }
};
