'use strict';
/* =====================================================================
   world3d.js - THE 3D VIEW
   Builds a Three.js model of the current place, then every frame copies
   the rules' flat-map positions onto the models and moves the camera.
   The one idea to hold onto: a map point (x, y) at height z becomes the
   3D point (x, z, y). In Three.js the SECOND number is "up".
   ===================================================================== */

const worldCanvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas: worldCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const SKY = new THREE.Color('#bcd9e6');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 900, 2300);
const camera = new THREE.PerspectiveCamera(60, 1, 2, 6000);

// Soft storybook light: a warm sky/ground fill plus a gentle sun.
scene.add(new THREE.HemisphereLight('#fff6e0', '#7a8a50', 0.8));
const sun = new THREE.DirectionalLight('#fff1d6', 0.55);
sun.position.set(-1, 2.2, 1.2);
scene.add(sun);

// ---------- Building blocks ----------
// One material per colour, shared. Low-detail shapes give the faceted, cut-paper look.
const matCache = {};
function mat(color) { return matCache[color] || (matCache[color] = new THREE.MeshLambertMaterial({ color })); }
function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  return m;
}
// A stick between two points (bike frame, arms, legs).
function rod(a, b, r, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = new THREE.Vector3().subVectors(B, A);
  const m = mesh(new THREE.CylinderGeometry(r, r, dir.length(), 6), color);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
// A triangular roof shape whose ridge runs along x.
function prismGeo(across, height, length) {
  const s = new THREE.Shape();
  s.moveTo(-across / 2, 0); s.lineTo(across / 2, 0); s.lineTo(0, height); s.lineTo(-across / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2); g.rotateY(Math.PI / 2);
  return g;
}
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), c);
  return new THREE.CanvasTexture(c);
}
function darker(hex, k = 0.75) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

// Cheap round shadows: a soft dark disc laid flat under things.
const shadowMat = new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false,
  map: canvasTex(64, 64, g => {
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(40,40,20,.45)'); grd.addColorStop(1, 'rgba(40,40,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  })
});
function blobShadow(rx, ry = rx) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  m.rotation.x = -Math.PI / 2; m.scale.set(rx * 2.4, ry * 2.4, 1); m.position.y = 0.6;
  return m;
}

// Things that turn see-through when they stand between the camera and the bike.
// Each one gets its own copies of its materials so fading one tree doesn't fade them all.
let fadeables = [];
function makeFadeable(group, x, y, r) {
  const mats = [];
  group.traverse(o => {
    if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; mats.push(o.material); }
  });
  fadeables.push({ x, y, r, mats });
}

// Things that move on their own: windmill sails, lighthouse beams, bobbing boats, the clock.
let animated = [];

// ---------- The ground: painted once onto one big picture ----------
function paintGround() {
  const tex = canvasTex(L.w, L.h, g => {
    g.fillStyle = L.grass; g.fillRect(0, 0, L.w, L.h);
    const rng = makeRng(L.seed);
    for (let i = 0; i < 9000; i++) {   // mottled grass
      g.fillStyle = rng() < 0.5 ? L.grass2 : '#b2c072';
      g.globalAlpha = 0.5; g.beginPath(); g.ellipse(rng() * L.w, rng() * L.h, 6 + rng() * 14, 4 + rng() * 8, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    const tile = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); return g.createPattern(c, 'repeat'); };
    const cobble = tile(48, 48, t => {
      t.fillStyle = '#cdbf9f'; t.fillRect(0, 0, 48, 48); t.fillStyle = '#c1b290';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) t.fillRect(c * 16 + (r % 2 ? 8 : 0) + 1, r * 12 + 1, 14, 10);
    });
    const sand = tile(40, 40, t => {
      t.fillStyle = '#e8d29b'; t.fillRect(0, 0, 40, 40); t.fillStyle = '#d9c084';
      [[5, 7], [22, 4], [31, 19], [12, 26], [26, 33], [3, 35], [17, 15]].forEach(([x, y]) => t.fillRect(x, y, 3, 3));
    });
    const rocky = tile(60, 60, t => {
      t.fillStyle = '#b7b09b'; t.fillRect(0, 0, 60, 60); t.fillStyle = '#a39c86';
      [[8, 10, 7], [35, 6, 5], [48, 30, 8], [18, 40, 6], [40, 50, 4]].forEach(([x, y, r]) => { t.beginPath(); t.arc(x, y, r, 0, TAU); t.fill(); });
    });
    const planksAcross = (vertical) => tile(vertical ? 20 : 40, vertical ? 40 : 20, t => {
      t.fillStyle = '#b98b55'; t.fillRect(0, 0, 40, 40); t.fillStyle = '#9c7243';
      if (vertical) { t.fillRect(9, 0, 2, 40); t.fillRect(19, 0, 1, 40); } else { t.fillRect(0, 9, 40, 2); t.fillRect(0, 19, 40, 1); }
    });
    // Order matters: grass bits first, then paths and squares, then water, then bridges on top.
    const order = { meadow: 0, sand: 0, rocky: 0, path: 1, plaza: 1, water: 2, pond: 2, bridge: 3, pier: 3 };
    const things = L.things.filter(t => t.k in order).sort((a, b) => order[a.k] - order[b.k]);
    for (const t of things) {
      switch (t.k) {
        case 'meadow': g.fillStyle = '#b4c375'; g.beginPath(); g.ellipse(t.x, t.y, t.r, t.r * 0.8, 0, 0, TAU); g.fill(); break;
        case 'sand': g.fillStyle = sand; g.fillRect(t.x, t.y, t.w, t.h); break;
        case 'rocky': g.fillStyle = rocky; g.fillRect(t.x, t.y, t.w, t.h); break;
        case 'plaza': g.fillStyle = cobble; g.fillRect(t.x, t.y, t.w, t.h); g.strokeStyle = '#b3a37f'; g.lineWidth = 4; g.strokeRect(t.x, t.y, t.w, t.h); break;
        case 'path':
          g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath(); t.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
          g.strokeStyle = '#c4a978'; g.lineWidth = t.w + 8; g.stroke();
          g.strokeStyle = '#dcc394'; g.lineWidth = t.w; g.stroke();
          break;
        case 'water':
          if (t.canal) { g.fillStyle = '#a59a85'; g.fillRect(t.x, t.y - 10, t.w, t.h + 20); }
          else if (t.creek) { g.fillStyle = '#8aa87a'; g.fillRect(t.x - 8, t.y, t.w + 16, t.h); }
          g.fillStyle = '#6a9db6'; g.fillRect(t.x, t.y, t.w, t.h);
          if (!t.canal && !t.creek) { g.fillStyle = '#efe4c0'; g.fillRect(t.x, t.y - 3, t.w, 7); }   // foam along the beach
          g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3; g.lineCap = 'round';
          for (let y = t.y + 30; y < t.y + t.h; y += 60) for (let x = t.x + 20 + (y % 120 ? 55 : 0); x < t.x + t.w; x += 110) { g.beginPath(); g.arc(x, y, 10, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
          break;
        case 'pond':
          g.fillStyle = '#8a9a5a'; g.beginPath(); g.arc(t.x, t.y + 3, t.r + 10, 0, TAU); g.fill();
          g.fillStyle = '#6fa3b8'; g.beginPath(); g.arc(t.x, t.y, t.r, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(t.x - t.r * .2, t.y - t.r * .2, t.r * .55, t.r * .4, 0, 0, TAU); g.fill();
          g.fillStyle = '#5d8a45';
          [[0.4, 0.3], [-0.5, 0.25], [0.1, -0.5]].forEach(([a, b]) => { g.beginPath(); g.moveTo(t.x + a * t.r, t.y + b * t.r); g.arc(t.x + a * t.r, t.y + b * t.r, 12, 0.4, TAU - 0.2); g.closePath(); g.fill(); });
          break;
        case 'bridge':
          // Planks run across the direction you ride.
          g.fillStyle = planksAcross(!!t.vertical); g.fillRect(t.x, t.y, t.w, t.h);
          break;
        case 'pier':
          g.fillStyle = '#6b4b2c'; g.fillRect(t.x - 4, t.y, t.w + 8, t.h + 6);
          g.fillStyle = planksAcross(false); g.fillRect(t.x, t.y, t.w, t.h);
          break;
      }
    }
    // Yellow arrows painted on the ground leading up to each ramp, so kids can line up.
    for (const r of L.ramps) {
      g.save(); g.translate(r.x, r.y); g.rotate(r.a);
      g.strokeStyle = '#f2cf4a'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 3; i++) { const x = -RAMP_L / 2 - 30 - i * 34; g.beginPath(); g.moveTo(x - 10, -16); g.lineTo(x + 4, 0); g.lineTo(x - 10, 16); g.stroke(); }
      g.restore();
    }
    // Flowers, but only on grass.
    const F = ['#f4f0e0', '#e8b33a', '#c9584a', '#a98bd0'];
    for (let i = 0; i < 1600; i++) {
      const x = rng() * L.w, y = rng() * L.h, c = F[Math.floor(rng() * 4)], r = 3 + rng() * 2;
      if (onSurface(x, y)) continue;
      g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  });
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
// Is this spot on a path, square, water, sand or bridge? (So flowers don't grow there.)
function onSurface(x, y) {
  for (const g of L.things) {
    if (['plaza', 'sand', 'water', 'rocky', 'pier', 'bridge'].includes(g.k) && inRect(x, y, g)) return true;
    if (g.k === 'pond' && Math.hypot(x - g.x, y - g.y) < g.r + 12) return true;
    if (g.k === 'path') {
      for (let i = 1; i < g.pts.length; i++) {
        const [ax, ay] = g.pts[i - 1], [bx, by] = g.pts[i];
        const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2, 0, 1);
        if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) < g.w / 2 + 6) return true;
      }
    }
  }
  return false;
}

