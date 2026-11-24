'use strict';
/* =====================================================================
   sound.js - SOUND EFFECTS, made from scratch with the Web Audio API.
   A "tone" is an oscillator with a quick fade in and out. "Noise" (the
   monkeys' tsz-tsz, splashes, landings) is random samples run through a
   filter. A "voice" is a buzzy tone pushed through a narrow filter, which
   is how the monkeys get their ooh-ooh-ah-ah: the filter's pitch decides
   whether it sounds like "ooh" (low) or "ah" (higher). No sound files.

   Two volume knobs ("buses"): one for effects, one for music, so each
   can be switched off on its own.
   Browsers only allow sound after the player clicks or presses a key,
   so Sound.init() is called from the first click or key press.
   ===================================================================== */

const SFX_VOL = 0.5, MUSIC_VOL = 0.32;

const Sound = {
  ctx: null, master: null, musicBus: null, muted: false, musicMuted: false, noiseBuf: null,
  onInit: [],          // other files add functions here to run once sound is allowed
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : SFX_VOL;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicMuted ? 0 : MUSIC_VOL;
      this.musicBus.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; return; }
    this.onInit.forEach(f => f());
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : SFX_VOL, this.ctx.currentTime, 0.03); },
  setMusicMuted(m) {
    this.musicMuted = m;
    if (!this.musicBus) return;
    const g = this.musicBus.gain; g.cancelScheduledValues(this.ctx.currentTime);   // cancel any "turn back up later"
    g.setTargetAtTime(m ? 0 : MUSIC_VOL, this.ctx.currentTime, 0.1);
  },
  tone(freq, dur, opt = {}) {
    if (!this.ctx) return;
    const { type = 'sine', vol = 0.3, slide = null, delay = 0, lp = 0 } = opt;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (lp) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); f.connect(g); }   // lp softens a buzzy tone, like a horn
    else o.connect(g);
    g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise(dur, opt = {}) {
    if (!this.ctx) return;
    const { freq = 1000, type = 'lowpass', vol = 0.3, delay = 0, q = 1 } = opt;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
  },
  // A buzzy tone sliding from one pitch to another, through a filter set to a vowel.
  voice(from, to, dur, opt = {}) {
    if (!this.ctx) return;
    const { formant = 800, vol = 0.3, delay = 0, q = 4 } = opt;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, t0); o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = formant; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  // A noise that never stops, for skids, wind and waves. Its volume starts at 0;
  // turn it up and down with Sound.level().
  loop(type, freq, q = 1) {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return g;
  },
  // Glide a loop's volume toward a new level (smooth stops clicks).
  level(loopGain, v, smooth = 0.08) { if (loopGain) loopGain.gain.setTargetAtTime(v, this.ctx.currentTime, smooth); }
};

const rnd = (a, b) => a + Math.random() * (b - a);

