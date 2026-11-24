# Cap Chase

A bicycle chase game for kids (ages 5-9), inspired by *Caps for Sale*. The peddler wakes from
his nap to find ten monkeys have taken his caps. Ride after them, bump each one to win its cap
back, and stack all ten on his head. Three places, each with its own landmarks and ramps.

## Play

**https://rskilpatrick1.github.io/cap-chase-3d/**

Works in any desktop browser with a keyboard. No login, nothing to install.

There are two versions. **The 3D one is the main game**; the kids picked it.

| Version | File | Status |
| --- | --- | --- |
| **Cap Chase 3D**: camera rides behind the bike | `index.html` | Main game. New work goes here. |
| The Great Cap Chase: top-down 2D | `classic.html` | Frozen. Still playable (link at the bottom-left of the 3D game), no new features. |

All art, characters and words in the game are original. Nothing is copied from the book.

## Controls (3D)

| Key | What it does |
| --- | --- |
| Up (or W) | Pedal |
| Left / Right (or A, D) | Steer |
| Down (or S) | Brake, then back up |
| Space | Hop (clears logs). In the air off a ramp, press again to spin |
| X (hold, in the air) | No-hands trick |
| B | Ring the bell: nearby monkeys freeze for about a second |
| P or Esc | Pause |
| M | Sound effects on/off |
| N | Music on/off |

The big arrow at the bottom points to the nearest monkey. If a canal or creek is in the way,
it points to the best bridge instead and says "Use the bridge!"

Ramps only work from the front: follow the yellow arrows painted on the ground. The back and sides
of a ramp are solid, so you bump off them instead of riding through.

## Places

1. **Village Green**: windmill, well, duck pond (jump it!)
2. **Market Town**: clock tower (shows the real time), fountain, market stalls, canal
3. **Harbor Point**: lighthouse, pier, fishing boats, a creek to jump

Finishing a place unlocks the next. Best scores are saved in the browser.

## Music and sounds

Everything you hear is made in code with the Web Audio API, so there are no sound files.

- **Music:** each place has its own original folk tune. The Village Green has a waltz on tin whistle,
  Market Town has an accordion polka, and Harbor Point has a sea shanty. The tune dips when the
  win fanfare plays. The Music button (or N) turns it off without silencing the effects.
- **Monkeys:** they chatter "ooh ooh ah ah" when they tease, squeal when they start running, pant
  when tired, and grumble when you take a cap.
- **Bike:** a soft chain tick that speeds up with you, a quiet tire hiss on hard turns, and wind rushing past in the air.
- **Places:** songbirds and a creaky windmill, a clock tower that chimes and a splashing fountain,
  gulls and waves at the harbor. Sounds get quieter with distance.
- **Cheers:** a jingle as each cap lands on the stack, a crowd cheer for big tricks, and a horn fanfare at the end.

## Animations

- The peddler's legs pedal (only while you hold Up, so he coasts like a real bike), the wheels
  roll, and his arms flap in a no-hands trick.
- The cap stack is a wobbly spring: it leans out on turns, rocks back when you speed up, bounces
  on landings and sways gently even when you stand still. The taller it grows, the floppier it gets,
  like a tall pole: a few caps barely tip, a full stack of ten really leans and sways.
- Monkeys wave both arms when they tease, pump their arms when they run, see stars when they're
  tired or frozen by the bell, and slump off when they lose a cap.
- Caps fly back with a sparkly trail. Tricks set off confetti. Tires kick up dust, and water splashes.
- Birds peck on the ground, fly off when you (or a running monkey) get close, and come back later.
- Flags fly on the landmarks, stalls and boats, and laundry flaps behind the houses.

## Scoring

- Cap: 100
- Spin: 100. Double spin: 250. Triple: 450
- No hands: 75, plus a 100 bonus if combined with a spin
- Big air (long jump off a ramp): 50
- Landing mid-spin is a "wobble": you slow down and that spin doesn't count

## How the 3D game is built

Each file has one job. They load in this order, and each one uses things from the files above it:

| File | Job |
| --- | --- |
| `index.html` | The page: menu cards, styles, and the list of scripts |
| `js/sound.js` | Sound effects, made from scratch with the Web Audio API |
| `js/music.js` | The three tunes (written as plain note lists) and the player that schedules them |
| `js/levels.js` | The three places, as plain data. Edit this to move a tree or add a place |
| `js/rules.js` | How the game works: steering, ramps, tricks, monkey brains, catching. Draws nothing |
| `js/ambience.js` | Sounds that keep going: chain ticks, skids, wind, birds, waves, chimes |
| `js/world3d.js` | Builds the 3D models with Three.js, animates them (legs, wobbly stack, birds, flags, confetti) and moves the camera |
| `js/hud.js` | The flat layer on top: caps counter, score, mini-map, compass, speech bubbles |
| `js/main.js` | Keyboard, menus, saving progress, and the frame loop |

The key idea: **the rules happen on a flat map** (x, y, plus a height z), and the 3D view only
shows it. A map point `(x, y)` at height `z` becomes the 3D point `(x, z, y)`. That's why the
monkeys' brains didn't change at all when the game went from 2D to 3D. When something happens that
the drawing needs to know about (a new place starts, a cap lands on the stack), `rules.js` calls a
**hook**, and `world3d.js` and `main.js` fill the hooks in.

## Running it locally

The 3D game is several files, so it needs a little web server (double-clicking won't load the
`js/` files). From the Coding Sandbox folder:

```
python -m http.server 8796 --directory cap-chase
```

Then open http://localhost:8796/. Keep the source files plain ASCII: some servers don't say
"UTF-8", and fancy characters like arrows or curly quotes come out garbled when they don't.

## Changing things

- **Difficulty:** each place in `js/levels.js` has `monkeySpeed` (the bike tops out at 320), `fleeR`
  (how close you get before they run), `energy` (seconds they run before tiring), and `dodge`
  (chance of a sidestep). Steering feel is at the top of `js/rules.js`.
- **Changing a tune:** each song in `js/music.js` is a list of bars like `['G', 'B4:2 D5:2 B4:2']`:
  a chord, then notes with their length in eighth notes. If a bar's lengths don't add up, the
  browser console says which bar.
- **Adding a place:** add one object to `LEVELS` in `js/levels.js`, with a `bigTree(x, y)` for the
  nap. Any kind of thing already used (trees, houses, stalls, water, bridges, ramps...) just works.
  A brand-new kind needs a solid rule in `prepareLevel` (rules.js) and a builder in `BUILD` (world3d.js).
- **Publishing:** commit and push to `main`. GitHub Pages rebuilds the site by itself, usually
  within a minute or two.
