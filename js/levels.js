'use strict';
/* =====================================================================
   levels.js - THE PLACES
   Each place is plain data: a size, some tuning numbers, a story, and a
   list of "things". A thing is an object with a kind (k) and a position.
   rules.js works out what's solid, what's water and what's a ramp from
   this one list, and world3d.js builds a 3D model of each thing.
   To add a tree, add one line. To add a place, add one object.
   ===================================================================== */

const tree = (x, y, s = 1) => ({ k: 'tree', x, y, s });
const bigTree = (x, y) => ({ k: 'tree', x, y, s: 2.1, big: true });   // the nap tree
const house = (x, y, w, h, roof) => ({ k: 'house', x, y, w, h, roof });
const ramp = (x, y, a, sand) => ({ k: 'ramp', x, y, a, sand });
const UP = -Math.PI / 2, DOWN = Math.PI / 2, LEFT = Math.PI, RIGHT = 0;

// Tuning, per place:
//   monkeySpeed  how fast a running monkey goes (the bike's top speed is 320)
//   fleeR        how close you get before a monkey starts running
//   energy       seconds a monkey can run before it gets tired (your chance!)
//   dodge        chance of a sudden sidestep when you're right on top of it
const LEVELS = [
  {
    name: 'The Village Green', short: 'Village Green', landmark: 'Windmill, well and duck pond',
    w: 2600, h: 1900, seed: 11, grass: '#a9b86b', grass2: '#9aab5e',
    monkeySpeed: 165, fleeR: 210, energy: 2.4, dodge: 0.1,
    storyTitle: 'A nap under the big old tree',
    story: 'Every day the peddler walked through the village with his caps stacked high on his head. One warm afternoon he sat down under the big old tree on the village green and fell fast asleep. When he woke up, his head felt very light...',
    things: [
      { k: 'meadow', x: 1300, y: 920, r: 250 },
      { k: 'path', w: 80, pts: [[60, 950], [2540, 950]] },
      { k: 'path', w: 80, pts: [[1300, 60], [1300, 1840]] },
      { k: 'path', w: 62, pts: [[500, 400], [1300, 300], [2100, 400], [2300, 950], [2100, 1500], [1300, 1600], [500, 1500], [300, 950], [500, 400]] },
      { k: 'pond', x: 1830, y: 1330, r: 130 }, { k: 'pond', x: 600, y: 1250, r: 90 },
      ramp(1610, 1330, RIGHT), ramp(600, 1070, DOWN), ramp(1300, 560, UP), ramp(1900, 950, RIGHT), ramp(780, 950, LEFT),
      { k: 'windmill', x: 2150, y: 560 }, { k: 'well', x: 720, y: 640 },
      house(360, 560, 150, 110, '#b5523b'), house(860, 1150, 150, 110, '#5e7a9c'), house(1500, 560, 160, 110, '#c58b3a'),
      house(2250, 1200, 150, 110, '#b5523b'), house(1900, 1650, 150, 100, '#7a6a9a'), house(380, 1620, 150, 100, '#c58b3a'),
      house(2300, 230, 140, 100, '#5e7a9c'),
      { k: 'log', x: 2190, y: 915, w: 22, h: 70 }, { k: 'log', x: 1265, y: 1290, w: 70, h: 22 }, { k: 'log', x: 905, y: 1555, w: 22, h: 70 },
      { k: 'hay', x: 1990, y: 430 }, { k: 'hay', x: 2040, y: 470 }, { k: 'hay', x: 2300, y: 700 },
      tree(200, 200), tree(260, 330, 1.2), tree(640, 220), tree(900, 180, 1.1), tree(1000, 430), tree(1650, 200, 1.2),
      tree(1900, 250), tree(2450, 600, 1.1), tree(2450, 800), tree(2000, 780), tree(1650, 780, 1.2), tree(950, 740),
      tree(620, 870), tree(180, 1250, 1.2), tree(250, 1780), tree(700, 1770, 1.1), tree(1000, 1450), tree(1100, 1770),
      tree(1500, 1250, 1.1), tree(1480, 1770), tree(2200, 1780, 1.2), tree(2480, 1550), tree(2500, 1350), tree(1560, 1100),
      tree(1080, 620), tree(800, 420, 1.2), tree(2480, 120), tree(120, 620),
      bigTree(1300, 880)
    ]
  },
  {
    name: 'Market Town', short: 'Market Town', landmark: 'Clock tower, fountain and canal',
    w: 2800, h: 2000, seed: 22, grass: '#a6b46a', grass2: '#97a75c',
    monkeySpeed: 180, fleeR: 220, energy: 2.7, dodge: 0.15,
    storyTitle: 'Shade by the fountain',
    story: 'With all ten caps back on his head, the peddler pedaled into Market Town. The square was busy and the fountain splashed. The sun got warm, and the shady tree by the fountain looked just right for a little nap...',
    things: [
      { k: 'plaza', x: 900, y: 540, w: 1000, h: 820 },
      { k: 'plaza', x: 0, y: 880, w: 2800, h: 140 },
      { k: 'plaza', x: 1330, y: 0, w: 140, h: 1580 },
      { k: 'plaza', x: 1330, y: 1680, w: 140, h: 320 },
      { k: 'water', x: 0, y: 1580, w: 600, h: 100, canal: true }, { k: 'water', x: 720, y: 1580, w: 610, h: 100, canal: true },
      { k: 'water', x: 1470, y: 1580, w: 730, h: 100, canal: true }, { k: 'water', x: 2320, y: 1580, w: 480, h: 100, canal: true },
      { k: 'bridge', x: 600, y: 1570, w: 120, h: 120 }, { k: 'bridge', x: 1330, y: 1570, w: 140, h: 120 }, { k: 'bridge', x: 2200, y: 1570, w: 120, h: 120 },
      ramp(1000, 1490, DOWN), ramp(1900, 1780, UP), ramp(1400, 560, DOWN), ramp(2050, 950, RIGHT), ramp(760, 950, LEFT), ramp(2500, 1490, DOWN),
      { k: 'fountain', x: 1400, y: 760, r: 80 },
      { k: 'clock', x: 560, y: 300, w: 130, h: 120 },
      { k: 'stall', x: 1000, y: 620, w: 130, h: 80, c: '#b8432f' }, { k: 'stall', x: 1000, y: 760, w: 130, h: 80, c: '#3d6a9e' },
      { k: 'stall', x: 1690, y: 620, w: 130, h: 80, c: '#d39b2a' }, { k: 'stall', x: 1690, y: 760, w: 130, h: 80, c: '#4f7d4a' },
      { k: 'stall', x: 1000, y: 1180, w: 130, h: 80, c: '#3d6a9e' }, { k: 'stall', x: 1690, y: 1180, w: 130, h: 80, c: '#b8432f' },
      { k: 'crate', x: 1150, y: 640 }, { k: 'crate', x: 1640, y: 1210 }, { k: 'crate', x: 1150, y: 1200 }, { k: 'crate', x: 1640, y: 650 },
      { k: 'barrel', x: 1250, y: 1420 }, { k: 'barrel', x: 1560, y: 1420 }, { k: 'barrel', x: 860, y: 480 },
      house(200, 120, 160, 120, '#b5523b'), house(820, 100, 170, 120, '#5e7a9c'), house(1600, 100, 160, 120, '#c58b3a'),
      house(1900, 120, 170, 120, '#b5523b'), house(2300, 150, 160, 120, '#7a6a9a'),
      house(150, 1760, 160, 120, '#5e7a9c'), house(1150, 1770, 150, 110, '#c58b3a'), house(1650, 1770, 160, 110, '#b5523b'), house(2450, 1760, 160, 120, '#7a6a9a'),
      house(2400, 500, 160, 120, '#c58b3a'), house(2450, 1150, 150, 120, '#5e7a9c'), house(150, 500, 150, 120, '#b5523b'), house(200, 1150, 150, 120, '#c58b3a'),
      tree(700, 700), tree(2100, 700, 1.1), tree(700, 1300, 1.1), tree(2100, 1300), tree(2620, 820), tree(90, 800),
      tree(2250, 1450, 1.2), tree(500, 1450), tree(1200, 1470), tree(1750, 1460, 1.1), tree(420, 1920), tree(2000, 1930, 1.2),
      tree(1100, 300), tree(2650, 330), tree(2100, 420, 1.2),
      bigTree(1400, 1120)
    ]
  },
  {
    name: 'Harbor Point', short: 'Harbor Point', landmark: 'Lighthouse, pier and fishing boats',
    w: 2800, h: 2000, seed: 33, grass: '#a3b56f', grass2: '#94a862',
    seaY: 1600,   // everything south of this line is open sea, so there's no hedge on that side
    monkeySpeed: 190, fleeR: 235, energy: 3.0, dodge: 0.25,
    storyTitle: 'Gulls and a sleepy oak',
    story: 'Next the peddler rode down to the harbor, where the boats bob and the lighthouse blinks all night. He leaned against an old oak to watch the gulls. His eyes got heavy. His head started to nod. Oh no. Not again...',
    things: [
      { k: 'sand', x: 0, y: 1400, w: 2800, h: 220 },
      { k: 'rocky', x: 2330, y: 1190, w: 470, h: 430 },
      { k: 'path', w: 60, pts: [[150, 1330], [2300, 1330]] },
      { k: 'path', w: 60, pts: [[700, 80], [700, 1330]] },
      { k: 'path', w: 60, pts: [[700, 520], [1850, 520]] },
      { k: 'water', x: 0, y: 1600, w: 1250, h: 400 }, { k: 'water', x: 1370, y: 1600, w: 1430, h: 400 }, { k: 'water', x: 1250, y: 1950, w: 120, h: 50 },
      { k: 'pier', x: 1250, y: 1580, w: 120, h: 370 },
      { k: 'water', x: 1900, y: 250, w: 100, h: 550, creek: true }, { k: 'water', x: 1900, y: 900, w: 100, h: 380, creek: true },
      { k: 'water', x: 1900, y: 1390, w: 100, h: 210, creek: true },
      { k: 'bridge', x: 1890, y: 790, w: 120, h: 120, vertical: true }, { k: 'bridge', x: 1890, y: 1275, w: 120, h: 120, vertical: true },
      ramp(1780, 1150, RIGHT), ramp(2120, 450, LEFT), ramp(500, 1500, RIGHT, true), ramp(1700, 1500, LEFT, true), ramp(1000, 1080, DOWN), ramp(2300, 950, LEFT),
      { k: 'lighthouse', x: 2560, y: 1380 },
      { k: 'boat', x: 600, y: 1790, c: '#b8432f' }, { k: 'boat', x: 1700, y: 1830, c: '#3d6a9e' }, { k: 'boat', x: 2150, y: 1760, c: '#d39b2a' }, { k: 'boat', x: 950, y: 1900, c: '#4f7d4a' },
      house(300, 300, 170, 120, '#3d6a9e'), house(560, 280, 120, 110, '#b8432f'), house(1300, 250, 170, 120, '#7a8c99'),
      house(1600, 320, 150, 110, '#b8432f'), house(2200, 250, 170, 120, '#3d6a9e'), house(2500, 700, 160, 120, '#7a8c99'),
      house(330, 1050, 160, 110, '#b8432f'), house(1420, 1050, 160, 110, '#3d6a9e'), house(2150, 1060, 150, 110, '#7a6a9a'),
      { k: 'crate', x: 520, y: 1220 }, { k: 'crate', x: 560, y: 1220 }, { k: 'crate', x: 1600, y: 1200 }, { k: 'crate', x: 2420, y: 900 },
      { k: 'barrel', x: 1220, y: 1520 }, { k: 'barrel', x: 1400, y: 1520 }, { k: 'barrel', x: 1250, y: 420 },
      { k: 'rock', x: 2100, y: 1490, r: 26 }, { k: 'rock', x: 820, y: 1470, r: 22 }, { k: 'rock', x: 2420, y: 1550, r: 30 }, { k: 'rock', x: 2700, y: 1250, r: 28 },
      tree(150, 150, 1.1), tree(1000, 150), tree(1150, 600), tree(400, 700, 1.2), tree(250, 880), tree(1600, 750, 1.1),
      tree(2150, 650), tree(2650, 150, 1.2), tree(2650, 450), tree(1250, 900), tree(900, 1150, 1.1), tree(2600, 1000),
      tree(1750, 900), tree(450, 520),
      bigTree(1000, 760)
    ]
  }
];
