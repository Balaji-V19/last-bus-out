# Last Bus Out: Road to Haven

An original browser-based 3D horror-survival game built with React, Three.js,
TypeScript, and Vite. The connected campaign moves from St. Orison Hospital
through the fallen city to Haven, then opens into an endless night-watch mode.

The survivor, Maya, infected variants, equipment, environments, movement, and
combat animations are built specifically for this project. The game does not
ship third-party character models.

## Play locally

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open `http://localhost:3000`.

The Node executable may come from Codex's local dependency runtime when Codex
starts the command. That runtime path only supplies Node and npm; the game,
dependencies, build output, and Git repository remain in this project folder.

## Controls

- `WASD`: move
- `Shift`: run
- Drag: look
- Mouse wheel: zoom
- `F`: melee attack
- `G`: fire the pistol after finding it
- `E`: interact
- `Space`: dodge

Touch controls appear on supported smaller screens.

## Build checks

```bash
npm run lint
npm test
npm run build:pages
```

`npm run build` creates the existing vinext server build. `npm run build:pages`
creates the static `dist-pages` build used by GitHub Pages.

## GitHub Pages

Every push to `main` runs
`.github/workflows/deploy-pages.yml` and publishes only this repository's static
game build. The expected project URL is:

<https://balaji-v19.github.io/last-bus-out/>