// ---------- One builder per kind of thing ----------
const BUILD = {
  tree(t) {
    const s = t.s, g = new THREE.Group(); g.position.set(t.x, 0, t.y);
    g.add(mesh(new THREE.CylinderGeometry(6 * s, 9 * s, 80 * s, 7), '#7a5634', 0, 40 * s, 0));
    const ball = (r, x, y, z, c) => g.add(mesh(new THREE.IcosahedronGeometry(r, 1), c, x, y, z));
    ball(34 * s, 0, 70 * s, 0, '#4f6f35');
    ball(22 * s, -16 * s, 82 * s, 8 * s, '#5f8240');
    ball(21 * s, 15 * s, 84 * s, -6 * s, '#5f8240');
    ball(19 * s, -2 * s, 98 * s, 2 * s, '#6f9449');
    makeFadeable(g, t.x, t.y, 36 * s);
    const sh = blobShadow(34 * s); sh.position.set(t.x + 8 * s, 0.5, t.y + 6); levelGroup.add(sh);
    return g;
  },
  house(h) {
    const g = new THREE.Group(); g.position.set(h.x + h.w / 2, 0, h.y + h.h / 2);
    g.add(mesh(new THREE.BoxGeometry(h.w, 70, h.h), '#efe0bd', 0, 35, 0));
    g.add(mesh(prismGeo(h.h + 16, 48, h.w + 16), h.roof, 0, 70, 0));
    g.add(mesh(new THREE.BoxGeometry(14, 30, 14), '#9c6b52', h.w / 2 - 28, 104, -h.h / 6));
    const front = h.h / 2 + 1;
    g.add(mesh(new THREE.BoxGeometry(22, 36, 2), '#7d5a35', 0, 18, front));
    g.add(mesh(new THREE.BoxGeometry(20, 16, 2), '#8fb3c6', -h.w / 2 + 26, 42, front), mesh(new THREE.BoxGeometry(20, 16, 2), '#8fb3c6', h.w / 2 - 26, 42, front));
    // A washing line behind the house, with laundry flapping on it.
    const back = -h.h / 2 - 18, x0 = -h.w / 2 + 10, x1 = h.w / 2 - 10;
    g.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 48, 5), '#6e4523', x0, 24, back), mesh(new THREE.CylinderGeometry(1.5, 1.5, 48, 5), '#6e4523', x1, 24, back));
    g.add(rod([x0, 46, back], [x1, 46, back], 0.6, '#eeeeee'));
    const wash = ['#f4f0e0', '#c9584a', '#8fb3c6', '#e8b33a'], n = Math.floor((x1 - x0 - 8) / 26);
    for (let i = 0; i < n; i++) { const c = cloth(18, 20 + (i % 2) * 6, wash[(i + h.x) % 4], true); c.position.set(x0 + 17 + i * 26, 46, back); g.add(c); }
    makeFadeable(g, h.x + h.w / 2, h.y + h.h / 2, Math.max(h.w, h.h) / 2 + 10);
    const sh = blobShadow(h.w / 2 + 20, h.h / 2 + 20); sh.position.set(h.x + h.w / 2 + 10, 0.5, h.y + h.h / 2 + 10); levelGroup.add(sh);
    return g;
  },
  windmill(w) {
    const g = new THREE.Group(); g.position.set(w.x, 0, w.y);
    g.add(mesh(new THREE.CylinderGeometry(34, 58, 180, 8), '#e9dcc0', 0, 90, 0));
    g.add(mesh(new THREE.ConeGeometry(46, 56, 8), '#b5523b', 0, 208, 0));
    g.add(mesh(new THREE.BoxGeometry(26, 40, 4), '#7d5a35', 0, 20, 54));
    // Sails on the south side, turning slowly.
    const sails = new THREE.Group(); sails.position.set(0, 165, 46);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
      arm.add(mesh(new THREE.BoxGeometry(6, 130, 4), '#6e4523', 0, 65, 0));
      arm.add(mesh(new THREE.BoxGeometry(28, 100, 2), '#f3ead6', 17, 75, 2));
      sails.add(arm);
    }
    sails.add(mesh(new THREE.SphereGeometry(9, 8, 6), INK));
    g.add(sails);
    animated.push(dt => { sails.rotation.z += 0.8 * dt; });
    addFlag(g, 0, 232, 0, '#f2cf4a');
    makeFadeable(g, w.x, w.y, 70);
    const sh = blobShadow(70); sh.position.set(w.x + 20, 0.5, w.y + 20); levelGroup.add(sh);
    return g;
  },
  well(w) {
    const g = new THREE.Group(); g.position.set(w.x, 0, w.y);
    g.add(mesh(new THREE.CylinderGeometry(32, 34, 26, 12), '#9a9488', 0, 13, 0));
    g.add(mesh(new THREE.CylinderGeometry(24, 24, 2, 12), '#3c4c55', 0, 26, 0));
    g.add(mesh(new THREE.BoxGeometry(6, 70, 6), '#7d5a35', -28, 35, 0), mesh(new THREE.BoxGeometry(6, 70, 6), '#7d5a35', 28, 35, 0));
    g.add(mesh(prismGeo(40, 26, 80), '#b5523b', 0, 70, 0));
    g.add(mesh(new THREE.CylinderGeometry(7, 6, 12, 8), '#8b5a33', 0, 46, 0));
    return g;
  },
  log(l) {
    const horiz = l.w > l.h, len = horiz ? l.w : l.h;
    const m = mesh(new THREE.CylinderGeometry(10, 10, len, 8), '#8a5d36', l.x + l.w / 2, 10, l.y + l.h / 2);
    if (horiz) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
    return m;
  },
  hay(h) { return mesh(new THREE.CylinderGeometry(24, 24, 30, 10), '#e3bf5a', h.x, 15, h.y); },
  ramp(r) {
    // Side view of a wedge, pushed out sideways to the ramp's width.
    const s = new THREE.Shape(); s.moveTo(-RAMP_L / 2, 0); s.lineTo(RAMP_L / 2, 0); s.lineTo(RAMP_L / 2, RAMP_H); s.lineTo(-RAMP_L / 2, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: RAMP_W, bevelEnabled: false }); geo.translate(0, 0, -RAMP_W / 2);
    const m = mesh(geo, r.sand ? '#e3c98a' : '#c99456', r.x, 0, r.y); m.rotation.y = -r.a;
    m.add(mesh(new THREE.BoxGeometry(6, RAMP_H, RAMP_W), r.sand ? '#b89b5e' : '#6e4523', RAMP_L / 2 - 3, RAMP_H / 2, 0));
    const slope = Math.atan2(RAMP_H, RAMP_L);
    for (const off of [-14, 14]) { const st = mesh(new THREE.BoxGeometry(RAMP_L, 1, 6), '#f2cf4a', 0, RAMP_H / 2 + 0.8, off); st.rotation.z = slope; m.add(st); }
    return m;
  },
  stall(s) {
    const g = new THREE.Group(); g.position.set(s.x + s.w / 2, 0, s.y + s.h / 2);
    g.add(mesh(new THREE.BoxGeometry(s.w, 40, s.h * 0.6), '#b98b55', 0, 20, s.h * 0.2));
    // Fruit and loaves on the counter.
    const goods = ['#d8452f', '#e9a23b', '#7fae4a', '#c98b4a'];
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry(7, 8, 6), goods[i % 4], -s.w / 2 + 14 + i * ((s.w - 28) / 5), 46, s.h * 0.2));
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.BoxGeometry(5, 80, 5), '#6e4523', px * (s.w / 2 - 3), 40, pz * (s.h / 2 - 3)));
    // Striped awning, tilted down toward the front.
    const stripes = canvasTex(128, 16, t => { for (let i = 0; i < 8; i++) { t.fillStyle = i % 2 ? '#f4ecd8' : s.c; t.fillRect(i * 16, 0, 16, 16); } });
    const awning = mesh(new THREE.BoxGeometry(s.w + 20, 3, s.h + 24), new THREE.MeshLambertMaterial({ map: stripes }), 0, 84, 0);
    awning.rotation.x = 0.18; g.add(awning);
    addFlag(g, s.w / 2 - 3, 84, -(s.h / 2 - 3), s.c, 26, 18, 11);
    makeFadeable(g, s.x + s.w / 2, s.y + s.h / 2, s.w / 2 + 6);
    return g;
  },
  crate(c) {
    const g = mesh(new THREE.BoxGeometry(38, 38, 38), '#c49460', c.x + 19, 19, c.y + 19);
    g.add(mesh(new THREE.BoxGeometry(40, 4, 40), '#d9ab74', 0, 17, 0));
    return g;
  },
  barrel(b) {
    const g = mesh(new THREE.CylinderGeometry(16, 16, 36, 12), '#9c6a3c', b.x, 18, b.y);
    g.add(mesh(new THREE.CylinderGeometry(17, 17, 4, 12), '#5a4535', 0, 8, 0), mesh(new THREE.CylinderGeometry(17, 17, 4, 12), '#5a4535', 0, -8, 0));
    return g;
  },
  rock(r) {
    const m = mesh(new THREE.DodecahedronGeometry(r.r, 0), '#9a9588', r.x, r.r * 0.35, r.y);
    m.scale.y = 0.7; m.rotation.y = r.x;
    return m;
  },
  fountain(f) {
    const g = new THREE.Group(); g.position.set(f.x, 0, f.y);
    g.add(mesh(new THREE.CylinderGeometry(f.r, f.r + 4, 24, 24), '#b0a58e', 0, 12, 0));
    g.add(mesh(new THREE.CylinderGeometry(f.r - 10, f.r - 10, 2, 24), '#76abc0', 0, 23, 0));
    g.add(mesh(new THREE.CylinderGeometry(9, 12, 60, 10), '#b0a58e', 0, 50, 0));
    g.add(mesh(new THREE.CylinderGeometry(24, 10, 10, 14), '#c2b79f', 0, 82, 0));
    // A shimmering plume of water that gently pulses.
    const plume = mesh(new THREE.ConeGeometry(30, 70, 12, 1, true), new THREE.MeshLambertMaterial({ color: '#d6ecf5', transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0, 60, 0);
    plume.rotation.x = Math.PI;   // wide at the bottom, like water falling from the top bowl
    g.add(plume);
    animated.push(() => { const k = 1 + Math.sin(clock * 4) * 0.05; plume.scale.set(k, 1, k); });
    return g;
  },
  clock(c) {
    const g = new THREE.Group(); g.position.set(c.x + c.w / 2, 0, c.y + c.h / 2);
    g.add(mesh(new THREE.BoxGeometry(c.w, 300, c.h), '#c98f6a', 0, 150, 0));
    const roof = mesh(new THREE.ConeGeometry(Math.max(c.w, c.h) * 0.78, 110, 4), '#3d6a9e', 0, 355, 0);
    roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(34, 54, 2), '#7d5a35', 0, 27, c.h / 2 + 1));
    // The clock face shows the real time on your computer, redrawn every few seconds.
    const faceCanvas = document.createElement('canvas'); faceCanvas.width = faceCanvas.height = 128;
    const faceTex = new THREE.CanvasTexture(faceCanvas);
    const drawFace = () => {
      const t = faceCanvas.getContext('2d'), now = new Date();
      t.fillStyle = '#f7f0dd'; t.beginPath(); t.arc(64, 64, 62, 0, TAU); t.fill();
      t.strokeStyle = INK; t.lineWidth = 5; t.stroke(); t.fillStyle = INK;
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; t.fillRect(64 + Math.cos(a) * 50 - 3, 64 + Math.sin(a) * 50 - 3, 6, 6); }
      const hr = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * TAU - Math.PI / 2, mn = now.getMinutes() / 60 * TAU - Math.PI / 2;
      t.lineCap = 'round';
      t.lineWidth = 8; t.beginPath(); t.moveTo(64, 64); t.lineTo(64 + Math.cos(hr) * 30, 64 + Math.sin(hr) * 30); t.stroke();
      t.lineWidth = 5; t.beginPath(); t.moveTo(64, 64); t.lineTo(64 + Math.cos(mn) * 46, 64 + Math.sin(mn) * 46); t.stroke();
      faceTex.needsUpdate = true;
    };
    drawFace();
    let since = 0; animated.push(dt => { since += dt; if (since > 5) { since = 0; drawFace(); } });
    g.add(mesh(new THREE.CircleGeometry(44, 32), new THREE.MeshBasicMaterial({ map: faceTex }), 0, 220, c.h / 2 + 1.5));
    addFlag(g, 0, 405, 0, '#b8432f', 44, 36, 22);
    makeFadeable(g, c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) / 2 + 10);
    const sh = blobShadow(c.w / 2 + 30, c.h / 2 + 30); sh.position.set(c.x + c.w / 2 + 20, 0.5, c.y + c.h / 2 + 20); levelGroup.add(sh);
    return g;
  },
  lighthouse(l) {
    const g = new THREE.Group(); g.position.set(l.x, 0, l.y);
    // Five red and white bands, each a little narrower than the one below.
    const bands = 5, H = 230;
    for (let i = 0; i < bands; i++) {
      const r0 = lerp(44, 28, i / bands), r1 = lerp(44, 28, (i + 1) / bands);
      g.add(mesh(new THREE.CylinderGeometry(r1, r0, H / bands, 16), i % 2 ? '#f4efe2' : '#c0392b', 0, H / bands * (i + 0.5), 0));
    }
    g.add(mesh(new THREE.CylinderGeometry(38, 38, 6, 16), INK, 0, H + 3, 0));
    g.add(mesh(new THREE.CylinderGeometry(22, 22, 32, 12), new THREE.MeshBasicMaterial({ color: '#ffe58a' }), 0, H + 22, 0));
    g.add(mesh(new THREE.SphereGeometry(28, 14, 8, 0, TAU, 0, Math.PI / 2), '#c0392b', 0, H + 38, 0));
    g.add(mesh(new THREE.BoxGeometry(24, 38, 2), '#7d5a35', 0, 19, 40));
    // Two soft beams sweeping round.
    const beams = new THREE.Group(); beams.position.y = H + 22;
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (const dir of [1, -1]) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(45, 420, 16, 1, true), beamMat);
      b.rotation.z = dir * Math.PI / 2; b.position.x = -dir * 210;
      beams.add(b);
    }
    g.add(beams);
    animated.push(dt => { beams.rotation.y += 0.9 * dt; });
    addFlag(g, 0, H + 62, 0, '#3d6a9e');
    makeFadeable(g, l.x, l.y, 55);
    const sh = blobShadow(60); sh.position.set(l.x + 20, 0.5, l.y + 15); levelGroup.add(sh);
    return g;
  },
  boat(b) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.y);
    const hull = mesh(new THREE.BoxGeometry(120, 18, 40), b.c, 0, 6, 0);
    g.add(hull, mesh(new THREE.BoxGeometry(116, 4, 42), '#f4e7c9', 0, 15, 0));
    g.add(mesh(new THREE.CylinderGeometry(2.5, 2.5, 100, 6), '#5a3e24', 0, 65, 0));
    const sail = new THREE.Shape(); sail.moveTo(0, 0); sail.lineTo(0, 84); sail.lineTo(46, 0); sail.lineTo(0, 0);
    g.add(mesh(new THREE.ShapeGeometry(sail), new THREE.MeshLambertMaterial({ color: '#f7f0dd', side: THREE.DoubleSide }), 4, 20, 0));
    addFlag(g, 0, 112, 0, '#f2cf4a', 14, 22, 9);   // a pennant at the top of the mast
    const phase0 = b.x * 0.01;
    animated.push(() => { g.position.y = Math.sin(clock * 1.8 + phase0) * 3; g.rotation.x = Math.sin(clock * 1.4 + phase0) * 0.05; });
    return g;
  },
  bridge(b) {
    // The deck is painted on the ground; these are the rails along its sides.
    const g = new THREE.Group();
    const rail = (x, y, w, h) => {
      g.add(mesh(new THREE.BoxGeometry(w, 4, h), '#7d5a35', x + w / 2, 16, y + h / 2));
      const n = Math.max(2, Math.round(Math.max(w, h) / 40));
      for (let i = 0; i <= n; i++) {
        const px = w > h ? x + i * w / n : x + w / 2, py = w > h ? y + h / 2 : y + i * h / n;
        g.add(mesh(new THREE.BoxGeometry(5, 18, 5), '#6e4523', px, 9, py));
      }
    };
    if (b.vertical) { rail(b.x, b.y, b.w, 6); rail(b.x, b.y + b.h - 6, b.w, 6); }
    else { rail(b.x, b.y, 6, b.h); rail(b.x + b.w - 6, b.y, 6, b.h); }
    return g;
  },
  pier(p) {
    const g = new THREE.Group();
    for (let y = p.y + 40; y < p.y + p.h; y += 80) {
      g.add(mesh(new THREE.CylinderGeometry(6, 6, 26, 8), '#5a3e24', p.x - 4, 8, y), mesh(new THREE.CylinderGeometry(6, 6, 26, 8), '#5a3e24', p.x + p.w + 4, 8, y));
    }
    return g;
  }
};

