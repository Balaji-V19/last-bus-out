export type GameSoundEvent =
  | "footstep"
  | "attack-swing"
  | "dodge"
  | "zombie-alert"
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
  | "radio-static";

export type GameSoundOptions = {
  intensity?: number;
  pan?: number;
  running?: boolean;
  surface?: "tile" | "asphalt" | "gravel";
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

export class SurvivalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private lastPlayed = new Map<GameSoundEvent, number>();
  private music: MusicRig | null = null;

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
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return this.context;
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
    const targetVolume = 0.22 + normalizedIntensity * 0.18;
    const playbackRate = 0.985 + normalizedIntensity * 0.025;
    if (this.music) {
      this.music.chapter = chapter;
      this.music.audio.volume = targetVolume;
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
    audio.volume = targetVolume;
    audio.playbackRate = playbackRate;
    this.music = { chapter, audio };
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
          : event === "heartbeat"
            ? 380
            : event === "radio-static"
              ? 950
          : 25;
    if (now - (this.lastPlayed.get(event) ?? -Infinity) < minimumGap) return;
    this.lastPlayed.set(event, now);

    const pan = clamp(options.pan ?? 0, -1, 1);
    const intensity = clamp(options.intensity ?? 1, 0.08, 1.25);

    if (event === "footstep") {
      const surface = options.surface ?? "asphalt";
      const frequency =
        surface === "tile" ? 1250 : surface === "gravel" ? 720 : 440;
      const volume = (options.running ? 0.085 : 0.055) * intensity;
      this.noiseBurst(0.085, volume, "bandpass", frequency, pan, 0, 170);
      this.tone(
        options.running ? 74 : 62,
        0.09,
        volume * 0.55,
        "sine",
        pan,
        42,
      );
      if (surface === "gravel") {
        this.noiseBurst(0.14, volume * 0.42, "highpass", 1800, pan, 0.025);
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

    if (event === "zombie-alert") {
      this.tone(104, 0.68, 0.052 * intensity, "sawtooth", pan, 48);
      this.tone(71, 0.74, 0.036 * intensity, "triangle", pan, 43, 0.035);
      this.noiseBurst(0.5, 0.022 * intensity, "lowpass", 560, pan, 0.04, 170);
      return;
    }

    if (event === "zombie-attack") {
      this.tone(128, 0.28, 0.06 * intensity, "sawtooth", pan, 63);
      this.noiseBurst(0.2, 0.07 * intensity, "bandpass", 840, pan, 0.03, 210);
      return;
    }

    if (event === "zombie-hit") {
      this.tone(82, 0.15, 0.065 * intensity, "sine", pan, 39);
      this.noiseBurst(0.18, 0.085 * intensity, "lowpass", 680, pan, 0, 160);
      this.noiseBurst(0.08, 0.035 * intensity, "highpass", 2100, pan, 0.018);
      return;
    }

    if (event === "zombie-death") {
      this.tone(92, 0.82, 0.065 * intensity, "sawtooth", pan, 31);
      this.tone(58, 0.9, 0.035 * intensity, "triangle", pan, 25, 0.04);
      this.noiseBurst(0.25, 0.07 * intensity, "lowpass", 360, pan, 0.58, 90);
      return;
    }

    if (event === "player-hit") {
      this.tone(63, 0.2, 0.095 * intensity, "sine", pan, 34);
      this.noiseBurst(0.19, 0.08 * intensity, "bandpass", 520, pan, 0, 125);
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
