# Last Bus Out: St. Orison

Last Bus Out is a third-person 3D hospital-horror game that runs in a modern
browser. The current campaign never leaves St. Orison Hospital. The player
moves between sealed floors, searches for survivors and supplies, restores
critical systems, fights infected patients and research mutations, and tries
to reach Shelter 04 before infection reaches 100%.

The project is built with React, TypeScript, Three.js, Vite, and vinext. It is
designed to run locally and to produce a static GitHub Pages build.

## Current game

The route is one connected hospital story:

| Phase | Hospital area | Main purpose |
| --- | --- | --- |
| 1 | Ground Floor Emergency | Find the torch, radio, fire axe, and power Stairwell A |
| 2 | Floor 2 Patient Ward | Read the survivor board and rescue Maya and an injured orderly |
| 3 | Basement B1 Services | Restart emergency power and recover food, trauma supplies, and antivirals |
| 4 | Floor 3 Isolation | Open pediatrics, contain an isolation breach, and escort a hidden family |
| 5 | Floor 4 Research & Pharmacy | Find the access card, recover the antiviral trial case, and kill a mutation |
| 6 | Ground Floor Safe Wing | Lead the survivors and supplies to Shelter 04 |
| Endless | Restricted Quarantine Annex | Defend the shelter against escalating mutation waves |

The TypeScript route still uses the internal identifiers `hospital`, `street`,
`station`, `checkpoint`, `depot`, `escape`, and `survival`. The older names are
kept only as stable program identifiers; every playable route now builds a
hospital interior.

## Gameplay systems

- Third-person locomotion with idle, walk, run, attack, attack-run, shoot, hit,
  and death animation states.
- Fire-axe melee, a recoverable service pistol, dodging, hit reactions, blood
  particles, enemy health bars, combo momentum, and score.
- Walker, runner, and heavy mutated infected. Variants have different health,
  damage, speed, movement irregularity, attack pressure, infection damage, and
  visual treatment.
- Health and infection are separate. Trauma kits restore health; antiviral
  doses reduce infection. Bites from stronger mutations cause more infection.
- Persistent survivor, food, antiviral, emergency-power, ammunition, and kill
  counts.
- Floor objectives involving collection, repair, defense, rescue, escort, and
  safe-room delivery rather than a simple sequence of exits.
- Threat-aware horror direction: full blackouts, faulty fluorescent fixtures,
  flashlight contrast, fog, camera shake, proximity dread, heartbeat, stingers,
  randomized zombie voices, and encounter-triggered lighting failures.
- Runtime Web Audio effects for footsteps, axe swings, impacts, gunfire,
  generators, healing, UI feedback, zombie attacks, growls, heartbeat, and
  waves, plus a local CC0 horror-music loop.
- Local save data in `localStorage`. The current save key is versioned so the
  hospital campaign does not load incompatible saves from the earlier route.
- Mouse, keyboard, and touch controls.

## Controls

| Input | Action |
| --- | --- |
| `W`, `A`, `S`, `D` | Move |
| `Shift` | Run |
| Drag | Look around |
| Mouse wheel | Adjust third-person camera distance |
| `F` | Axe attack |
| `G` | Fire the pistol after it is found |
| `Space` | Dodge |
| `E` | Interact |
| `Escape` | Pause or resume |

Touch movement and action controls appear automatically on coarse-pointer
devices.

## Run locally

Node.js `>=22.13.0` is required.

```bash
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open `http://localhost:3000`.

When Codex starts the command, it may prepend a Node binary inside
`.cache/codex-runtimes` to `PATH`. That cache location supplies the Node/npm
executable only. The game source, installed packages, build output, saves, and
Git repository remain in this project directory.

Stop a local server with `Ctrl+C` in its terminal. The project should not leave
development servers running after validation.

## Build and validation

```bash
npm run lint
npm run validate:characters
npm test
npm run build:pages
```

- `npm run lint` checks the React and TypeScript source.
- `npm run validate:characters` loads every GLB and checks skeleton nodes, hand
  weights, finger control, head direction, knee tracking, foot direction, and
  walk-cycle symmetry.
- `npm test` makes the vinext production build and verifies rendered HTML.
- `npm run build:pages` creates the static `dist-pages` site used by GitHub
  Pages.

For a quick TypeScript-only check:

```bash
npx tsc --noEmit
```

## Technical architecture

### Application and state

- `app/LastBusOutGame.tsx` owns the story, objective state, inventory,
  infection, survivors, food, saving, menus, HUD, ending, and audio requests.
- `app/GameViewport3D.tsx` owns the renderer, camera, input, locomotion,
  character/enemy actors, combat, encounter director, lighting failures,
  survival waves, particles, and per-frame updates.
