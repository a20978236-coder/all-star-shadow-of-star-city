# ALL★STAR: Shadows of Star City

A cinematic third-person superhero action game starter, set in the rain-soaked neon night of **Star City**.
You play **All-Star**, a hero in a black armoured suit with a neon-green star emblem, fighting the
**Chaos Empire** across rooftops, streets and the harbour.

Built with **[PlayCanvas Engine 2.23.3](https://github.com/playcanvas/engine)** and **[Vite](https://vite.dev)**.
It runs in desktop browsers (keyboard + mouse) and on iPhone Safari (touch controls).

> All art in this starter is procedural placeholder geometry and canvas-generated textures, so the
> project runs with zero asset downloads. See [Replacing placeholder assets](#replacing-placeholder-assets).

---

## Quick start

Requirements: **Node.js 18+** (20 or 22 recommended) and npm.

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`) and click **CLICK TO START**.

### Production build

```bash
npm run build
```

```bash
npm run preview
```

`npm run build` writes a static site to `dist/`. Because `vite.config.js` uses `base: './'`, you can upload
`dist/` to any static host (GitHub Pages, Netlify, Vercel, S3, itch.io…).

### Playing on an iPhone

1. Make sure your computer and iPhone are on the same Wi-Fi network.
2. Run `npm run dev` — the dev server listens on your LAN (`server.host: true`).
3. Open the **Network** URL Vite prints (e.g. `http://192.168.1.20:5173`) in Safari on the iPhone.
4. Rotate to **landscape**. For a full-screen experience use *Share → Add to Home Screen*.

The game automatically detects touch devices, shows on-screen controls, and lowers render
resolution, rain density, light count and disables shadows for performance.

---

## Controls

### PC — keyboard & mouse

| Action | Input |
| --- | --- |
| Move | `W A S D` / arrow keys |
| Camera | Mouse (click the game to capture the pointer) |
| Sprint | `Shift` |
| Jump / Glide | `Space` — press again (or hold while falling) in the air to glide with the cape |
| Strike (combo) | Left click (or `J`) |
| Counter | Right click (or `K`) when the **cyan** marker flashes above an enemy |
| Dodge | `Ctrl` or `C` |
| Star Burst (special) | `R` when the energy bar is full |
| Grapple to ledge | `Q` (or middle mouse) — the reticle turns green when a ledge is in range |
| Web-swing | Hold `E`, release to fling yourself forward |
| Summon Star Cycle | `B` (street level) |
| Ride / Dismount | `F` |
| Eject from bike | `Space` while riding (then glide!) |
| Bike | `W` throttle, `S` brake/reverse, `A`/`D` steer, `Shift` boost |
| Pause / Map | `Esc`, `P` or `M` |

### iPhone — touch

| Action | Input |
| --- | --- |
| Move | Left virtual stick (push fully forward to sprint) |
| Camera | Drag anywhere on the right side of the screen |
| Strike / Counter | Fist button / Shield button |
| Jump / Glide | Up-arrow button (tap again in the air to glide) |
| Grapple / Swing | Hook button / Swing button (hold) |
| Dodge | Dash button |
| Star Burst | Glowing star button (pulses when ready) |
| Sprint toggle | Runner button next to the stick |
| Summon bike / Ride | Bike button / Hand button (lights up when you can ride) |

---

## What's in the starter

| Feature | Details |
| --- | --- |
| **Third-person controller** | Walk/run/sprint with acceleration, camera-relative movement, jump, coyote time, step-up over curbs, automatic ledge **mantle/vault**, fall-off-world safety respawn. |
| **All-Star character** | Procedural rig (`Humanoid`) with animated poses: idle, run, sprint, jump, **cape glide**, swing, zip, punches/kicks, counter, dodge, stagger, ride. Black armoured suit, neon-green star emblem and trim, two-segment fluttering cape. |
| **Third-person camera** | Shoulder offset, collision against buildings, per-state profiles (on foot, combat, glide, swing, bike), speed-based FOV, auto-follow during traversal, trauma screen-shake, ACES tone-mapping, bloom & vignette via `CameraFrame`. |
| **Combat** | Free-flow: lunge to the best target in your input direction, combo counter & timer, critical every 5th hit, ground **takedowns**, multi-enemy **counters**, i-frame dodge, **Star Burst** AoE, hit-stop, sparks, shockwave. |
| **Enemies** | Chaos Empire thugs and brutes with patrol → engage (circle) → approach → wind-up (counter window) → strike → recover AI, attack tokens (max 2 attackers), crowd separation, stagger/knockdown/defeat, ambient rooftop patrols that respawn. |
| **Grapple & swing** | *Grapple*: zip to the ledge under the crosshair and get boosted over it. *Swing*: pendulum rope physics with reel-in, ground-clearance, steering, release boost and chaining — swing down the avenues. |
| **Star Cycle motorcycle** | Summon, mount/dismount, throttle/brake/reverse, steering with lean, boost meter, wall crashes, enemy ram knockdowns, headlight, spinning neon wheels, **eject-launch** into a glide. |
| **Star City** | Procedural 10×10-block city (~800 m) with 13 districts (Downtown, Techcore Tower, Chaos Empire Occupation Zone, Harbor, Industrial, Old City, Entertainment, University, Riverdale Park, Blackgate…), walkable rooftops with parapets/AC units/water towers/huts, neon signs and billboards, street lamps, parked cars, harbour containers & crane, waterfront. Geometry is batched into a few dozen draw calls. |
| **Atmosphere** | Night sky dome with stars & clouds, moon + halo, rain particles, exponential fog, wet glossy streets, moonlight shadows, a dynamic pool of street/neon point lights that follows the camera, blinking beacons, patrol drones. |
| **HUD** | Portrait, health & energy bars, Star Shard counter, current objective + distance, rotating minimap (buildings, objective, enemies, shards, bike), compass, grapple reticle, combo counter, district name pop-ups, toasts, banners, prompts, bike speedometer, damage flash. Pause screen with full **city map** and controls. |
| **Missions** | Data-driven mission chain: *Night Patrol* (grapple, Techcore terrace, shards) → *The Chaos Empire* (hideout fight, intel) → *Harbor Run* (Star Cycle, harbour brawl) → *Free Roam* (20 Star Shards). Checkpoints and respawn. |

---

## Project structure

```
index.html                 Page shell (canvas + UI root, iOS meta tags)
vite.config.js             Vite config (LAN dev server, relative base)
public/favicon.svg
src/
  main.js                  Entry point
  Game.js                  Creates the PlayCanvas app and wires all systems; main update loop
  config.js                All gameplay tuning values + quality presets (mobile vs desktop)
  core/
    Input.js               Unified action input (keyboard, mouse, pointer lock, touch)
    TouchControls.js       iPhone virtual joystick, look zone, action buttons
    Physics.js             Lightweight AABB collision world: sweep/step/ground, raycasts, height queries
    MathUtils.js           Math helpers + deterministic RNG
  world/
    City.js                Procedural districts, buildings, rooftops, props, signs, lamps, light pool, minimap image
    Environment.js         Moonlight, fog, sky dome, moon, rain
    GeometryBatch.js       Merges static geometry into a few meshes
    Materials.js           Material helpers (lit, neon/emissive)
    Textures.js            Canvas-generated placeholder textures (facades, roads, signs, sky, star)
  characters/
    Humanoid.js            Primitive-based rig with procedural animation
    Characters.js          All-Star and Chaos Empire model factories
  player/
    Player.js              Character controller & state machine
    GrappleSystem.js       Grapple zip + web-swing
  camera/
    ThirdPersonCamera.js   Orbit camera, collision, profiles, shake, post-processing
  combat/
    CombatSystem.js        Strikes, combos, counters, takedowns, Star Burst
    Effects.js             Pooled sparks and shockwave
  enemies/
    Enemy.js               Enemy AI + reactions
    EnemyManager.js        Spawning, attack tokens, separation, respawn, bike impacts
  vehicles/
    Motorcycle.js          Star Cycle
  missions/
    MissionSystem.js       Mission/objective definitions and tracking, waypoint beacon
    Collectibles.js        Star Shards
  ui/
    HUD.js                 HUD, minimap, map, title/pause/defeat screens
    Icons.js               Inline SVG icons
    styles.css             HUD + touch control styling (safe-area aware)
```

---

## Customising

* **Tuning** — open `src/config.js`. Movement speeds, glide, grapple range, combo window, enemy
  aggression, bike handling and mobile quality settings all live there.
* **New missions** — add entries to `buildMissions()` in `src/missions/MissionSystem.js`. Objective
  types: `reach`, `height`, `collect`, `defeat` (with `onStart` to spawn a group) and `mount`.
* **New districts** — edit `DISTRICTS` and `districtKeyFor()` in `src/world/City.js`.
* **Debugging** — the running game is exposed as `window.__game` in the browser console, e.g.
  `__game.player.body.pos.set(40, 206, -40)` to teleport onto Techcore Tower.

## Replacing placeholder assets

The placeholders are deliberately isolated so you can swap in real art:

* **Characters** — `Humanoid` exposes `root` plus a `pose(dt, params)` call driven by state.
  Load a rigged GLB (`app.assets.loadFromUrl(url, 'container', ...)`), instantiate it under `root`,
  and map `params.state` (`idle`, `run`, `sprint`, `air`, `glide`, `swing`, `attack`, `counter`,
  `dodge`, `hit`, `down`, `ride`…) to animation-state-graph parameters.
* **Motorcycle** — replace `_buildModel()` in `Motorcycle.js` with a GLB; keep `root`,
  `leanPivot`, `frontWheel` and `rearWheel` entities.
* **City** — keep the physics boxes from `City.js` and render your own building GLBs, or replace the
  canvas textures in `Textures.js` with image assets.
* **Audio** — not included yet; add `sound` components to the player, bike and enemies.

## Notes

* Requires WebGL2 (all modern desktop browsers and iOS 15+ Safari).
* Physics is a custom kinematic AABB system (no WASM), chosen for fast loading and mobile performance.
* The gameplay *style* is inspired by open-world superhero action games; all characters, names, city and
  code here are original to this project.