// ---------- Flags and laundry that flutter in the wind ----------
// A flag is a flat sheet cut into strips. Every frame each point is pushed in and out
// by a wave that travels along the cloth, more at the loose end than at the pole.
let flutters = [];
function cloth(w, h, color, hanging) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 2);
  if (hanging) geo.translate(0, -h / 2, 0); else geo.translate(w / 2, 0, 0);   // pin the top edge, or the pole edge
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  flutters.push({ geo, base: Float32Array.from(geo.attributes.position.array), w, h, hanging, phase: Math.random() * TAU });
  return m;
}
function addFlag(parent, x, y, z, color, poleH = 34, w = 30, h = 18) {
  parent.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, poleH, 5), '#6e4523', x, y + poleH / 2, z));
  const f = cloth(w, h, color, false); f.position.set(x, y + poleH - h / 2 - 1, z); parent.add(f);
}
function updateFlutters() {
  for (const f of flutters) {
    const pos = f.geo.attributes.position, b = f.base;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1];
      const loose = f.hanging ? -y / f.h : x / f.w;         // 0 where it's pinned, 1 at the free edge
      pos.array[i * 3 + 2] = Math.sin(x * 0.22 - clock * 7 + f.phase) * 4 * loose;
    }
    pos.needsUpdate = true;
  }
}

