import {
  renderImpact,
  renderVoice,
  VOICE_SAMPLE_RATE,
  type VoiceKind,
} from "./voice";

export type GameSoundEvent =
  | "footstep"
  | "attack-swing"
  | "dodge"
  | "zombie-alert"
  | "zombie-growl"
  | "zombie-attack"
  | "zombie-hit"
  | "zombie-death"
  | "player-hit"
  | "pickup"
  | "objective"
  | "heal"
  | "generator"
  | "wave"
  | "gunshot"
  | "dry-fire"
  | "combo"
  | "heartbeat"
  | "horror-sting"
  | "metal-slam"
  | "radio-static"
  // Threat telegraphs. These exist so an attack is something the player can
  // hear coming rather than a hit that simply lands.
  | "zombie-lunge"
  | "zombie-breath"
  | "zombie-scream"
  | "wave-warning"
  | "wave-imminent"
  // The player's own body: breathing under exertion, and weapon-specific
  // contact so a swing sounds like the thing being swung.
  | "player-breath"
  | "axe-swing"
  | "axe-flesh"
  | "axe-wall";

export type GameSoundOptions = {
  intensity?: number;
  pan?: number;
  running?: boolean;
  /**
   * Floors are built from different materials, and every one of them sounded
   * like the same ward tile. Basement services is bare screed, research is
   * sheet vinyl over slab, the annex is steel grating.
   */
  surface?: "tile" | "asphalt" | "gravel" | "concrete" | "vinyl" | "grating";
  weapon?: "axe" | "unarmed";
};

type AudioContextConstructor = typeof AudioContext;
type MusicChapter =
  | "hospital"
  | "street"
  | "station"
  | "checkpoint"
  | "depot"
  | "escape"
  | "survival";

type MusicRig = {
  chapter: MusicChapter;
  audio: HTMLAudioElement;
};

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as typeof window & {
      webkitAudioContext?: AudioContextConstructor;
    }).webkitAudioContext ??
    null
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * How many variants of each vocalisation are baked. Repetition is the second
 * biggest "that is a game sound" tell after perfect periodicity — the ear locks
 * onto an identical spectrum within two or three plays — so each event draws
 * from a small pool rather than replaying one buffer.
 */
const VOICE_VARIANTS = 4;

/**
 * Recorded one-shots, sliced from the Pixabay sources listed in
 * public/models/THIRD_PARTY.md.
 *
 * These cover the moments a real recording beats synthesis — the scream, the
 * lunge landing, the death, the player being hurt. The frequent, low-level
 * cues (breathing, the windup before a swing, the wet impact itself) stay
 * procedural, because they fire constantly and generated variants never repeat
 * whereas a handful of files audibly do.
 *
 * If any of these fail to load the synthesised voice is used instead, so the
 * game never falls silent over a missing asset.
 */
const VOICE_SAMPLES: Partial<Record<VoiceKind | "impact", readonly string[]>> = {
  growl: ["creatures/growl-a", "creatures/growl-b", "creatures/growl-c"],
  alert: ["creatures/growl-a", "creatures/growl-c"],
  scream: [
    "creatures/scream-a",
    "creatures/scream-b",
    "creatures/scream-c",
    "creatures/scream-d",
  ],
  pain: ["creatures/hurt-a", "creatures/hurt-b", "creatures/hurt-c"],
};

/** Recorded hits used by specific events rather than by a voice kind. */
const EVENT_SAMPLES: Partial<Record<GameSoundEvent, readonly string[]>> = {
  "zombie-attack": ["creatures/attack-a", "creatures/attack-b", "creatures/attack-c"],
  "zombie-death": ["creatures/death-a", "creatures/death-b"],
  // Weapon recordings are optional. Each of these falls back to its
  // synthesised version if the file is absent, so the slots can be filled in
  // later without touching code. See docs/AUDIO_SOURCES.md for the exact
  // CC0 items these expect.
  "axe-swing": ["weapons/axe-swing-a", "weapons/axe-swing-b"],
  "axe-flesh": ["weapons/axe-flesh-a", "weapons/axe-flesh-b", "weapons/axe-flesh-c"],
  "axe-wall": ["weapons/axe-wall-a", "weapons/axe-wall-b"],
};

