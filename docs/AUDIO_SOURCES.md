# Optional weapon recordings

The melee cues are synthesised and work with no files present. These slots let
recorded versions be dropped in instead — the audio system tries the file first
and silently falls back to synthesis if it is missing, so nothing breaks while
a slot is empty.

Every item below was verified as **CC0** on its own Freesound page. CC0
requires no attribution, but this repository requires provenance for every
external asset, so anything actually used must be recorded in
`public/models/THIRD_PARTY.md` before it ships.

Freesound requires a (free) account to download, so these cannot be fetched
automatically.

## Slots

| File to create | What it is | Source (CC0) |
| --- | --- | --- |
| `public/audio/weapons/axe-swing-a.ogg` | heavy whoosh of the axe through air | [Whip woosh — ErikCruzDev](https://freesound.org/people/ErikCruzDev/sounds/735907/) |
| `public/audio/weapons/axe-swing-b.ogg` | second swing, for variation | [swing.mp3 — GaussTheWizard](https://freesound.org/people/GaussTheWizard/sounds/367182/) |
| `public/audio/weapons/axe-flesh-a.ogg` | wet chop into a body | [27_Puñaladas — JoseAgudelo](https://freesound.org/people/JoseAgudelo/sounds/472502/) |
| `public/audio/weapons/axe-flesh-b.ogg` | second chop | [Blunt Force Trauma — TheFilmLook](https://freesound.org/people/TheFilmLook/sounds/365574/) |
| `public/audio/weapons/axe-flesh-c.ogg` | killing blow, bone and wet together | [SKULLCRUSH — magnuswaker](https://freesound.org/people/magnuswaker/sounds/697829/) |
| `public/audio/weapons/axe-wall-a.ogg` | miss into metal | [Metal Hit 2 — dslrguide](https://freesound.org/people/dslrguide/sounds/321482/) — literally an axe on a metal wheelbarrow |
| `public/audio/weapons/axe-wall-b.ogg` | miss into concrete | [Concrete Hit — dslrguide](https://freesound.org/people/dslrguide/sounds/321477/) — literally an axe on a paving slab |

Useful extras if the palette needs widening later, all CC0: bone snap
([Vinni_R 630594](https://freesound.org/people/Vinni_R/sounds/630594/)), gore
squelch ([QuantumFellow 734835](https://freesound.org/people/QuantumFellow/sounds/734835/),
[SoundDesignForYou 649982](https://freesound.org/people/SoundDesignForYou/sounds/649982/)),
knife slash ([SamuelGremaud 573300](https://freesound.org/people/SamuelGremaud/sounds/573300/))
for a future blade weapon, and the professionally recorded
[Medieval Weapon Textures pack](https://opengameart.org/content/medieval-sound-effects-weapon-textures)
on OpenGameArt, which covers swings and impacts from one coherent CC0 source.

## Preparing a download

Drop the raw downloads into a scratch folder and run:

```bash
npm run audio:prepare -- <folder>
```

That trims silence, downmixes to mono, resamples, loudness-matches to the rest
of the game and encodes to Ogg Vorbis. It expects files named after the slot
they fill, e.g. `axe-swing-a.wav`.

## Rejected

- **Weapon Swing Heavy 1 — CTCollab** is the most on-the-nose axe swing
  available but is CC-BY, which creates a credit obligation. Only use it if
  that is acceptable.
- **Bone Crunch Fast — BrassKnucklesFilms** is tagged CC0 while its description
  asks for credit. The CC0 grant is binding and cannot be withdrawn by a note,
  but the conflicting intent makes it not worth using when alternatives exist.
- **Punches, hits, swords and squishes** on OpenGameArt is CC-BY-SA, re-bundles
  mixed-licence sources, and its submitter adds a demand outside the licence.