// ---------- Sparkles, confetti, dust and splashes ----------
// A pool of flat pictures ("sprites") that always face the camera. Reusing them
// instead of making new ones each time keeps the game smooth.
// These use 3D coordinates directly: x, up, z.
const FX_TEX = {
  dot: canvasTex(32, 32, g => { const r = g.createRadialGradient(16, 16, 1, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }),
  star: canvasTex(32, 32, g => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 4 : 15; g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); } g.fill(); }),
  square: canvasTex(8, 8, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8); })
};
const fxPool = [], FX_MAX = 360;
function spawnFx(x, up, z, o) {
  let f = fxPool.find(f => !f.alive);
  if (!f) {
    if (fxPool.length >= FX_MAX) return;
    f = { sprite: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })) };
    scene.add(f.sprite); fxPool.push(f);
  }
  const m = f.sprite.material, blend = o.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
  m.map = FX_TEX[o.tex || 'dot']; m.color.set(o.color || '#ffffff');
  if (m.blending !== blend) { m.blending = blend; m.needsUpdate = true; }
  m.rotation = Math.random() * TAU;
  Object.assign(f, {
    alive: true, t: 0, life: o.life || 0.8, x, up, z, vx: o.vx || 0, vu: o.vu || 0, vz: o.vz || 0,
    grav: o.grav || 0, drag: o.drag || 0, size0: o.size || 8, size1: o.size1 !== undefined ? o.size1 : (o.size || 8),
    alpha: o.alpha || 1, spin: o.spin || 0
  });
  f.sprite.visible = true;
}
function updateFx(dt) {
  for (const f of fxPool) {
    if (!f.alive) continue;
    f.t += dt;
    if (f.t >= f.life) { f.alive = false; f.sprite.visible = false; continue; }
    const k = f.t / f.life, dr = Math.max(0, 1 - f.drag * dt);
    f.vx *= dr; f.vz *= dr; f.vu -= f.grav * dt;
    f.x += f.vx * dt; f.up += f.vu * dt; f.z += f.vz * dt;
    if (f.up < 1) { f.up = 1; f.vu = 0; f.vx *= 0.8; f.vz *= 0.8; }   // things land on the ground
    const sz = lerp(f.size0, f.size1, k);
    f.sprite.position.set(f.x, f.up, f.z); f.sprite.scale.set(sz, sz, 1);
    f.sprite.material.opacity = f.alpha * (1 - k * k);
    f.sprite.material.rotation += f.spin * dt;
  }
}
function clearFx() { for (const f of fxPool) { f.alive = false; f.sprite.visible = false; } }
// Ready-made bursts.
const burst = {
  sparkle(x, up, z, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(40, 110);
      spawnFx(x, up, z, { tex: 'star', glow: true, color: ['#ffe27a', '#fff6c8', '#ffd0e0'][i % 3], vx: Math.cos(a) * s, vz: Math.sin(a) * s, vu: rnd(30, 140), grav: 120, drag: 2, size: rnd(9, 14), size1: 2, life: rnd(0.5, 0.9), spin: rnd(-6, 6) });
    }
  },
  confetti(x, up, z, n = 36, power = 1) {
    const C = ['#e0533d', '#3d7fc4', '#f2cf4a', '#7fbf4a', '#f7a8c4', '#ffffff'];   // bright party colours
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(40, 150) * power;
      spawnFx(x, up, z, { tex: 'square', color: C[i % C.length], vx: Math.cos(a) * s, vz: Math.sin(a) * s, vu: rnd(180, 360) * power, grav: 420, drag: 1.6, size: rnd(3.5, 5), life: rnd(1.2, 1.8), spin: rnd(-10, 10) });
    }
  },
  dust(x, z, n = 1, color = '#d8c49a', power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(10, 40) * power;
      spawnFx(x + rnd(-4, 4), rnd(2, 6), z + rnd(-4, 4), { color, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vu: rnd(15, 40), drag: 2, size: rnd(10, 16), size1: rnd(28, 42), alpha: 0.5, life: rnd(0.55, 0.9) });
    }
  },
  splash(x, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU, s = rnd(30, 120);
      spawnFx(x, 4, z, { color: i % 3 ? '#e4f3f8' : '#9cc9dc', vx: Math.cos(a) * s, vz: Math.sin(a) * s, vu: rnd(150, 320), grav: 700, size: rnd(5, 9), size1: 3, life: rnd(0.6, 0.9) });
    }
    for (let i = 0; i < 6; i++) spawnFx(x + rnd(-10, 10), 3, z + rnd(-10, 10), { color: '#ffffff', size: 14, size1: 50, alpha: 0.45, life: 0.7 });
  }
};