- `app/globals.css` supplies the game presentation, HUD, accessibility states,
  loading layer, responsive layout, and touch controls.
- `app/layout.tsx` provides vinext/Next metadata for the server build.

### Three-dimensional world

- `app/game3d/scene.ts` constructs the hospital entirely from reusable Three.js
  geometry and materials. It contains beds, IV stands, monitors, wheelchairs,
  oxygen tanks, pharmacy shelves, reception desks, cabinets, operating lamps,
  consoles, elevators, signage, food caches, specimen pods, puddles, walls,
  floors, ceilings, and fluorescent fixtures.
- Each floor returns a root group, collision circles, interaction points, a
  player start, and movement bounds.
- Large static props are grounded interactions. Portable objects use a visible
  pickup animation and marker.
- Materials use roughness, metalness, transparency, emissive surfaces, and
  locally generated texture variation. No remote texture request is needed
  during play.

### Characters and animation

- `public/models/characters/hero.glb` is the player.
- `public/models/characters/maya.glb` is the rescued companion.
- `public/models/characters/infected.glb` is the anatomical base used by
  infected variants.
- `app/game3d/animatedCharacter.ts` loads, clones, scales, equips, animates, and
  disposes the models. It also creates variant coloration and original
  mutation-growth geometry for runners and heavies.
- Every playable GLB embeds the required `Native_*` animation clips. The
  original procedural character system remains as an offline fallback if a
  GLB cannot be loaded.
- Model provenance and licenses are recorded in
  `public/models/THIRD_PARTY.md`.
- The complete authoring/export/validation contract is in `AGENT.md`.

### Audio

- `app/game3d/audio.ts` synthesizes gameplay sound effects with Web Audio and
  controls threat-sensitive music.
- `public/audio/dissonant-horror-loop.ogg` is stored locally. Playback starts
  only after browser-approved user interaction.
- All current external art/audio sources are CC0 and documented. Do not add
  an asset merely because it is downloadable; its license must explicitly
  permit the intended use.

### Static deployment

- `static-game/main.tsx` mounts the same React game for a Vite static build.
- `vite.pages.config.ts` builds with the `/last-bus-out/` base path.
- `.github/workflows/deploy-pages.yml` builds and deploys only after a push to
  `main` (or a manual workflow run).
- No local development command deploys the game.

## Loading and performance

The menu loads first. The Three.js viewport is lazy-loaded on interaction or
during browser idle time. Character GLBs are cached and skeleton-cloned,
render resolution is capped, the renderer requests a low-power GPU profile,
shadows are throttled, only nearby local lights are enabled, character detail
and shadow work are reduced at distance, audio is local, and the static build
uses content-hashed assets.

When adding content:

- Reuse geometries and materials where practical.
- Keep one authoritative animation loop; do not create a React state update on
  every rendered frame.
- Prefer collision circles and authored room bounds over a heavy physics
  engine unless gameplay requires one.
- Limit shadow-casting lights and high-detail transparent materials.
- Compress textures and GLBs and verify the initial network payload.
- Test on a laptop at device pixel ratio 1–1.2 before increasing visual cost.

## Project map

```text
app/
  LastBusOutGame.tsx        campaign, save data, inventory, HUD
  GameViewport3D.tsx        renderer, controls, combat, horror director
  game3d/
    animatedCharacter.ts    GLB loading, rigs, equipment, animation
    audio.ts                music and synthesized sound effects
    scene.ts                hospital floor and prop construction
public/
  audio/                    local music
  items/                    equipment UI atlas
  models/characters/        game-ready GLB characters
scripts/
  validate-character-gait.mjs
static-game/                Vite/GitHub Pages entry
tests/                      production-render checks
```

## Extending the game

To add a floor, introduce a stable chapter/floor identifier, add its visible
story and objectives, build the scene and interactions, define encounter
triggers, connect its transition, update save defaults, then validate both a
new game and a continued save. Every objective interaction ID must match
between `scene.ts`, `GameViewport3D.tsx`, and `LastBusOutGame.tsx`.

To add or replace a character, follow the model contract in `AGENT.md`, export
the GLB into `public/models/characters`, update provenance, run the gait
validator, and visually inspect idle, walk, run, attack, hit, and death from
front, back, and both side views.

## GitHub Pages

The repository workflow publishes after a successful push to `main`:

<https://balaji-v19.github.io/last-bus-out/>

Deployment should remain branch-driven. Do not deploy directly from a local
agent session unless the repository owner explicitly requests it.

## Ownership and licensing

Project code, procedural environment geometry, equipment geometry, mutation
additions, gameplay logic, and presentation were created for Last Bus Out.
Character anatomy/animation bases and the music loop use documented CC0
sources. See `public/models/THIRD_PARTY.md` for exact creators, source URLs,
licenses, and local modifications.
