# Repository instructions

These instructions apply to the whole repository.

1. Read `README.md`, `CLAUDE.md`, `AGENT.md`, and
   `public/models/THIRD_PARTY.md` before changing campaign structure,
   characters, assets, or deployment.
2. Keep the game entirely inside St. Orison Hospital. The legacy chapter
   strings are internal IDs, not permission to restore outdoor locations.
3. Keep objective IDs synchronized across `scene.ts`,
   `GameViewport3D.tsx`, and `LastBusOutGame.tsx`.
4. Keep live Three.js simulation out of React state and preserve the
   low-power/lazy-loading performance design.
5. Use original or clearly licensed assets only. Altering copyrighted work
   does not remove its copyright. Update provenance for every external asset.
6. Follow the full character rig, anatomy, animation, export, and validation
   contract in `AGENT.md`.
7. Run typecheck, lint, relevant tests, character validation when applicable,
   and the static Pages build before handoff.
8. Stop local servers and Blender processes after testing.
9. Do not push or deploy unless explicitly requested in the current task.
   Deployment is normally performed by the `main` branch GitHub Pages
   workflow.