// ---------- Birds that fly off when you ride too close ----------
// Each bird pecks at the ground, flaps away when the bike (or a running monkey)
// comes near, and some seconds later glides back to the same spot.
let birds = [];
function buildBird(kind) {
  const C = { sparrow: ['#8b6a4a', '#6b4f36', 1], pigeon: ['#8a8f9c', '#6f7380', 1.15], gull: ['#f4f2ea', '#9aa3ad', 1.6] }[kind];
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.scale.setScalar(C[2]);
  const torso = mesh(new THREE.SphereGeometry(5, 8, 6), C[0], 0, 6, 0); torso.scale.set(1.4, 0.9, 0.9); body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(3.2, 8, 6), C[0], 6, 9, 0));
  const beak = mesh(new THREE.ConeGeometry(1.2, 4, 5), '#e8a23b', 9.5, 9, 0); beak.rotation.z = -Math.PI / 2; body.add(beak);
  body.add(mesh(new THREE.BoxGeometry(6, 1.2, 5), C[1], -7, 7, 0));   // tail
  const wings = [-1, 1].map(side => {
    const w = new THREE.Group(); w.position.set(0, 8, 3.5 * side);
    w.add(mesh(new THREE.BoxGeometry(7, 1, 10), C[1], 0, 0, 5 * side)); body.add(w);
    return { w, side };
  });
  return { g, body, wings };
}
function buildBirds() {
  birds = [];
  const kind = L.seaY ? 'gull' : L.things.some(t => t.k === 'plaza') ? 'pigeon' : 'sparrow';
  const rng = makeRng(L.seed + 11);
  // A good spot is away from anything solid (or wet), and away from the nap tree.
  const clear = (x, y) => !L.solids.some(s => s.shape === 'circle' ? Math.hypot(x - s.x, y - s.y) < s.r + 40
      : x > s.x - 40 && x < s.x + s.w + 40 && y > s.y - 40 && y < s.y + s.h + 40)
    && Math.hypot(x - L.napTreeObj.x, y - L.napTreeObj.y) > 400;
  for (let flock = 0; flock < 6; flock++) {
    let x = 0, y = 0, tries = 0;
    do { x = 200 + rng() * (L.w - 400); y = 200 + rng() * ((L.seaY || L.h) - 400); } while (!clear(x, y) && ++tries < 60);
    if (tries >= 60) continue;
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const b = buildBird(kind), hx = x + (rng() - 0.5) * 60, hy = y + (rng() - 0.5) * 60;
      levelGroup.add(b.g);
      birds.push(Object.assign(b, { kind, hx, hy, x: hx, y: hy, up: 0, vx: 0, vy: 0, vu: 0, face: rng() * TAU, state: 'ground', t: rng() * 10, timer: 0 }));
    }
  }
}
let flutterCD = 0;
function updateBirds(dt) {
  flutterCD -= dt;
  const chasing = phase === 'play' || phase === 'won';
  for (const b of birds) {
    b.t += dt;
    if (b.state === 'ground') {
      // Scared off by the bike, or by a monkey running past.
      const scared = chasing && (Math.hypot(P.x - b.x, P.y - b.y) < 170 ||
        monkeys.some(m => m.state !== 'tree' && Math.hypot(m.vx, m.vy) > 120 && Math.hypot(m.x - b.x, m.y - b.y) < 90));
      if (scared) {
        const a = Math.atan2(b.y - P.y, b.x - P.x) + rnd(-0.6, 0.6), s = rnd(200, 260);
        Object.assign(b, { state: 'fly', vx: Math.cos(a) * s, vy: Math.sin(a) * s, vu: rnd(120, 200), t: 0 });
        if (flutterCD <= 0) { sfx.flutter(); if (b.kind === 'gull') sfx.gull(0.6); else sfx.chirp(0.8); flutterCD = 0.4; }
      } else {
        // Peck, peck: dip the head now and then, and hop round to face a new way.
        b.body.rotation.z = -Math.max(0, Math.sin(b.t * 3 + b.hx)) * 0.5;
        if (Math.random() < dt * 0.3) b.face += rnd(-1.5, 1.5);
      }
    } else if (b.state === 'fly') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.up += b.vu * dt; b.vu = lerp(b.vu, 70, dt);
      b.face = Math.atan2(b.vy, b.vx); b.body.rotation.z = 0.2;
      if (b.up > 520 || b.t > 4) { b.state = 'away'; b.g.visible = false; b.timer = rnd(10, 18); }
    } else if (b.state === 'away') {
      b.timer -= dt;
      if (b.timer <= 0 && Math.hypot(P.x - b.hx, P.y - b.hy) > 450) {
        // Come back in from a random direction, high up, and glide down home.
        const a = Math.random() * TAU;
        Object.assign(b, { state: 'return', x: b.hx + Math.cos(a) * 600, y: b.hy + Math.sin(a) * 600, up: 320, t: 0 });
        b.g.visible = true;
      }
    } else if (b.state === 'return') {
      const dx = b.hx - b.x, dy = b.hy - b.y, d = Math.hypot(dx, dy), step = 180 * dt;
      if (d < step) Object.assign(b, { state: 'ground', x: b.hx, y: b.hy, up: 0 });
      else { b.x += dx / d * step; b.y += dy / d * step; b.up = 320 * (d / 600); b.face = Math.atan2(dy, dx); b.body.rotation.z = -0.1; }
    }
    // Wings flap hard when flying, glide when coming home, and fold on the ground.
    const flap = b.state === 'fly' ? Math.sin(b.t * 28) * 0.9 : b.state === 'return' ? 0.2 + Math.sin(b.t * 8) * 0.25 : -0.15;
    for (const w of b.wings) w.w.rotation.x = w.side * flap;
    b.g.position.set(b.x, b.up, b.y);
    b.g.rotation.y = -b.face;
  }
}

// ---------- Building and clearing a whole place ----------
let levelGroup = new THREE.Group();
scene.add(levelGroup);

function buildLevelScene() {
  // Throw away the last place's models so their memory is freed.
  scene.remove(levelGroup);
  // Shared materials (the colour cache and the shadow) are kept, because every place reuses them.
  const shared = new Set(Object.values(matCache)); shared.add(shadowMat);
  levelGroup.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !shared.has(o.material)) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  levelGroup = new THREE.Group(); scene.add(levelGroup);
  fadeables = []; animated = []; flutters = []; monkeyMeshes.clear(); flyMeshes.clear(); clearFx();

  // Ground inside the world, plain grass beyond it, and open sea south of a harbor.
  const outer = mesh(new THREE.PlaneGeometry(12000, 12000), '#7f9550', L.w / 2, -1, L.h / 2); outer.rotation.x = -Math.PI / 2; levelGroup.add(outer);
  if (L.seaY) {
    const sea = mesh(new THREE.PlaneGeometry(12000, 6000), '#6a9db6', L.w / 2, -0.5, L.h + 3000 - 400); sea.rotation.x = -Math.PI / 2; levelGroup.add(sea);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), new THREE.MeshLambertMaterial({ map: paintGround() }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(L.w / 2, 0, L.h / 2); levelGroup.add(ground);

  // Hedge round the edge (not along the sea).
  const hedge = '#56713a', sideLen = L.seaY || L.h;
  levelGroup.add(mesh(new THREE.BoxGeometry(L.w + 60, 46, 30), hedge, L.w / 2, 23, -15));
  if (!L.seaY) levelGroup.add(mesh(new THREE.BoxGeometry(L.w + 60, 46, 30), hedge, L.w / 2, 23, L.h + 15));
  levelGroup.add(mesh(new THREE.BoxGeometry(30, 46, sideLen), hedge, -15, 23, sideLen / 2), mesh(new THREE.BoxGeometry(30, 46, sideLen), hedge, L.w + 15, 23, sideLen / 2));

  // Distant hills, so the world doesn't stop at a flat line.
  const rng = makeRng(L.seed + 5);
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * TAU, R = 2400 + rng() * 400, r = 300 + rng() * 300;
    const hx = L.w / 2 + Math.cos(a) * R, hz = L.h / 2 + Math.sin(a) * R;
    if (L.seaY && hz > L.h) continue;   // no hills out at sea
    const h = mesh(new THREE.SphereGeometry(r, 10, 6, 0, TAU, 0, Math.PI / 2), rng() < 0.5 ? '#8da35a' : '#7f9550', hx, -20, hz);
    h.scale.y = 0.45; levelGroup.add(h);
  }

  for (const t of L.things) {
    const fn = BUILD[t.k];
    if (fn) { const o = fn(t); if (o) levelGroup.add(o); }
  }
  buildBirds();
  camState.ready = false;
  camState.heading = P.heading;
}