const sfx = {
  tsz()   { for (let i = 0; i < 3; i++) Sound.noise(0.07, { freq: 5200, type: 'highpass', vol: 0.22, delay: i * 0.13 }); },
  bell()  { [0, 0.2].forEach(d => { Sound.tone(2093, 0.55, { vol: 0.2, delay: d }); Sound.tone(3136, 0.35, { vol: 0.07, delay: d }); }); },
  cap(n)  { const base = 523 * Math.pow(2, n / 12); [0, 4, 7].forEach((s, i) => Sound.tone(base * Math.pow(2, s / 12), 0.18, { type: 'triangle', vol: 0.22, delay: i * 0.06 })); },
  pop()   { Sound.tone(880, 0.08, { type: 'triangle', vol: 0.15, slide: 1300 }); },
  hop()   { Sound.tone(330, 0.16, { type: 'triangle', vol: 0.15, slide: 520 }); },
  jump()  { Sound.tone(260, 0.35, { vol: 0.25, slide: 820 }); Sound.noise(0.25, { freq: 1500, vol: 0.06 }); },
  land()  { Sound.noise(0.12, { freq: 380, vol: 0.35 }); },
  spin()  { Sound.tone(600, 0.2, { type: 'triangle', vol: 0.12, slide: 1200 }); },
  trick() { Sound.tone(1047, 0.25, { type: 'triangle', vol: 0.2 }); Sound.tone(1568, 0.35, { type: 'triangle', vol: 0.16, delay: 0.09 }); },
  bonk()  { Sound.tone(150, 0.12, { type: 'square', vol: 0.12, slide: 90 }); },
  splash(){ Sound.noise(0.35, { freq: 1300, vol: 0.3 }); Sound.noise(0.5, { freq: 3000, type: 'highpass', vol: 0.08, delay: 0.05 }); },
  yawn()  { Sound.tone(300, 0.6, { vol: 0.12, slide: 180 }); },

  // ---- Monkeys ----
  // "Ooh ooh ah ah": two low vowels, then two higher ones.
  chatter() {
    const p = rnd(0.9, 1.15);
    [[520, 680, 450], [540, 700, 450], [780, 560, 1050], [760, 540, 1050]].forEach(([a, b, f], i) =>
      Sound.voice(a * p, b * p, 0.13, { formant: f, vol: 0.5, delay: i * 0.14 }));
  },
  squeal()  { Sound.voice(900, 1700, 0.22, { formant: 1600, vol: 0.4 }); Sound.voice(1500, 1100, 0.15, { formant: 1400, vol: 0.3, delay: 0.2 }); },
  grumble() { [0, 0.16, 0.32].forEach((d, i) => Sound.voice(240 - i * 20, 180 - i * 20, 0.14, { formant: 500, vol: 0.55, delay: 0.2 + d })); },
  pant()    { [0, 0.28].forEach(d => Sound.noise(0.16, { freq: 1000, type: 'bandpass', q: 2, vol: 0.25, delay: d })); },

  // ---- Cheers and fanfares ----
  stack(n) {   // a sparkly jingle as a cap lands on the stack, a little higher each time
    const base = 1047 * Math.pow(2, n / 12);
    [0, 7, 12].forEach((s, i) => Sound.tone(base * Math.pow(2, s / 12), 0.3, { vol: 0.09, delay: i * 0.05 }));
  },
  cheer() {    // a little crowd: lots of hissy noise around voice pitches, plus a few "woo"s
    for (let i = 0; i < 6; i++) Sound.noise(rnd(0.8, 1.2), { freq: rnd(700, 2200), type: 'bandpass', q: 1.5, vol: 0.16, delay: rnd(0, 0.15) });
    for (let i = 0; i < 3; i++) Sound.voice(rnd(380, 520), rnd(650, 900), 0.45, { formant: 900, q: 3, vol: 0.18, delay: 0.05 + i * 0.12 });
  },
  win() {      // a horn fanfare: da-da-da DAAA, da-DAAAA
    [[392, 0, .12], [523, .13, .12], [659, .26, .12], [784, .39, .36], [659, .8, .12], [784, .93, .8]].forEach(([f, d, l]) =>
      Sound.tone(f, l, { type: 'sawtooth', vol: 0.16, delay: d, lp: 1800 }));
    [262, 330, 392].forEach(f => Sound.tone(f, 0.9, { type: 'triangle', vol: 0.12, delay: 0.93 }));
    setTimeout(() => sfx.cheer(), 900);
  },

  // ---- Place sounds ----
  chirp(vol = 1) { const n = 2 + Math.floor(Math.random() * 3), f = rnd(2600, 3400); for (let i = 0; i < n; i++) Sound.tone(f, 0.07, { slide: f * 1.4, vol: 0.05 * vol, delay: i * 0.11 }); },
  gull(vol = 1)  { [0, 0.34].forEach(d => Sound.voice(1500, 950, 0.3, { formant: 1300, q: 2, vol: 0.2 * vol, delay: d })); },
  creak(vol = 1) { Sound.voice(95, 70, 0.7, { formant: 380, q: 6, vol: 0.25 * vol }); },
  chime(vol = 1) { [784, 659, 698, 523].forEach((f, i) => { Sound.tone(f, 1.5, { vol: 0.13 * vol, delay: i * 0.6 }); Sound.tone(f * 2.76, 0.6, { vol: 0.03 * vol, delay: i * 0.6 }); }); },
  flutter()      { for (let i = 0; i < 6; i++) Sound.noise(0.04, { freq: 1600, type: 'bandpass', vol: 0.12, delay: i * 0.045 }); }
};
