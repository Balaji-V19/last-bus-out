# 3D asset provenance

## Realistic characters

The realistic human anatomy in `public/models/characters/hero.glb`,
`maya.glb`, and `infected.glb` is derived from Blender Studio's Human Base
Meshes asset bundle.

- Creator: Blender Studio
- Source: https://download.blender.org/demo/bundles/bundles-3.6/
- Original bundle: `human-base-meshes-bundle-v1.0.0.zip`
- License: CC0 1.0 Universal / public domain
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Local changes: A-pose to T-pose conversion, skeletal weight transfer,
  original rescue/paramedic/infected materials, clothing regions, hair,
  survival gear, wounds, scale changes, and game-ready GLB export.

The skeleton and source motion references used to author the native animation
clips embedded directly in each playable GLB are from Mesh2Motion. Mesh2Motion
explicitly publishes its 3D models, rigs, and animations under CC0.

- Creator: Mesh2Motion contributors
- Source: https://github.com/Mesh2Motion/mesh2motion-app
- License for art assets: CC0 1.0 Universal / public domain
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Local changes: the donor mannequin is not shipped as a playable model; its
  skeleton weights were transferred to the Blender Studio anatomy, and the
  animation set is mapped to gameplay states in
  `app/game3d/animatedCharacter.ts`.

The axe, pistol, materials, character equipment, hit response, animation-state
mapping, model assembly, and performance LOD behavior are original code and
geometry made for Last Bus Out. The earlier fully procedural characters remain
as an offline-safe fallback if a GLB cannot load.

## Audio

Footsteps, combat impacts, weapon movement, zombie vocalizations, damage cues,
healing, and wave alerts are generated locally at runtime by the Web Audio
implementation in `app/game3d/audio.ts`.

The background score is stored locally at
`public/audio/dissonant-horror-loop.ogg`.

- Title: Ambient Horror Track 01
- Creator: Cleyton Kauffman
- Source: https://opengameart.org/content/ambient-horror-track-01
- License: CC0 1.0 Universal / public domain
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