// ---------- Caps, the peddler, the monkeys ----------
const checkTex = canvasTex(64, 64, g => {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f2ede0' : '#2e2a28'; g.fillRect(i * 8, j * 8, 8, 8); }
});
checkTex.wrapS = checkTex.wrapT = THREE.RepeatWrapping; checkTex.repeat.set(2, 1);
function buildCap(color, checked) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(13, 13, 2.5, 16), checked ? '#d8d2c2' : darker(color), 2, 1, 0));
  g.add(mesh(new THREE.SphereGeometry(10, 14, 8, 0, TAU, 0, Math.PI / 2), checked ? new THREE.MeshLambertMaterial({ map: checkTex }) : mat(color), 0, 2, 0));
  g.add(mesh(new THREE.SphereGeometry(2, 6, 4), checked ? '#2e2a28' : darker(color, 0.6), 0, 12, 0));
  return g;
}

// A unit-length stick that can be re-aimed every frame (for legs that move).
const Y_AXIS = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function limb(r, color) { return mesh(new THREE.CylinderGeometry(r, r, 1, 6), color); }
function aimLimb(m, ax, ay, az, bx, by, bz) {
  _a.set(ax, ay, az); _b.set(bx - ax, by - ay, bz - az);
  const len = _b.length();
  m.position.set(ax + _b.x / 2, ay + _b.y / 2, az + _b.z / 2);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(Y_AXIS, _b.normalize());
}

// The peddler lives for the whole game; only his position and caps change.
// The bike faces +x in its own little world: front wheel at x = 22, back wheel at x = -22.
const peddler = (() => {
  const root = new THREE.Group();                    // moves around the map, turns with the handlebars
  const bike = new THREE.Group(); root.add(bike);     // leans into turns and spins in tricks
  const R = '#b8432f', TIRE = '#2b2522', COAT = '#4b4a55', SKIN = '#f0c9a0', PANTS = '#5a4a3a';
  const wheels = [];
  for (const x of [-22, 22]) {
    const wheel = mesh(new THREE.TorusGeometry(12, 2.6, 6, 18), TIRE, x, 13, 0);
    // Two crossed spokes, so you can see the wheel turning.
    const s1 = mesh(new THREE.CylinderGeometry(1, 1, 22, 4), '#999'), s2 = mesh(new THREE.CylinderGeometry(1, 1, 22, 4), '#999');
    s2.rotation.z = Math.PI / 2; wheel.add(s1, s2);
    bike.add(wheel); wheels.push(wheel);
  }
  bike.add(rod([-22, 13, 0], [-4, 32, 0], 2, R), rod([-4, 32, 0], [18, 34, 0], 2, R), rod([18, 34, 0], [22, 13, 0], 2, R), rod([-22, 13, 0], [0, 14, 0], 2, R), rod([0, 14, 0], [-4, 32, 0], 2, R));
  bike.add(rod([18, 34, 0], [18, 44, 0], 1.8, INK), rod([18, 44, -12], [18, 44, 12], 1.8, INK));
  bike.add(mesh(new THREE.BoxGeometry(12, 3, 8), INK, -5, 34, 0));
  bike.add(mesh(new THREE.CylinderGeometry(4, 4, 3, 10), '#777', 0, 14, 0).rotateX(Math.PI / 2));   // the chainring
  // Legs: thigh + shin on each side, re-aimed every frame so the feet go round with the pedals.
  const legs = [-1, 1].map(side => {
    const thigh = limb(3.2, PANTS), shin = limb(2.8, PANTS), shoe = mesh(new THREE.BoxGeometry(7, 3, 4), INK);
    bike.add(thigh, shin, shoe);
    return { side, thigh, shin, shoe };
  });
  const torso = mesh(new THREE.CylinderGeometry(9, 11, 28, 8), COAT, -3, 50, 0); torso.rotation.z = -0.25; bike.add(torso);
  const armsHold = new THREE.Group(); armsHold.add(rod([0, 60, -9], [18, 45, -11], 2.8, COAT), rod([0, 60, 9], [18, 45, 11], 2.8, COAT));
  // No-hands arms: each one hangs from a shoulder "pivot" group so it can flap up and down.
  const armsOut = new THREE.Group(), shoulders = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0, 60, 9 * side);
    sh.add(rod([0, 0, 0], [-2, 6, 23 * side], 2.8, COAT), mesh(new THREE.SphereGeometry(3.5, 6, 4), SKIN, -2, 6, 24 * side));
    armsOut.add(sh); shoulders.push({ sh, side });
  }
  armsOut.visible = false;
  bike.add(armsHold, armsOut);
  const head = new THREE.Group(); head.position.set(1, 74, 0); bike.add(head);
  head.add(mesh(new THREE.SphereGeometry(10, 12, 10), SKIN));
  head.add(mesh(new THREE.BoxGeometry(3, 3, 12), INK, 9, -3, 0));   // mustache
  head.add(mesh(new THREE.SphereGeometry(1.6, 6, 4), INK, 8.5, 2.5, -3.5), mesh(new THREE.SphereGeometry(1.6, 6, 4), INK, 8.5, 2.5, 3.5));
  // The cap stack: his own checked cap, then ten more waiting to be won back.
  const stack = new THREE.Group(); stack.position.set(0, 8, 0); head.add(stack);
  stack.add(buildCap('#f2ede0', true));
  const caps = [];
  for (let i = 1; i <= CAPS_PER_LEVEL; i++) { const c = buildCap(CAP_COLORS[(i - 1) % 4]); c.position.y = i * 7; c.visible = false; stack.add(c); caps.push(c); }
  const shadow = blobShadow(26);
  scene.add(root, shadow);
  return { root, bike, wheels, legs, armsHold, armsOut, shoulders, head, caps, shadow, crank: 0 };
})();

// Where the knee goes, given the hip and the foot. Both leg bones are the same length,
// so the knee sits on the line halfway between, pushed forward (toward +x) by just
// enough to keep each bone its full length. (This is "inverse kinematics", in miniature.)
const BONE = 14.5;
function kneeFor(hx, hy, fx, fy) {
  const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), BONE * 2 - 0.01);
  const a = Math.atan2(dy, dx) + Math.acos(d / (2 * BONE));
  return [hx + Math.cos(a) * BONE, hy + Math.sin(a) * BONE];
}