export class SurvivalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private lastPlayed = new Map<GameSoundEvent, number>();
  private music: MusicRig | null = null;
  /** Base music level before ducking, so duck changes do not lose the target. */
  private musicBaseVolume = 0.14;
  /** 0 = score at full level, 1 = score pulled almost entirely out. */
  private musicDuck = 0;

  /**
   * Pull the score down when something is close. The music is a bed for
   * tension; once a creature is actually on you it should be the only thing
   * you can hear, so this ducks hard rather than politely.
   */
  setMusicDuck(amount: number) {
    this.musicDuck = clamp(amount, 0, 1);
    this.applyMusicVolume();
  }

  private applyMusicVolume() {
    if (!this.music) return;
    // Squared so the bed gets out of the way early rather than lingering at
    // half level through the part that matters.
    const ducked = this.musicBaseVolume * (1 - this.musicDuck) ** 2;
    this.music.audio.volume = clamp(ducked, 0, 1);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        enabled ? 0.78 : 0.0001,
        this.context.currentTime,
        0.018,
      );
    }
    if (this.music) {
      this.music.audio.muted = !enabled;
    }
  }

  private ensureContext() {
    if (!this.enabled) return null;
    if (!this.context) {
      const AudioContextClass = getAudioContextConstructor();
      if (!AudioContextClass) return null;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.78;
      this.master.connect(this.context.destination);
      this.primeSamples(this.context);
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return this.context;
  }

  /**
   * Baked vocalisation buffers, keyed by voice kind. Generated once on first
   * use — never on a trigger, since rendering a second of glottal source
   * through a formant bank is milliseconds of work that must not land in a
   * frame where something is attacking the player.
   */
  private voiceBank = new Map<string, AudioBuffer[]>();
  private voiceCursor = new Map<string, number>();
  /** Decoded recordings, keyed by file stem. */
  private sampleBank = new Map<string, AudioBuffer>();
  private sampleLoads = new Map<string, Promise<void>>();

  /**
   * Fetch and decode a recording. Failures are swallowed deliberately: a
   * missing or undecodable file must degrade to the synthesised voice rather
   * than throw inside a gameplay callback.
   */
  private loadSample(context: AudioContext, name: string) {
    if (this.sampleBank.has(name)) return;
    if (this.sampleLoads.has(name)) return;
    const url = new URL(`audio/${name}.ogg`, document.baseURI).toString();
    const load = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.sampleBank.set(name, buffer);
      })
      .catch(() => {
        // Leave it absent; playVoice falls back to synthesis.
      });
    this.sampleLoads.set(name, load);
  }

  /** Warm the recordings so the first growl is not the one that stutters. */
  private primeSamples(context: AudioContext) {
    for (const names of Object.values(VOICE_SAMPLES)) {
      for (const name of names ?? []) this.loadSample(context, name);
    }
    for (const names of Object.values(EVENT_SAMPLES)) {
      for (const name of names ?? []) this.loadSample(context, name);
    }
  }

  /** Plays a decoded recording by stem, returning false if it is not ready. */
  private playSample(
    names: readonly string[],
    volume: number,
    pan: number,
    detune: number,
  ) {
    const context = this.ensureContext();
    if (!context) return false;
    const ready = names.filter((name) => this.sampleBank.has(name));
    if (ready.length === 0) {
      for (const name of names) this.loadSample(context, name);
      return false;
    }
    const key = names.join(",");
    const cursor =
      (this.sampleCursor.get(key) ?? 0) +
      1 +
      Math.floor(Math.random() * Math.max(1, ready.length - 1));
    const index = cursor % ready.length;
    this.sampleCursor.set(key, index);

    const source = context.createBufferSource();
    source.buffer = this.sampleBank.get(ready[index])!;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;
    const gain = context.createGain();
    gain.gain.value = volume;
    const output = this.output(context, pan);
    source.connect(gain);
    gain.connect(output);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      output.disconnect();
    };
    return true;
  }

  private sampleCursor = new Map<string, number>();

  private getVoices(context: AudioContext, kind: VoiceKind | "impact") {
    const cached = this.voiceBank.get(kind);
    if (cached) return cached;
    const buffers: AudioBuffer[] = [];
    for (let variant = 0; variant < VOICE_VARIANTS; variant += 1) {
      const seed = 101 + variant * 37 + kind.length * 11;
      const samples =
        kind === "impact"
          ? renderImpact(seed, { heavy: variant % 2 === 1 })
          : renderVoice(kind, seed);
      const buffer = context.createBuffer(
        1,
        samples.length,
        VOICE_SAMPLE_RATE,
      );
      buffer.getChannelData(0).set(samples);
      buffers.push(buffer);
    }
    this.voiceBank.set(kind, buffers);
    return buffers;
  }

  /**
   * Plays one vocalisation. A shuffle-style cursor rather than Math.random, so
   * the same variant cannot come up twice in a row — which is precisely the
   * case a listener notices.
   */
  private playVoice(
    kind: VoiceKind | "impact",
    volume: number,
    pan: number,
    detune = 0.06,
  ) {
    const context = this.ensureContext();
    if (!context) return;
    // Prefer a recording where one exists for this voice.
    const samples = VOICE_SAMPLES[kind];
    if (samples && this.playSample(samples, volume, pan, Math.min(detune, 0.07))) {
      return;
    }
    const buffers = this.getVoices(context, kind);
    const cursor = (this.voiceCursor.get(kind) ?? 0) + 1 +
      Math.floor(Math.random() * (buffers.length - 1));
    const index = cursor % buffers.length;
    this.voiceCursor.set(kind, index);

    const source = context.createBufferSource();
    source.buffer = buffers[index];
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;
    const gain = context.createGain();
    gain.gain.value = volume;
    const output = this.output(context, pan);
    source.connect(gain);
    gain.connect(output);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      output.disconnect();
    };
  }

  private getNoise(context: AudioContext) {
    if (this.noise) return this.noise;
    const length = Math.ceil(context.sampleRate * 1.25);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.35 + white * 0.65;
      data[index] = previous;
    }
    this.noise = buffer;
    return buffer;
  }

  private output(context: AudioContext, pan = 0) {
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    panner.connect(this.master!);
    return panner;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    pan = 0,
    endFrequency?: number,
    delay = 0,
  ) {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const output = this.output(context, pan);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, endFrequency),
        now + duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    // Web Audio keeps a stopped node's graph alive until it is disconnected.
    // Without this every cue leaks an oscillator, a gain and a panner, which
    // over a long session accumulates into thousands of live nodes.
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      output.disconnect();
    };
  }

  private noiseBurst(
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    frequency: number,
    pan = 0,
    delay = 0,
    endFrequency?: number,
  ) {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const output = this.output(context, pan);
    source.buffer = this.getNoise(context);
    source.playbackRate.value = 0.86 + Math.random() * 0.28;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, now);
    filter.Q.value = filterType === "bandpass" ? 1.25 : 0.7;
    if (endFrequency) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        now + duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(now, Math.random() * 0.45, duration + 0.03);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      output.disconnect();
    };
  }

  playTone(
    frequency: number,
    duration = 0.08,
    volume = 0.035,
    type: OscillatorType = "sine",
  ) {
    this.tone(frequency, duration, volume, type);
  }

  startMusic(chapter: MusicChapter, intensity = 0.55) {
    if (!this.enabled || typeof window === "undefined") return;
    const normalizedIntensity = clamp(intensity, 0, 1);
    // The score sat at 0.22-0.40 while synthesized cues peak around 0.08, and
    // because it plays through a bare HTMLAudioElement it bypasses the master
    // gain entirely — so zombies were being mixed under the music to the point
    // of inaudibility. Held well below the effects bus until the music is
    // routed through the AudioContext and can be ducked properly.
    const targetVolume = 0.1 + normalizedIntensity * 0.08;
    this.musicBaseVolume = targetVolume;
    const playbackRate = 0.985 + normalizedIntensity * 0.025;
    if (this.music) {
      this.music.chapter = chapter;
      this.applyMusicVolume();
      this.music.audio.playbackRate = playbackRate;
      this.music.audio.muted = false;
      if (this.music.audio.paused) {
        void this.music.audio.play().catch(() => {
          // A later player input retries playback after browser autoplay blocking.
        });
      }
      return;
    }

    const audio = new Audio(
      new URL("audio/dissonant-horror-loop.ogg", document.baseURI).toString(),
    );
    audio.loop = true;
    audio.preload = "auto";
    audio.playbackRate = playbackRate;
    this.music = { chapter, audio };
    this.applyMusicVolume();
    void audio.play().catch(() => {
      // Browsers may wait for the first gameplay input before starting media.
    });
  }

  stopMusic() {
    if (!this.music) return;
    this.music.audio.pause();
    this.music.audio.currentTime = 0;
    this.music = null;
  }

  play(event: GameSoundEvent, options: GameSoundOptions = {}) {
    if (!this.enabled) return;
    if (this.music?.audio.paused) {
      void this.music.audio.play().catch(() => {
        // Keep sound effects available even if media playback remains blocked.
      });
    }
    const now = performance.now();
    const minimumGap =
      event === "footstep"
        ? options.running
          ? 205
          : 315
        : event === "zombie-alert"
          ? 900
          : event === "zombie-growl"
            ? 420
          : event === "heartbeat"
            ? 380
            : event === "radio-static"
              ? 950
              : event === "zombie-breath"
                ? 1300
                : event === "zombie-scream"
                  ? 2600
                  : event === "zombie-lunge"
                    ? 420
          : 25;
    if (now - (this.lastPlayed.get(event) ?? -Infinity) < minimumGap) return;
    this.lastPlayed.set(event, now);

    const pan = clamp(options.pan ?? 0, -1, 1);
    const intensity = clamp(options.intensity ?? 1, 0.08, 1.25);

    if (event === "footstep") {
      const surface = options.surface ?? "tile";
      // Per-surface contact frequency, body weight and tail. Hard glazed floors
      // ring high and long; screed is dull and dead; grating rattles.
      const profile =
        surface === "tile"
          ? { hz: 1250, thump: 62, tail: 0, tailHz: 0 }
          : surface === "concrete"
            ? { hz: 780, thump: 54, tail: 0, tailHz: 0 }
            : surface === "vinyl"
              ? { hz: 560, thump: 58, tail: 0.24, tailHz: 320 }
              : surface === "grating"
                ? { hz: 2100, thump: 74, tail: 0.5, tailHz: 3400 }
                : surface === "gravel"
                  ? { hz: 720, thump: 58, tail: 0.42, tailHz: 1800 }
                  : { hz: 440, thump: 62, tail: 0, tailHz: 0 };
      const volume = (options.running ? 0.085 : 0.055) * intensity;
      // A little scatter per step, so a corridor does not become a metronome.
      const scatter = 1 + (Math.random() * 2 - 1) * 0.12;
      this.noiseBurst(
        0.085,
        volume * scatter,
        "bandpass",
        profile.hz * scatter,
        pan,
        0,
        170,
      );
      this.tone(
        (options.running ? profile.thump * 1.2 : profile.thump) * scatter,
        0.09,
        volume * 0.55,
        "sine",
        pan,
        42,
      );
      if (profile.tail > 0) {
        this.noiseBurst(
          0.14,
          volume * profile.tail,
          "highpass",
          profile.tailHz,
          pan,
          0.025,
        );
      }
      return;
    }

    if (event === "attack-swing") {
      const axe = options.weapon === "axe";
      this.noiseBurst(
        axe ? 0.24 : 0.15,
        (axe ? 0.085 : 0.05) * intensity,
        "bandpass",
        axe ? 2300 : 1350,
        pan,
        0,
        axe ? 320 : 220,
      );
      if (axe) {
        this.tone(178, 0.12, 0.025 * intensity, "triangle", pan, 96, 0.04);
      }
      return;
    }

    if (event === "dodge") {
      this.noiseBurst(0.2, 0.055 * intensity, "highpass", 760, pan, 0, 220);
      return;
    }

    // The zombie voice family carries most of the game's threat information, so
    // it sits well forward in the mix rather than under the score.
    // Creature voices are now baked glottal-source vocalisations rather than
    // stacked oscillators. See voice.ts for why.
    if (event === "zombie-alert") {
      this.playVoice("alert", 0.5 * intensity, pan);
      return;
    }

    if (event === "zombie-growl") {
      this.playVoice("growl", 0.62 * intensity, pan);
      return;
    }

    if (event === "zombie-attack") {
      // Recorded snarl if available, with the synthesised wet impact layered
      // underneath either way — the recording carries the voice, the synthesis
      // carries the blow landing on the player's body.
      const attackSamples = EVENT_SAMPLES["zombie-attack"];
      if (!attackSamples || !this.playSample(attackSamples, 0.8 * intensity, pan, 0.07)) {
        this.playVoice("lunge", 0.4 * intensity, pan);
      }
      this.playVoice("impact", 0.62 * intensity, pan, 0.1);
      return;
    }

    if (event === "zombie-hit") {
      this.playVoice("impact", 0.8 * intensity, pan, 0.12);
      return;
    }

    if (event === "zombie-death") {
      const deathSamples = EVENT_SAMPLES["zombie-death"];
      if (!deathSamples || !this.playSample(deathSamples, 0.82 * intensity, pan, 0.08)) {
        this.playVoice("breath", 0.72 * intensity, pan, 0.14);
        this.playVoice("growl", 0.4 * intensity, pan, 0.16);
      }
      return;
    }

    // Windup, played roughly a third of a second before the blow lands. Rising
    // pitch so it reads as "something is about to happen" rather than as
    // another growl in the mix.
    if (event === "zombie-lunge") {
      this.playVoice("lunge", 0.78 * intensity, pan);
      return;
    }

    // Wet, close-range breathing. Only ever triggered by proximity, so hearing
    // it at all means something is near enough to matter.
    if (event === "zombie-breath") {
      this.playVoice("breath", 0.55 * intensity, pan, 0.1);
      return;
    }

    // Runner acquiring the player. Deliberately the loudest thing in the game.
    if (event === "zombie-scream") {
      this.playVoice("scream", 0.82 * intensity, pan, 0.05);
      return;
    }

    // Two-stage wave telegraph: a distant structural groan when the countdown
    // opens, then a harder alarm doublet just before the doors give.
    if (event === "wave-warning") {
      this.tone(44, 1.5, 0.125 * intensity, "sine", pan, 33);
      this.tone(67, 1.25, 0.03 * intensity, "triangle", pan, 51, 0.08);
      this.noiseBurst(1.35, 0.03 * intensity, "lowpass", 210, pan, 0.05, 95);
      this.noiseBurst(0.5, 0.022 * intensity, "bandpass", 1750, pan, 0.5, 900);
      return;
    }

    if (event === "wave-imminent") {
      for (let index = 0; index < 2; index += 1) {
        const delay = index * 0.34;
        this.tone(784, 0.2, 0.15 * intensity, "square", pan, undefined, delay);
        this.tone(523, 0.24, 0.11 * intensity, "sawtooth", pan, undefined, delay + 0.02);
      }
      this.noiseBurst(0.32, 0.04 * intensity, "highpass", 2400, pan, 0.06);
      return;
    }

    // A fire axe is a heavy steel head on a long haft. The swing is a broad
    // low whoosh that rises as the head accelerates, not the short hiss a
    // generic melee cue uses.
    if (event === "axe-swing") {
      this.noiseBurst(0.34, 0.075 * intensity, "bandpass", 260, pan, 0, 900);
      this.noiseBurst(0.22, 0.04 * intensity, "highpass", 1400, pan, 0.08);
      this.tone(150, 0.26, 0.026 * intensity, "sine", pan, 78, 0.04);
      return;
    }

    // Burying it in a body: a blunt crack through bone, the wet impact, and a
    // short metallic ring off the head.
    if (event === "axe-flesh") {
      this.playVoice("impact", 0.92 * intensity, pan, 0.09);
      this.noiseBurst(0.09, 0.11 * intensity, "bandpass", 2100, pan, 0, 420);
      this.tone(96, 0.2, 0.09 * intensity, "sine", pan, 42, 0.012);
      this.tone(1730, 0.13, 0.022 * intensity, "triangle", pan, 1180, 0.016);
      return;
    }

    // Missing, and hitting tile or steel instead: a bright ring with no wet
    // component at all, which is what tells the player they whiffed.
    if (event === "axe-wall") {
      this.noiseBurst(0.06, 0.1 * intensity, "highpass", 3200, pan);
      this.tone(2450, 0.34, 0.05 * intensity, "triangle", pan, 1850, 0.008);
      this.tone(1290, 0.42, 0.036 * intensity, "sine", pan, 940, 0.012);
      this.tone(184, 0.14, 0.05 * intensity, "sine", pan, 96);
      return;
    }

    if (event === "player-breath") {
      // Reuses the creature breath model at a human tract length and pitch, so
      // the player sounds like a person out of air rather than a wind sample.
      this.playVoice("gasp", 0.3 * intensity, 0, 0.14);
      return;
    }

    if (event === "player-hit") {
      // The player is a person: an involuntary grunt plus the impact on their
      // own body, not a filtered thud.
      this.playVoice("pain", 0.78 * intensity, 0);
      this.playVoice("impact", 0.6 * intensity, 0, 0.1);
      if (Math.random() < 0.35) this.playVoice("gasp", 0.5 * intensity, 0);
      return;
    }

    if (event === "pickup") {
      this.tone(330, 0.1, 0.035 * intensity, "triangle", pan, 520);
      this.tone(495, 0.13, 0.026 * intensity, "sine", pan, 690, 0.055);
      return;
    }

    if (event === "objective") {
      this.tone(392, 0.14, 0.034 * intensity, "triangle", pan, 523);
      this.tone(587, 0.19, 0.028 * intensity, "sine", pan, 784, 0.09);
      return;
    }

    if (event === "heal") {
      this.tone(260, 0.2, 0.03 * intensity, "sine", pan, 520);
      this.tone(390, 0.22, 0.024 * intensity, "sine", pan, 720, 0.08);
      return;
    }

    if (event === "generator") {
      for (let index = 0; index < 4; index += 1) {
        this.tone(
          48 + index * 3,
          0.14,
          0.055 * intensity,
          "square",
          pan,
          39,
          index * 0.13,
        );
        this.noiseBurst(
          0.09,
          0.04 * intensity,
          "lowpass",
          420,
          pan,
          index * 0.13,
          120,
        );
      }
      return;
    }

    if (event === "wave") {
      this.tone(92, 0.5, 0.055 * intensity, "sawtooth", pan, 138);
      this.tone(138, 0.46, 0.04 * intensity, "triangle", pan, 207, 0.12);
      return;
    }

    if (event === "gunshot") {
      this.noiseBurst(0.12, 0.19 * intensity, "highpass", 1550, pan);
      this.tone(118, 0.16, 0.12 * intensity, "square", pan, 48);
      this.noiseBurst(0.36, 0.052 * intensity, "bandpass", 760, pan, 0.07, 190);
      return;
    }

    if (event === "dry-fire") {
      this.noiseBurst(0.035, 0.035 * intensity, "highpass", 2600, pan);
      this.tone(920, 0.035, 0.022 * intensity, "square", pan, 520);
      return;
    }

    if (event === "combo") {
      this.tone(330, 0.08, 0.025 * intensity, "triangle", pan, 430);
      this.tone(495, 0.1, 0.018 * intensity, "sine", pan, 660, 0.045);
      return;
    }

    if (event === "heartbeat") {
      this.tone(54, 0.13, 0.075 * intensity, "sine", pan, 42);
      this.tone(48, 0.11, 0.058 * intensity, "sine", pan, 37, 0.18);
      return;
    }

    if (event === "horror-sting") {
      this.tone(610, 0.7, 0.052 * intensity, "sawtooth", pan, 52);
      this.tone(177, 0.86, 0.064 * intensity, "triangle", pan, 31, 0.03);
      this.noiseBurst(0.42, 0.054 * intensity, "bandpass", 1820, pan, 0.02, 180);
      return;
    }

    if (event === "metal-slam") {
      this.noiseBurst(0.18, 0.16 * intensity, "highpass", 1250, pan, 0, 210);
      this.tone(124, 0.72, 0.11 * intensity, "square", pan, 37);
      this.tone(248, 0.34, 0.045 * intensity, "triangle", pan, 62, 0.03);
      return;
    }

    if (event === "radio-static") {
      this.noiseBurst(0.48, 0.068 * intensity, "bandpass", 2100, pan, 0, 340);
      this.tone(880, 0.08, 0.026 * intensity, "square", pan, 330, 0.12);
    }
  }

  close() {
    this.stopMusic();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.noise = null;
  }
}
