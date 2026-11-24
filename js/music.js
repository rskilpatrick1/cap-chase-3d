'use strict';
/* =====================================================================
   music.js - THE MUSIC: three original folk tunes, played live in code.
   A song is a list of bars. Each bar has a chord name and a melody
   written as  note:length  pairs, where the length is in eighth notes.
   "B4:2" means the note B in octave 4, held for two eighths (a quarter).
   "r:2" is a rest. Every bar's lengths must add up to the song's "bar".

   The accompaniment comes from a "pattern": where in each bar to play
   the bass note (b), the bass's fifth (f), the chord (c) or a soft drum (d).
   That's what makes a waltz sound like a waltz (oom-pah-pah) and a polka
   sound like a polka (oom-pah-oom-pah).

   Playing it: a scheduler wakes up every 50 ms and books the notes due in
   the next 0.3 seconds on the audio clock. Booking ahead keeps the rhythm
   steady even when the game is busy drawing.
   ===================================================================== */

const SONGS = [
  { // Village Green: a gentle waltz in G, with a tin-whistle melody.
    name: 'Village Waltz', eighth: 0.2, bar: 6, lead: 'whistle',
    pattern: [[0, 'b'], [2, 'c'], [4, 'c']],
    bars: [
      ['G', 'B4:2 D5:2 B4:2'], ['G', 'A4:2 G4:4'], ['C', 'E5:2 D5:2 C5:2'], ['G', 'B4:4 G4:2'],
      ['Am', 'A4:2 B4:2 C5:2'], ['D', 'D5:3 C5:1 B4:2'], ['D', 'A4:2 F#4:2 A4:2'], ['G', 'G4:6'],
      ['C', 'E5:2 E5:2 G5:2'], ['G', 'D5:4 B4:2'], ['C', 'C5:2 E5:2 D5:2'], ['G', 'B4:4 D5:2'],
      ['Em', 'E5:2 D5:2 B4:2'], ['Am', 'C5:2 B4:2 A4:2'], ['D', 'F#4:2 A4:2 D5:2'], ['G', 'G4:6']
    ]
  },
  { // Market Town: a bouncy polka in D on the accordion.
    name: 'Market Polka', eighth: 0.17, bar: 4, lead: 'accordion',
    pattern: [[0, 'b'], [0, 'd'], [1, 'c'], [2, 'f'], [3, 'c']],
    bars: [
      ['D', 'F#5:1 E5:1 D5:1 A4:1'], ['D', 'F#4:1 A4:1 D5:2'], ['A', 'E5:1 D5:1 C#5:1 B4:1'], ['A', 'A4:1 C#5:1 E5:2'],
      ['D', 'F#5:1 G5:1 A5:1 F#5:1'], ['G', 'G5:1 E5:1 B4:2'], ['A', 'A4:1 B4:1 C#5:1 E5:1'], ['D', 'D5:2 r:2'],
      ['G', 'B4:1 D5:1 G5:1 D5:1'], ['D', 'F#5:1 D5:1 A4:2'], ['E', 'G#4:1 B4:1 E5:1 D5:1'], ['A', 'C#5:2 A4:2'],
      ['G', 'B4:1 C#5:1 D5:1 E5:1'], ['D', 'F#5:2 D5:2'], ['A', 'E5:1 C#5:1 A4:1 C#5:1'], ['D', 'D5:2 D4:2']
    ]
  },
  { // Harbor Point: a rolling sea shanty in A minor, accordion again.
    name: 'Harbor Shanty', eighth: 0.19, bar: 6, lead: 'accordion',
    pattern: [[0, 'b'], [0, 'd'], [2, 'c'], [3, 'f'], [3, 'd'], [5, 'c']],
    bars: [
      ['Am', 'E4:1 A4:2 A4:1 B4:2'], ['Am', 'C5:2 B4:1 A4:3'], ['G', 'G4:1 B4:2 D5:1 B4:2'], ['G', 'D5:2 B4:1 G4:3'],
      ['Am', 'A4:1 C5:2 E5:1 D5:2'], ['Em', 'E5:2 D5:1 B4:3'], ['G', 'D5:2 C5:1 B4:2 G4:1'], ['Am', 'A4:6'],
      ['C', 'E5:2 E5:1 G5:2 E5:1'], ['G', 'D5:2 B4:1 G4:3'], ['Am', 'C5:2 C5:1 E5:2 C5:1'], ['Em', 'B4:3 E4:3'],
      ['F', 'A4:1 C5:2 F5:1 E5:2'], ['G', 'D5:2 B4:1 G4:3'], ['Em', 'E4:1 G4:2 B4:1 D5:2'], ['Am', 'A4:6']
    ]
  }
];

// ---------- Turning note names into pitches ----------
// MIDI numbers count piano keys: middle C is 60, and each step up is one key.
const NOTE_STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  return 12 * (+m[3] + 1) + NOTE_STEPS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hzOf = n => 440 * Math.pow(2, (n - 69) / 12);   // A above middle C (69) is 440 Hz