// The cap stack is a wobbly spring. Two angles (side to side, and front to back)
// get pulled toward where turning and speeding up push them, but overshoot and
// bounce back, so the stack keeps swaying a little after every move.
const stackSpring = { side: 0, sideV: 0, fwd: 0, fwdV: 0, squash: 0, prevSpeed: 0, prevAir: false };
function updateStack(dt) {
  const S = stackSpring;
  if (dt <= 0) return;
  const accel = (P.speed - S.prevSpeed) / dt; S.prevSpeed = P.speed;
  if (S.prevAir && !P.air) { S.fwdV += 2.4; S.squash = 1; }   // thump on landing
  if (!S.prevAir && P.air) S.fwdV -= 1.2;                     // and a jolt on take-off
  S.prevAir = P.air;
  // A taller stack is floppier, like a tall pole: it leans further, and sways slower and longer.
  // "tall" goes from 0 (no caps yet) to 1 (all ten).
  const tall = clamp(P.stackShown / CAPS_PER_LEVEL, 0, 1);
  // Even standing still, the stack sways gently, like it's never quite balanced.
  const idle = lerp(0.7, 1.6, tall);
  const idleSide = Math.sin(clock * 1.9) * 0.05 * idle, idleFwd = Math.sin(clock * 1.3 + 1) * 0.04 * idle;
  const sideTarget = P.sway * 0.16 + idleSide;
  const fwdTarget = clamp(-accel / ACCEL * 0.18, -0.25, 0.25) + idleFwd;
  const K = lerp(40, 22, tall), DAMP = lerp(3.2, 2.4, tall);   // stiffness and how quickly the wobble dies down
  S.sideV += (-(S.side - sideTarget) * K - S.sideV * DAMP) * dt; S.side += S.sideV * dt;
  S.fwdV += (-(S.fwd - fwdTarget) * K - S.fwdV * DAMP) * dt; S.fwd += S.fwdV * dt;
  S.squash = Math.max(0, S.squash - dt * 4);
  // Bend the stack: each cap tilts a little more than the one below it, and sits on top of it.
  // "bend" makes the lean grow with the stack: a short stack barely tips, a full one really leans.
  const bend = lerp(0.6, 1.5, tall), lim = 0.38 * bend;
  const side = clamp(S.side * bend, -lim, lim), fwd = clamp(S.fwd * bend, -lim, lim), gap = 7 - 1.6 * S.squash;
  let x = 0, y = 0, z = 0;
  peddler.caps.forEach((c, i) => {
    const k = (i + 1) / CAPS_PER_LEVEL, as = side * k, af = fwd * k;
    x += Math.sin(af) * gap; z += Math.sin(as) * gap; y += Math.cos(as) * Math.cos(af) * gap;
    c.position.set(x, y, z);
    c.rotation.set(as, 0, -af);
    c.visible = i < P.stackShown;
  });
}

function buildMonkey(capColor) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const B = '#8b5e3c', T = '#e2c299';
  const torso = mesh(new THREE.SphereGeometry(11, 10, 8), B, 0, 17, 0); torso.scale.set(1, 1.15, 0.9); body.add(torso);
  body.add(mesh(new THREE.SphereGeometry(7, 8, 6), T, 5, 16, 0));
  body.add(mesh(new THREE.SphereGeometry(9.5, 10, 8), B, 2, 33, 0));
  const face = mesh(new THREE.SphereGeometry(6.5, 8, 6), T, 7, 31, 0); face.scale.set(0.8, 0.85, 1.1); body.add(face);
  body.add(mesh(new THREE.SphereGeometry(3.8, 6, 4), B, 1, 35, -10), mesh(new THREE.SphereGeometry(3.8, 6, 4), B, 1, 35, 10));
  body.add(mesh(new THREE.SphereGeometry(1.5, 6, 4), INK, 11, 34, -3), mesh(new THREE.SphereGeometry(1.5, 6, 4), INK, 11, 34, 3));
  const legL = mesh(new THREE.SphereGeometry(4, 6, 4), B, 0, 4, -5), legR = mesh(new THREE.SphereGeometry(4, 6, 4), B, 0, 4, 5);
  body.add(legL, legR);
  const armR = new THREE.Group(); armR.position.set(2, 24, 9); armR.add(rod([0, 0, 0], [8, -12, 3], 2.4, B)); body.add(armR);
  const armL = new THREE.Group(); armL.position.set(2, 24, -9); armL.add(rod([0, 0, 0], [8, -12, -3], 2.4, B)); body.add(armL);
  // Little stars that circle its head when it's dizzy (tired out, or frozen by the bell).
  const stars = new THREE.Group(); stars.position.set(2, 50, 0);
  for (let i = 0; i < 3; i++) { const st = mesh(new THREE.OctahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: '#ffd84a' })); st.position.set(Math.cos(i / 3 * TAU) * 11, 0, Math.sin(i / 3 * TAU) * 11); stars.add(st); }
  stars.visible = false; body.add(stars);
  const tail = mesh(new THREE.TorusGeometry(8, 2, 5, 12, Math.PI * 1.4), B, -12, 22, 0); body.add(tail);
  const cap = buildCap(capColor); cap.position.set(2, 40, 0); cap.scale.setScalar(0.85); body.add(cap);
  const shadow = blobShadow(16);
  levelGroup.add(g, shadow);
  return { g, body, cap, legL, legR, armL, armR, tail, stars, shadow, lean: 0 };
}

// Models for the monkeys and flying caps are made the first time they're needed.
const monkeyMeshes = new Map(), flyMeshes = new Map();
Hooks.levelStart = buildLevelScene;
Hooks.monkeyGone = m => { const mm = monkeyMeshes.get(m); if (mm) { levelGroup.remove(mm.g, mm.shadow); monkeyMeshes.delete(m); } };
Hooks.capLanded = f => {
  const fm = flyMeshes.get(f); if (fm) { levelGroup.remove(fm); flyMeshes.delete(f); }
  // Sparkles where the cap lands, and a little nudge that sets the stack wobbling.
  const top = peddler.caps[clamp(P.stackShown - 1, 0, CAPS_PER_LEVEL - 1)].getWorldPosition(new THREE.Vector3());
  burst.sparkle(top.x, top.y, top.z, 12);
  stackSpring.fwdV += 0.8; stackSpring.sideV += (Math.random() - 0.5) * 1.2;
};
Hooks.splash = (x, y) => burst.splash(x, y);
Hooks.trickLanded = pts => {
  burst.confetti(P.x, 70, P.y, pts >= 250 ? 60 : 32, pts >= 250 ? 1.2 : 1);
  if (pts >= 250) burst.sparkle(P.x, 90, P.y, 16);
};

