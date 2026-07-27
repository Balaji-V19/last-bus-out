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
  survival gear, wounds, scale changes, and game-ready GLB export. Skin weights
  were later repacked from 32-bit floats to normalised bytes by
  `scripts/compact-character-glb.mjs`, which cut the three models from 11.5 MB
  to 9.2 MB without altering geometry, skeletons or animation.

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

### Creature and injury one-shots

`public/audio/creatures/*.ogg` are cut from sound effects downloaded from
Pixabay. They are stored locally and are never requested from Pixabay at
runtime.

**Zombie vocalisations** — `growl-a`, `growl-b`, `growl-c`, `attack-a`,
`attack-b`, `attack-c`, `scream-a`, `death-a`, `death-b`, and the
`female-zombie-screams` cuts `scream-b`, `scream-c`, `scream-d`.

- Creator: DRAGON-STUDIO
- Source: https://pixabay.com/users/dragon-studio/ via https://pixabay.com/sound-effects/
- License: Pixabay Content License
- License URL: https://pixabay.com/service/license-summary/
- Retrieved: 2026-07-27
- Local changes: trimmed to individual one-shots, downmixed to mono, resampled
  to 32 kHz, loudness-normalised to −16 LUFS with −1.5 dBTP, short fades
  applied at both ends, re-encoded to Ogg Vorbis.

**Player injury** — `hurt-a`, `hurt-b`, `hurt-c`.

- Creator: freesound_community
- Source: https://pixabay.com/users/freesound_community/ via https://pixabay.com/sound-effects/
- License: Pixabay Content License
- License URL: https://pixabay.com/service/license-summary/
- Retrieved: 2026-07-27
- Local changes: as above.

Note that the Pixabay Content License is **not** CC0. It permits use in a game
without attribution, and forbids redistributing the audio as standalone files
or as part of a sound pack. The credits above are recorded because this
repository requires provenance for every external asset, not because the
license demands attribution.

### Weapon and gore one-shots

`public/audio/weapons/*.ogg` are cut from Freesound recordings. Every item is
**CC0 1.0 Universal**, which requires no attribution; the credits below are
recorded because this repository requires provenance for every external asset.

License URL for all of the following:
<https://creativecommons.org/publicdomain/zero/1.0/>

| Game file | Creator | Source |
| --- | --- | --- |
| `axe-swing-a` | ErikCruzDev | https://freesound.org/people/ErikCruzDev/sounds/735907/ |
| `axe-swing-b` | GaussTheWizard | https://freesound.org/people/GaussTheWizard/sounds/367182/ |
| `axe-flesh-a` | JoseAgudelo | https://freesound.org/people/JoseAgudelo/sounds/472502/ |
| `axe-flesh-b`, `axe-flesh-d`, `axe-flesh-e` | TheFilmLook | https://freesound.org/people/TheFilmLook/sounds/365574/ |
| `axe-flesh-c` | magnuswaker | https://freesound.org/people/magnuswaker/sounds/697829/ |
| `axe-wall-a` | dslrguide | https://freesound.org/people/dslrguide/sounds/321482/ |
| `axe-wall-b` | dslrguide | https://freesound.org/people/dslrguide/sounds/321477/ |
| `bone-a` | Vinni_R | https://freesound.org/people/Vinni_R/sounds/630594/ |
| `knife-slash-a` | SamuelGremaud | https://freesound.org/people/SamuelGremaud/sounds/573300/ |
| `squelch-a` | SoundDesignForYou | https://freesound.org/people/SoundDesignForYou/sounds/649982/ |

- Retrieved: 2026-07-27
- Local changes: cut to individual one-shots where the source was a multi-take
  session, downmixed to mono, resampled to 32 kHz, loudness-normalised to
  −16 LUFS with −1.5 dBTP, faded at both ends and encoded to Ogg Vorbis. The
  three `axe-flesh` cuts marked TheFilmLook come from separate strikes within
  one 46-second take.

The remaining creature cues — breathing, the windup before a swing, the wet
impact of a blow, the caught breath after one — are synthesised at runtime by
`app/game3d/voice.ts` and carry no third-party license. They also serve as the
fallback if any recording fails to load.

The background score is stored locally at
`public/audio/dissonant-horror-loop.ogg`.

- Title: Ambient Horror Track 01
- Creator: Cleyton Kauffman
- Source: https://opengameart.org/content/ambient-horror-track-01
- License: CC0 1.0 Universal / public domain
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