// Turn a song into one flat, time-ordered list of notes: { at, len (in eighths), kind, midi }.
function compileSong(song) {
  const events = [];
  song.bars.forEach(([chord, tune], b) => {
    const start = b * song.bar;
    const cm = /^([A-G][#b]?)(m?)$/.exec(chord);
    const root = midiOf(cm[1] + '3'), third = cm[2] ? 3 : 4;
    for (const [off, kind] of song.pattern) {
      if (kind === 'b') events.push({ at: start + off, len: 2, kind: 'bass', midi: root - 12 });
      if (kind === 'f') events.push({ at: start + off, len: 2, kind: 'bass', midi: root - 5 });
      if (kind === 'c') events.push({ at: start + off, len: 1, kind: 'chord', midi: [root + 12, root + 12 + third, root + 19] });
      if (kind === 'd') events.push({ at: start + off, len: 1, kind: 'drum' });
    }
    let pos = 0;
    for (const tok of tune.split(' ')) {
      const [n, l] = tok.split(':'); const len = +l;
      if (n !== 'r') events.push({ at: start + pos, len, kind: 'lead', midi: midiOf(n) });
      pos += len;
    }
    if (pos !== song.bar) console.warn(song.name + ': bar ' + (b + 1) + ' adds up to ' + pos + ', not ' + song.bar);
  });
  events.sort((a, b) => a.at - b.at);
  return { song, events, length: song.bars.length * song.bar };
}

// ---------- The instruments ----------
// Each one builds a tiny sound circuit for one note, starting at audio time t.
function envelope(g, t, peak, attack, hold, release) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}
const INSTRUMENTS = {
  // Two slightly out-of-tune reedy tones together: that wobbly "beating" is the accordion sound.
  accordion(c, out, f, t, dur) {
    const g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900;
    lp.connect(g); g.connect(out);
    for (const k of [1, 1.006]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * k; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    envelope(g, t, 0.075, 0.03, Math.max(0.01, dur - 0.1), 0.07);
  },
  // A pure tone with a little vibrato (a fast, gentle wobble in pitch), like a tin whistle.
  whistle(c, out, f, t, dur) {
    const g = c.createGain(); g.connect(out);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const vib = c.createOscillator(), depth = c.createGain(); vib.frequency.value = 5.5; depth.gain.value = f * 0.007;
    vib.connect(depth); depth.connect(o.frequency);
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = 0.12;
    o.connect(g); o2.connect(g2); g2.connect(g);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.1); });
    envelope(g, t, 0.16, 0.04, Math.max(0.01, dur - 0.12), 0.08);
  },
  bass(c, out, f, t) {
    const g = c.createGain(); g.connect(out);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.5);
    envelope(g, t, 0.3, 0.01, 0.05, 0.35);
  },
  // A guitar-ish pluck: starts loud and dies away quickly.
  pluck(c, out, f, t) {
    const g = c.createGain(); g.connect(out);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.35);
    envelope(g, t, 0.05, 0.005, 0.02, 0.25);
  },
  // A soft thump: a low tone that drops in pitch very fast.
  drum(c, out, t) {
    const g = c.createGain(); g.connect(out);
    const o = c.createOscillator(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    o.connect(g); o.start(t); o.stop(t + 0.2);
    envelope(g, t, 0.22, 0.004, 0.01, 0.13);
  }
};

// ---------- The player ----------
const Music = {
  compiled: SONGS.map(compileSong),
  current: -1, wanted: 0, loopStart: 0, idx: 0, timer: null,
  // Ask for a song. If sound isn't allowed yet, it starts as soon as it is.
  play(i) {
    this.wanted = i;
    if (!Sound.ctx || this.current === i) return;
    this.current = i; this.idx = 0; this.loopStart = Sound.ctx.currentTime + 0.15;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
  },
  tick() {
    const c = Sound.ctx, s = this.compiled[this.current];
    if (!c || !s) return;
    const now = c.currentTime, step = s.song.eighth;
    for (let guard = 0; guard < 200; guard++) {
      if (this.idx >= s.events.length) { this.idx = 0; this.loopStart += s.length * step; }
      const ev = s.events[this.idx], t = this.loopStart + ev.at * step;
      if (t > now + 0.3) break;
      this.idx++;
      if (t < now - 0.05) continue;   // too late (the tab was hidden): skip it rather than play a pile-up
      this.playNote(ev, t, step, s.song.lead);
    }
  },
  playNote(ev, t, step, lead) {
    const c = Sound.ctx, out = Sound.musicBus;
    if (ev.kind === 'lead') INSTRUMENTS[lead](c, out, hzOf(ev.midi), t, ev.len * step);
    else if (ev.kind === 'bass') INSTRUMENTS.bass(c, out, hzOf(ev.midi), t);
    else if (ev.kind === 'chord') ev.midi.forEach(n => INSTRUMENTS.pluck(c, out, hzOf(n), t));
    else if (ev.kind === 'drum') INSTRUMENTS.drum(c, out, t);
  },
  // Turn the music down for a few seconds (so the win fanfare can be heard), then back up.
  duck(seconds) {
    if (!Sound.musicBus || Sound.musicMuted) return;
    const g = Sound.musicBus.gain, now = Sound.ctx.currentTime;
    g.cancelScheduledValues(now); g.setTargetAtTime(MUSIC_VOL * 0.15, now, 0.1);
    g.setTargetAtTime(MUSIC_VOL, now + seconds, 0.6);
  }
};
Sound.onInit.push(() => Music.play(Music.wanted));
