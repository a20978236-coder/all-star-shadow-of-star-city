# ALL★STAR: Shadows of Star City

A cinematic third-person superhero action game starter, set in the rain-soaked neon night of **Star City**.
You play **All-Star**, a hero in a black armoured suit with a neon-green star emblem, fighting the
**Chaos Empire** across rooftops, streets and the harbour.

Built with **[PlayCanvas Engine 2.23.3](https://github.com/playcanvas/engine)** and **[Vite](https://vite.dev)**.
It runs in desktop browsers (keyboard + mouse) and on iPhone Safari (touch controls).

> All art in this starter is procedural placeholder geometry and canvas-generated textures, so the
> project runs with zero asset downloads. See [Replacing placeholder assets](#replacing-placeholder-assets).

---

## Two renderers, one game

The game now ships with **two interchangeable renderers** that share all gameplay code
(player, combat, enemies, grapple, bike, missions, physics, input, touch controls, HUD):

| Page | Renderer | Status |
| --- | --- | --- |
| `index.html` → `src/main.js` | PlayCanvas 2.23.3 | The live game |
| `three/index.html` → `src/three/main.js` | Three.js 0.180 | Side-by-side port (preview) |

Rendering goes through a small graphics layer (`src/gfx/gfx.js`) implemented by
`src/gfx/PcGfx.js` and `src/gfx/ThreeGfx.js`. The Three.js node wrapper mirrors the subset of
the PlayCanvas Entity API the game uses (same euler order, `-Z` forward, spot lights along `-Y`),
so gameplay code is renderer-agnostic. During development open `http://localhost:5173/three/`
for the Three.js version; on GitHub Pages it lives at `…/three/`.

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

### Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` builds the game and publishes `dist/` to GitHub Pages on every push
to `main` (or manually from the **Actions** tab → *Deploy to GitHub Pages* → *Run workflow*).
In **Settings → Pages**, set **Source** to **GitHub Actions** if it is not already. The game is then served at
`https://<user>.github.io/<repo>/`.

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

## Graphics & character upgrade

* **Image-based lighting** — a procedural night-city environment map (`src/world/EnvMap.js`) gives wet
  streets, mirror-like puddles, glass towers and the suit real reflections of neon and lit windows.
* **Materials** — normal maps on facades (recessed windows, ledges, bricks), wet asphalt with aggregate,
  cracks, manholes and puddle gloss maps, paving-slab sidewalks, hex-armour suit texture.
* **City detail** — window interiors (curtains, blinds, silhouettes, office light strips), cornices and
  ledges, glass-tower pilasters, glowing street-level shop fronts with signs and awnings, curbs, traffic
  signals that cycle, hydrants, bins, benches and steam vents.
* **Atmosphere** — dense rain plus ground splashes, distant lightning flashes, fog, moonlight shadows.
* **Cinematic camera** — ACES tone mapping, bloom, vignette, ambient occlusion and depth of field (High),
  multi-ray camera collision.
* **All-Star** — sculpted body (`src/characters/Characters.js` + `ShapeBuilder.js`): face with brown eyes,
  catchlights, brows, nose and lips; short thick curly black hair; black hex-armour suit with neon-lime panels, cyan light lines,
  graffiti-style lime star emblem and buckle, finned gauntlets, knee guards, boots; a **verlet cloth cape**
  (`Cape.js`) with a lime lining, lime piping and a star on the back, that trails in the wind and spreads into a wing while gliding.
  Animations: idle (weight shift, look-around), walk, run, sprint, jump tuck, landing crouch, plus all
  combat/traversal poses.
* **Quality presets** — Low / Medium / High (pause menu → GRAPHICS). PC defaults to High, iPhone to Medium.

## 3D hero model (glTF)

All-Star is a real 3D model in two detail levels, picked by the graphics preset:

| File | Used on | Triangles | Textures |
| --- | --- | --- | --- |
| `src/assets/models/allstar_hd.glb` (≈6 MB) | High (PC) | 99k | 4096² colour, 2048² normal + metallic/roughness + glow |
| `src/assets/models/allstar.glb` (≈3 MB) | Medium / Low (iPhone) | 49k | 2048² colour, 1024² normal + metallic/roughness + glow |

Both have a 14-joint skeleton. Both renderers load it at start-up and swap it in for the
built-in hero; if it fails to load, the built-in hero stays. Add `?hero=classic` to the URL to
force the built-in hero.

The skeleton's joints are named like the game's procedural rig (`body, pelvis, torso, head,
armL/foreL, armR/foreR, legL/shinL, legR/shinR, cape1, cape2`), so every existing animation
(idle, walk, run, sprint, jump, land, glide, swing, combat, ride) drives the model directly.

### Hero asset pipeline

The source was a 1M-triangle, unrigged, AI-generated GLB. To rebuild from a new source model:

1. Put the raw model at `assets-src/allstar-raw.glb` (git-ignored; keep the original somewhere safe).
2. Run:

```bash
npm run hero:build
```

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `tools/hero-optimize.mjs` | weld + meshoptimizer simplify (1M → 50k triangles) |
| 2 | `tools/hero-rig.mjs` | face −Z, scale to 1.85 m, build the skeleton, capsule skin weights, cut cape↔limb "bridge" triangles the AI mesh fused, smooth weights over mesh edges, smooth normals, 2048² JPEG |
| 2b | `tools/hero-rig.mjs` (restyle) | matches the official character sheet (`docs/reference/allstar-character-sheet.webp`): black cape shell, lime star projected onto the back of the cape, emissive map so lime/cyan details glow. Skip with `--no-restyle` |
| 2c | `tools/hero-rig.mjs` (maps) | detail normal map from the texture's high-frequency luminance (skin kept smooth), metallic/roughness by material (skin, armour, cape fabric, glowing trim), MikkTSpace tangents. Skip with `--no-maps` |
| 3 | `tools/hero-rig-check.mjs` | poses the rig (run / glide / kick) and reports stretched triangles |

**Rigged FBX (e.g. from Meshy):** `npm run hero:extract-fbx-rig` reads a rigged FBX
(`assets-src/allstar-rigged.fbx`) and dumps its skeleton and weights to `.cache/fbx_rig.json`.
The supplied *Neon_Star_Sentinel.fbx* is a separate low-detail regeneration (3.5k triangles,
knees ~15 cm higher, different cape), so its rig is not transferred onto the detailed mesh.
To get a professional rig that matches exactly, rig the detailed model itself (upload
`allstar_hd.glb` or the raw GLB to Meshy/Mixamo's auto-rigger).

**Making a new model from the character sheet:** this pipeline can't create 3D from a 2D
image. Generate a GLB with an image-to-3D tool (for example Meshy, Tripo or Hunyuan3D, using
the sheet's front/side/back views as multi-view input) or commission an artist, save it as
`assets-src/allstar-raw.glb`, and run `npm run hero:build`.

Joint positions in `hero-rig.mjs` were measured for this model; a different model needs them
re-measured. For production quality, a hand-rigged model (Blender/Maya, or Mixamo auto-rig)
with authored animation clips will deform better than automatic weights.

## Project structure

```
index.html                 Page shell (canvas + UI root, iOS meta tags)
vite.config.js             Vite config (LAN dev server, relative base)
public/favicon.svg
three/index.html           Three.js page
src/
  main.js                  Entry point (PlayCanvas)
  three/main.js            Entry point (Three.js)
  three/ThreeEnvironment.js  Three.js sky, fog, moonlight, IBL, rain, splashes, lightning
  gfx/gfx.js               Renderer-agnostic graphics layer (contract)
  gfx/PcGfx.js             PlayCanvas backend
  gfx/ThreeGfx.js          Three.js backend (Entity-like node wrapper, materials, post FX)
  Game.js                  Creates the PlayCanvas app and wires all systems; main update loop
  config.js                All gameplay tuning values + quality presets (mobile vs desktop)
  core/
    Input.js               Unified action input (keyboard, mouse, pointer lock, touch)
    TouchControls.js       iPhone virtual joystick, look zone, action buttons
    Physics.js             Lightweight AABB collision world: sweep/step/ground, raycasts, height queries
    MathUtils.js           Math helpers + deterministic RNG
  world/
    City.js                Procedural districts, buildings, rooftops, props, signs, lamps, light pool, minimap image
    Environment.js         PlayCanvas moonlight, fog, sky dome, moon, rain
    GeometryBatch.js       Merges static geometry into a few meshes
    Materials.js           Material helpers (lit, neon/emissive)
    Textures.js            Canvas-generated textures + normal/gloss maps (facades, roads, sidewalks, shops, suit)
    EnvMap.js              Procedural night-city environment map for reflections
  assets/models/allstar.glb  The 3D hero (built by tools/hero-*.mjs)
  characters/
    Humanoid.js            Rig + procedural animation (drives built-in parts or a GLB skeleton)
    Characters.js          All-Star (sculpted hero) and Chaos Empire model factories
    ShapeBuilder.js        Merges ellipsoids / tapered limbs / boxes into single meshes
    Cape.js                Verlet cloth cape simulation
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
