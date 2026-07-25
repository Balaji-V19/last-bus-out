# Original 3D assets

The playable rescue officer, paramedic companion, walker, runner, heavy
infected, carried axe, and pistol are original procedural models created for
Last Bus Out. Their anatomy, clothing layers, equipment, materials, joint rigs,
and animations are generated locally by `app/game3d/animatedCharacter.ts`.

The game no longer loads third-party character, animation, or weapon models.

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
