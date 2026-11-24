'use strict';
/* =====================================================================
   sound.js - SOUND EFFECTS, made from scratch with the Web Audio API.
   A "tone" is an oscillator with a quick fade in and out. "Noise" (the
   monkeys' tsz-tsz, splashes, landings) is random samples run through a
   filter. No sound files to download or manage.
   Browsers only allow sound after the player clicks or presses a key,
   so Sound.init() is called from the first click or key press.
   ===================================================================== */

const Sound = {
  ctx: null, master: null, muted: false, noiseBuf: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; },
  tone(freq, dur, opt = {}) {
    if (!this.ctx) return;
    const { type = 'sine', vol = 0.3, slide = null, delay = 0 } = opt;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise(dur, opt = {}) {
    if (!this.ctx) return;
    const { freq = 1000, type = 'lowpass', vol = 0.3, delay = 0 } = opt;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }
};

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
  splash(){ Sound.noise(0.35, { freq: 1300, vol: 0.3 }); },
  win()   { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => Sound.tone(f, i === 5 ? 0.6 : 0.2, { type: 'triangle', vol: 0.22, delay: i * 0.13 })); },
  yawn()  { Sound.tone(300, 0.6, { vol: 0.12, slide: 180 }); }
};
