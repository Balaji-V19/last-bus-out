# Claude project instructions

This repository contains **Last Bus Out: St. Orison**, a browser-based
third-person hospital-horror game. Read `README.md`, `AGENT.md`, and
`public/models/THIRD_PARTY.md` before making story, character, asset, or
deployment changes.

## Product contract

- The campaign stays inside St. Orison Hospital. Do not restore the former
  city, fuel-stop, checkpoint, transit-depot, bus-route, or Haven campaign.
- The player travels between hospital floors to repair systems, rescue
  uninfected people, find Shelter 04, collect food and medicine, suppress an
  infection, and fight infected and mutated patients.
- Favor psychological and environmental horror: uncertainty, sound direction,
  intermittent visibility, believable clinical spaces, survivor stakes, and
  restrained scares. Do not turn the game into a brightly lit arcade horde
  shooter.
- The internal chapter values `street`, `station`, `checkpoint`, `depot`, and
  `escape` are legacy program identifiers. Their visible content is now Floor
  2, Basement B1, Floor 3, Floor 4, and the Ground Floor Safe Wing.
- Objective interaction IDs must agree in `scene.ts`, `GameViewport3D.tsx`,
  and `LastBusOutGame.tsx`.

## Development rules

- Use Node.js `>=22.13.0`.
- Keep TypeScript strict and avoid `any` unless an external boundary makes it
  unavoidable.
- Preserve lazy viewport loading and the existing low-power renderer settings.
- Avoid per-frame React state updates. Run movement, animation, lighting,
  particles, and enemy AI inside the Three.js update loop; report UI values at
  a throttled cadence.
- Dispose geometries, cloned materials, audio nodes, listeners, observers, and
  animation mixers.
- Reuse existing hospital prop helpers before adding another primitive object.
- Keep interaction objects grounded. Only portable pickups should float or
  rotate.
- Do not leave development servers, Blender processes, or preview browsers
  running after validation.
- Do not overwrite unrelated user changes.

## Asset and copyright rules

- Do not copy a commercial or copyrighted character and assume that visual
  alterations remove the copyright. They do not.
- Use original work, commissioned work with clear rights, or assets with an
  explicit compatible license. Prefer CC0 for incorporated source assets.
- Record creator, source URL, license, license URL, and local modifications in
  `public/models/THIRD_PARTY.md` before shipping an external asset.
- Do not hotlink runtime art or audio. Store approved assets locally.
- Follow the character contract and review checklist in `AGENT.md`.

## Required checks

Run these after relevant changes:

```bash
npx tsc --noEmit
npm run lint
npm run validate:characters
npm test
npm run build:pages
```

Character or animation changes require all five. A copy-only change may omit
the gait validator if no GLB or animation mapping was touched.

## Git and deployment

- Do not push, merge, publish, or deploy unless the repository owner explicitly
  asks in the current request.
- Do not start a direct GitHub Pages deployment from a local session.
- The intended deployment flow is a push to `main`, followed by
  `.github/workflows/deploy-pages.yml`.
- A request to implement locally does not authorize a push.
- Keep commits focused and describe user-visible gameplay changes.