// ---------- Every frame: copy positions onto the models, move the camera ----------
const camState = { x: 0, y: 300, z: 0, lx: 0, ly: 0, lz: 0, heading: Math.PI / 2, ready: false };
let dustAcc = 0, lastAir = false, lastFromRamp = false, lastPhase = '';
function syncScene(dt) {
  // Peddler.
  const pd = peddler, riding = phase === 'play' || phase === 'won';
  let hopUp = 0;
  if (phase === 'wake' && wakeT > 0.7 && wakeT < 1.15) hopUp = Math.sin((wakeT - 0.7) / 0.45 * Math.PI) * 14;   // a startled jump: "My caps!"
  pd.root.position.set(P.x, P.z + hopUp, P.y);
  pd.root.rotation.y = -P.heading;
  pd.bike.rotation.set(P.lean, -P.spinAngle, 0);
  // Wheels roll with the bike's speed (distance / wheel radius = how far round they turn).
  for (const w of pd.wheels) w.rotation.z -= P.speed * dt / 12;
  // Pedals only go round while you hold "pedal" (otherwise the bike coasts, like a real one).
  const pedaling = riding && !P.air && controlDelay <= 0 && (keys.ArrowUp || keys.KeyW);
  if (pedaling) pd.crank -= Math.max(90, P.speed) * dt / 16;
  for (const leg of pd.legs) {
    const a = pd.crank + (leg.side > 0 ? Math.PI : 0), z = 5.5 * leg.side;
    const fx = Math.cos(a) * 6, fy = 14 + Math.sin(a) * 6;
    const [kx, ky] = kneeFor(-4, 36, fx, fy);
    aimLimb(leg.thigh, -4, 36, z, kx, ky, z);
    aimLimb(leg.shin, kx, ky, z, fx, fy, z);
    leg.shoe.position.set(fx + 1.5, fy - 1, z);
  }
  const noHands = P.air && P.fromRamp && keys.KeyX;
  pd.armsHold.visible = !noHands; pd.armsOut.visible = noHands;
  for (const s of pd.shoulders) s.sh.rotation.x = s.side * Math.sin(clock * 13) * 0.4;   // flap, flap: "Look, no hands!"
  pd.head.rotation.z = P.asleep ? -0.35 + Math.sin(clock * 1.2) * 0.05 : 0;
  updateStack(dt);
  const sk = 1 / (1 + P.z / 300);
  pd.shadow.position.set(P.x, 0.7, P.y); pd.shadow.scale.set(60 * sk, 60 * sk, 1);

  // Dust behind the back wheel: lots on sand and paths, a little on grass, a cloud when skidding.
  const backX = P.x - Math.cos(P.heading) * 22, backY = P.y - Math.sin(P.heading) * 22;
  if (riding && !P.air && Math.abs(P.speed) > 140) {
    const dusty = onSurface(backX, backY);
    dustAcc += dt * (dusty ? 16 : 5) * (Math.abs(P.speed) / MAX_SPEED) * (Ambience.skidding ? 4 : 1);
    while (dustAcc > 1) { dustAcc--; burst.dust(backX, backY, 1, dusty ? '#d8c49a' : '#c9cf9a'); }
  }
  if (lastAir && !P.air) burst.dust(P.x, P.y, P.fromRamp || lastFromRamp ? 10 : 4, '#d8c49a', 2.2);   // a puff on landing
  lastAir = P.air; lastFromRamp = P.fromRamp;
  if (phase === 'won' && lastPhase !== 'won') { burst.confetti(P.x, 120, P.y, 90, 1.4); burst.sparkle(P.x, 110, P.y, 24); }
  lastPhase = phase;

  // Monkeys.
  for (const m of monkeys) {
    let mm = monkeyMeshes.get(m);
    if (!mm) { mm = buildMonkey(m.cap); monkeyMeshes.set(m, mm); }
    const sp = Math.hypot(m.vx, m.vy), moving = sp > 30;
    const dizzy = m.dazed > 0 || (m.tired > 0 && m.fleeing);
    const running = m.state === 'scatter' || (m.fleeing && !dizzy);
    const sulking = m.state === 'sulk';
    const taunting = m.hasCap && bubbles.some(b => b.m === m);
    const stride = sulking ? 7 : running ? 18 : 12;   // how fast the legs go round
    const bob = m.state === 'tree' ? Math.sin(m.t * 3) * 1.5 : moving ? Math.abs(Math.sin(m.t * stride)) * (sulking ? 1.5 : 3.5) : 0;
    mm.g.position.set(m.x, m.z + bob, m.y);
    // Up in the tree they face the camera, to show off their caps.
    mm.g.rotation.y = m.state === 'tree' ? -Math.atan2(camera.position.z - m.y, camera.position.x - m.x) : -m.face;
    const swing = moving ? Math.sin(m.t * stride) * (running ? 6 : 4) : 0;
    mm.legL.position.x = swing; mm.legR.position.x = -swing;
    mm.tail.rotation.z = Math.sin(m.t * (taunting ? 14 : 6)) * (taunting ? 0.5 : 0.3);
    // Lean forward when running flat out, slump forward when sulking off with no cap.
    mm.lean = lerp(mm.lean, running ? -0.35 : sulking ? -0.45 : 0, Math.min(1, dt * 8));
    mm.body.rotation.z = mm.lean;
    // Dizzy: wobble round in circles. Frozen by the bell: a quick shiver.
    mm.body.rotation.x = m.dazed > 0 ? Math.sin(clock * 12) * 0.15 : dizzy ? Math.sin(clock * 6) * 0.22 : 0;
    mm.stars.visible = dizzy;
    if (dizzy) mm.stars.rotation.y = clock * 5;
    // Arms: both wave over its head when it's teasing you, pump when it runs, droop when it sulks.
    if (taunting) { mm.armR.rotation.z = 1.7 + Math.sin(clock * 14) * 0.45; mm.armL.rotation.z = 1.7 + Math.sin(clock * 14 + Math.PI) * 0.45; }
    else if (running) { mm.armR.rotation.z = Math.sin(m.t * stride) * 0.8; mm.armL.rotation.z = -Math.sin(m.t * stride) * 0.8; }
    else if (sulking) { mm.armR.rotation.z = mm.armL.rotation.z = -0.5; }
    else if (m.state === 'tree') { mm.armR.rotation.z = 0.6 + Math.sin(m.t * 2 + m.seed) * 0.5; mm.armL.rotation.z = 0.3; }
    else { mm.armR.rotation.z = mm.armL.rotation.z = Math.sin(m.t * 3) * 0.2; }
    mm.cap.visible = m.hasCap;
    mm.g.scale.setScalar(sulking ? Math.max(0.01, Math.min(1, m.alpha * 2.5)) : 1);   // shrinks away only at the very end
    mm.shadow.visible = m.state !== 'tree';
    mm.shadow.position.set(m.x, 0.6, m.y);
  }

  // Caps flying from a monkey to the top of the stack, spinning as they go, with a sparkly trail.
  for (const f of flyingCaps) {
    let fm = flyMeshes.get(f);
    if (!fm) { fm = buildCap(f.color); levelGroup.add(fm); flyMeshes.set(f, fm); burst.sparkle(f.sx, f.sh, f.sy, 10); }
    const k = clamp(f.t, 0, 1), topY = P.z + 82 + (P.stackShown + 1) * 7;
    fm.position.set(lerp(f.sx, P.x, k), lerp(f.sh, topY, k) + Math.sin(k * Math.PI) * 80, lerp(f.sy, P.y, k));
    fm.rotation.y += dt * 10;
    spawnFx(fm.position.x, fm.position.y, fm.position.z, { tex: 'star', glow: true, color: '#ffe27a', size: 10, size1: 1, life: 0.45, vu: -10, spin: 4 });
  }
  for (const a of animated) a(dt);
  updateFlutters();
  updateBirds(dt);
  updateFx(dt);

  // Camera. Before the chase: a slow look around the nap tree. During: riding behind the bike.
  const t = L.napTreeObj;
  let tx, ty, tz, lx, ly, lz;
  if (phase === 'story' || phase === 'wake' || phase === 'title') {
    const a = Math.PI / 2 + Math.sin(clock * 0.15) * 0.35;
    tx = t.x + Math.cos(a) * 560; tz = t.y + Math.sin(a) * 560; ty = 260;
    // While the story card is up, aim a little below the ground so the monkeys sit near the
    // top of the screen and the sleeping peddler sits just above the card.
    lx = t.x; ly = phase === 'wake' ? 60 : -60; lz = t.y;
  } else {
    // The camera turns after the bike a little lazily, which feels calmer than snapping round.
    camState.heading += angleDiff(camState.heading, P.heading) * Math.min(1, dt * 3);
    const h = camState.heading, D = 270;
    tx = P.x - Math.cos(h) * D; tz = P.y - Math.sin(h) * D; ty = 165 + P.z * 0.5;
    lx = P.x + Math.cos(h) * 220; ly = 20 + P.z * 0.6; lz = P.y + Math.sin(h) * 220;
  }
  const k = camState.ready ? Math.min(1, dt * 4) : 1;
  camState.ready = true;
  camState.x = lerp(camState.x, tx, k); camState.y = lerp(camState.y, ty, k); camState.z = lerp(camState.z, tz, k);
  camState.lx = lerp(camState.lx, lx, k); camState.ly = lerp(camState.ly, ly, k); camState.lz = lerp(camState.lz, lz, k);
  camera.position.set(camState.x, camState.y, camState.z);
  camera.lookAt(camState.lx, camState.ly, camState.lz);

  // Anything standing between the camera and what it's looking at fades to see-through:
  // the bike during the chase, the nap tree before it.
  const chasing = phase === 'play' || phase === 'won' || phase === 'paused';
  const aimX = chasing ? P.x : t.x, aimY = chasing ? P.y : t.y;
  const cx = camera.position.x, cz = camera.position.z, sx = aimX - cx, sz = aimY - cz, sl2 = sx * sx + sz * sz || 1;
  for (const f of fadeables) {
    let fade = false;
    if (chasing || !(f.x === t.x && f.y === t.y)) {   // never fade the nap tree in its own opening shot
      const u = clamp(((f.x - cx) * sx + (f.y - cz) * sz) / sl2, 0, 1);
      fade = u < 0.97 && Math.hypot(cx + sx * u - f.x, cz + sz * u - f.y) < f.r + 12;
    }
    const target = fade ? 0.18 : 1;
    if (Math.abs(f.mats[0].opacity - target) > 0.01) for (const m of f.mats) m.opacity = lerp(m.opacity, target, Math.min(1, dt * 8));
  }
}
