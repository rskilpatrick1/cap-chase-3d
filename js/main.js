'use strict';
/* =====================================================================
   main.js - PUTTING IT TOGETHER
   Keyboard input, the menu cards, saving progress, and the loop that
   runs every frame: update the rules, sync the 3D models, draw the HUD.
   ===================================================================== */

// When a place starts: build its 3D scenery and mini-map, and switch to its tune.
const buildScenery = Hooks.levelStart;
Hooks.levelStart = () => { buildScenery(); buildMinimap(); Music.play(levelIndex % SONGS.length); Ambience.reset(); };

// ---------- Keyboard ----------
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX', 'KeyB'];
window.addEventListener('keydown', e => {
  Sound.init();
  // Let a focused menu button handle Enter/Space itself.
  if (e.target && e.target.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (phase === 'story' && (e.code === 'Space' || e.code === 'Enter')) { wake(); return; }
  if (phase === 'play') {
    if (e.code === 'Space') action();
    if (e.code === 'KeyB') ringBell();
    if (e.code === 'KeyP' || e.code === 'Escape') pause();
  } else if (phase === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) resume();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyN') toggleMusic();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (phase === 'play') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- Saving progress ----------
// Saved in this browser only. If saving is blocked, the game still works; it just forgets.
const SAVE_KEY = 'cap-chase-3d-progress-v1';
let progress = { unlocked: 1, best: [] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.unlocked) progress = s; } catch (e) { }
function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) { } }

// ---------- Menu cards ----------
const $ = id => document.getElementById(id);
const screens = ['titleScreen', 'storyScreen', 'winScreen', 'endScreen', 'pauseScreen'];
function show(id) { screens.forEach(s => $(s).hidden = s !== id); }
function hideAll() { screens.forEach(s => $(s).hidden = true); }
function fmtTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); }

function goTitle() {
  // Show the first place's nap tree behind the title card.
  startLevel(0);
  phase = 'title';
  $('pauseBtn').hidden = true;
  renderPlaces();
  show('titleScreen');
}
function renderPlaces() {
  const list = $('placeList');
  list.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'place'; b.id = 'place' + i;
    const locked = i >= progress.unlocked;
    b.disabled = locked;
    b.innerHTML = '<span class="pn"></span><span class="pl"></span><span class="ps"></span>';
    b.querySelector('.pn').textContent = (i + 1) + '. ' + lv.short;
    b.querySelector('.pl').textContent = locked ? 'Finish the place before to unlock' : lv.landmark;
    b.querySelector('.ps').textContent = progress.best[i] ? 'Best score ' + progress.best[i].toLocaleString() : (locked ? '' : 'Not played yet');
    b.addEventListener('click', () => { Sound.init(); playLevel(i); });
    list.appendChild(b);
  });
}
function playLevel(i) {
  startLevel(i);
  $('storyEyebrow').textContent = 'Place ' + (i + 1) + ' of ' + LEVELS.length + ': ' + L.name;
  $('storyTitle').textContent = L.storyTitle;
  $('storyText').textContent = L.story;
  $('pauseBtn').hidden = true;
  show('storyScreen');
}
function wake() { hideAll(); wakeUp(); $('pauseBtn').hidden = false; }

Hooks.levelComplete = () => {
  progress.best[levelIndex] = Math.max(progress.best[levelIndex] || 0, score);
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  saveProgress();
  Music.duck(4);   // quiet the tune so the fanfare can be heard
  $('winEyebrow').textContent = L.name;
  $('statScore').textContent = score.toLocaleString();
  $('statTricks').textContent = tricks;
  $('statTime').textContent = fmtTime(levelTime);
  $('winBest').textContent = bestTrick ? 'Best trick: ' + bestTrick.label + ' (+' + bestTrick.pts + ')' : 'Tip: follow the yellow arrows up a ramp and press Space in the air to spin!';
  const lastOne = levelIndex === LEVELS.length - 1;
  $('nextBtn').textContent = lastOne ? 'Finish the story' : 'Next: ' + LEVELS[levelIndex + 1].short;
  $('pauseBtn').hidden = true;
  show('winScreen');
};

let pausedFrom = null;
function pause() { if (phase !== 'play') return; pausedFrom = phase; phase = 'paused'; show('pauseScreen'); }
function resume() { if (phase !== 'paused') return; phase = pausedFrom || 'play'; hideAll(); last = performance.now(); }

function toggleMute() {
  Sound.setMuted(!Sound.muted);
  $('muteBtn').textContent = Sound.muted ? 'Sound: off' : 'Sound: on';
  try { localStorage.setItem('cap-chase-muted', Sound.muted ? '1' : '0'); } catch (e) { }
}
try { if (localStorage.getItem('cap-chase-muted') === '1') { Sound.muted = true; $('muteBtn').textContent = 'Sound: off'; } } catch (e) { }
// Music has its own switch, so the kids can keep the sound effects and lose the tune (or the other way round).
function toggleMusic() {
  Sound.setMusicMuted(!Sound.musicMuted);
  $('musicBtn').textContent = Sound.musicMuted ? 'Music: off' : 'Music: on';
  try { localStorage.setItem('cap-chase-music-off', Sound.musicMuted ? '1' : '0'); } catch (e) { }
}
try { if (localStorage.getItem('cap-chase-music-off') === '1') { Sound.musicMuted = true; $('musicBtn').textContent = 'Music: off'; } } catch (e) { }

$('wakeBtn').addEventListener('click', wake);
$('nextBtn').addEventListener('click', () => {
  if (levelIndex === LEVELS.length - 1) {
    const total = progress.best.reduce((a, b) => a + (b || 0), 0);
    $('endTotal').textContent = 'Your best scores add up to ' + total.toLocaleString() + ' points.';
    show('endScreen');
  } else playLevel(levelIndex + 1);
});
$('againBtn').addEventListener('click', () => playLevel(levelIndex));
$('menuBtn').addEventListener('click', goTitle);
$('endMenuBtn').addEventListener('click', goTitle);
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', goTitle);
$('muteBtn').addEventListener('click', e => { Sound.init(); toggleMute(); e.currentTarget.blur(); });
$('musicBtn').addEventListener('click', e => { Sound.init(); toggleMusic(); e.currentTarget.blur(); });
// The very first click anywhere is enough to let the music start on the title screen.
window.addEventListener('pointerdown', () => Sound.init());
$('pauseBtn').addEventListener('click', e => { pause(); e.currentTarget.blur(); });

// ---------- The loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  update(dt);
  Ambience.update(dt);
  syncScene(dt);
  renderer.render(scene, camera);
  drawHUD();
  requestAnimationFrame(frame);
}

resize();
goTitle();
requestAnimationFrame(frame);
