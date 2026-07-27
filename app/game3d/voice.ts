// Procedural creature and human vocalisations.
//
// Everything here is synthesised from scratch — no recordings, so there is no
// third-party licence to carry. The previous cues were oscillators at fixed
// pitches, which is why they read as a synthesiser: a steady waveform has
// literally zero cycle-to-cycle variation, and that perfect periodicity is the
// single strongest cue the ear uses to decide "machine".
//
// A voice instead needs a glottal source with per-cycle perturbation, passed
// through a vocal tract. Both are generated here sample by sample and baked
// into finished buffers at load, so playing one at runtime costs a single
// buffer source rather than a filter bank per voice.

/** Buffers are rendered at half rate; the browser resamples for free. */
export const VOICE_SAMPLE_RATE = 22050;

type Random = () => number;

function rng(seed: number): Random {
  let value = seed >>> 0 || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function gaussian(random: Random) {
  const u = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/**
 * Rosenberg model C glottal flow: a slow opening phase and a faster closing
 * one, then a closed phase. The caller differentiates the result, because lip
 * radiation differentiates the flow and the sharp spike at the moment of
 * glottal closure is what carries the buzz of a real voice.
 */
function rosenberg(phase: number, openQuotient: number, speedQuotient: number) {
  if (phase >= openQuotient) return 0;
  const t1 = (openQuotient * speedQuotient) / (1 + speedQuotient);
  const t2 = openQuotient / (1 + speedQuotient);
  if (phase <= t1) return 0.5 * (1 - Math.cos((Math.PI * phase) / t1));
  return Math.cos((Math.PI * (phase - t1)) / (2 * t2));
}

type SourceOptions = {
  length: number;
  f0Start: number;
  f0End: number;
  jitter?: number;
  shimmer?: number;
  flutter?: number;
  openQuotient?: number;
  speedQuotient?: number;
  /** Period doubling depth. Puts energy at f0/2 — a bigger, sicker throat. */
  doubling?: number;
  /** Logistic-map chaos depth. Structured breakdown, not random noise. */
  chaos?: number;
  seed: number;
};

/**
 * Voiced excitation carrying the non-linear phenomena that distress
 * vocalisations use across species. Pitch perturbation is a correlated random
 * walk plus three incommensurate flutter sinusoids: pure noise reads as a
 * broken oscillator, a pure low-frequency oscillator reads as vibrato, and only
 * the combination reads as alive.
 */
function glottalSource(options: SourceOptions) {
  const {
    length,
    f0Start,
    f0End,
    jitter = 0.03,
    shimmer = 0.2,
    flutter = 30,
    openQuotient = 0.4,
    speedQuotient = 3,
    doubling = 0,
    chaos = 0,
    seed,
  } = options;
  const random = rng(seed);
  const flow = new Float32Array(length);

  let phase = 0;
  let cycle = 0;
  let jitterState = 0;
  let shimmerState = 0;
  let chaosState = 0.41;
  let periodScale = 1;
  let cycleGain = 1;
  let cycleOq = openQuotient;

  for (let index = 0; index < length; index += 1) {
    const progress = index / length;
    const seconds = index / VOICE_SAMPLE_RATE;
    const glide = f0Start * Math.pow(f0End / f0Start, progress);
    const flutterTerm =
      ((flutter / 100) *
        (Math.sin(2 * Math.PI * 12.7 * seconds) +
          Math.sin(2 * Math.PI * 7.1 * seconds) +
          Math.sin(2 * Math.PI * 4.7 * seconds))) /
      3;
    phase += (glide * (1 + flutterTerm)) / periodScale / VOICE_SAMPLE_RATE;

    if (phase >= 1) {
      phase -= 1;
      cycle += 1;
      // Jitter and shimmer share an aerodynamic cause, so they are driven from
      // a common term rather than being independent.
      const common = gaussian(random);
      jitterState = 0.85 * jitterState + 0.53 * jitter * common;
      shimmerState =
        0.85 * shimmerState +
        0.53 * shimmer * (0.5 * common + 0.5 * gaussian(random));
      periodScale = 1 + jitterState;
      cycleGain = 1 + shimmerState;
      cycleOq = openQuotient * (1 + 0.16 * (random() * 2 - 1));

      if (doubling > 0 && cycle % 2 === 0) {
        cycleGain *= 1 - doubling;
        periodScale *= 1 + doubling * 0.14;
      }
      if (chaos > 0) {
        chaosState = 3.94 * chaosState * (1 - chaosState);
        periodScale *= 1 + chaos * (chaosState - 0.5) * 1.2;
        cycleGain *= 1 - chaos * 0.5 + chaos * chaosState;
      }
    }
    flow[index] = rosenberg(phase, cycleOq, speedQuotient) * cycleGain;
  }

  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    out[index] = flow[index] - (index > 0 ? flow[index - 1] : 0);
  }
  return out;
}

function bandpass(
  input: Float32Array,
  centreHz: number,
  q: number,
  gain: number,
  out: Float32Array,
) {
  const w0 = (2 * Math.PI * Math.min(centreHz, VOICE_SAMPLE_RATE * 0.45)) /
    VOICE_SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < input.length; index += 1) {
    const x0 = input[index];
    const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    out[index] += y0 * gain;
  }
}

/** [centre Hz, bandwidth Hz, level in dB relative to F1] */
type Formant = readonly [number, number, number];

/**
 * The vocal tract, as a parallel bank of resonances.
 *
 * `scale` below 1 lengthens the implied tract. Formant spacing is an honest cue
 * to body size — the tract is bounded by skull and neck, so it cannot be faked
 * — which is why scaling formants down while leaving pitch alone reads as a
 * physically larger animal, whereas simply pitching everything down reads as a
 * recording played slowly. Bandwidths scale sublinearly, or the result is
 * hollow and artificially resonant.
 */
function formantBank(
  source: Float32Array,
  formants: readonly Formant[],
  scale = 1,
) {
  const out = new Float32Array(source.length);
  for (const [hz, bandwidth, db] of formants) {
    const centre = hz * scale;
    const width = bandwidth * Math.pow(scale, 0.7);
    bandpass(source, centre, centre / width, Math.pow(10, db / 20), out);
  }
  return out;
}

function noise(length: number, seed: number, colour = 0.42) {
  const random = rng(seed);
  const out = new Float32Array(length);
  let previous = 0;
  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    previous = previous * colour + white * (1 - colour);
    out[index] = previous;
  }
  return out;
}

/**
 * Amplitude modulation in the 30-150 Hz band. This specific band is what makes
 * a scream frightening rather than merely loud, and it is the acoustic feature
 * that distinguishes screams from all other human vocalisation.
 */
function applyRoughness(
  buffer: Float32Array,
  hz: number,
  depth: number,
  seed: number,
) {
  const random = rng(seed);
  let modPhase = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    modPhase +=
      (hz * (1 + 0.08 * (random() * 2 - 1))) / VOICE_SAMPLE_RATE;
    buffer[index] *= 1 - depth * 0.5 * (1 - Math.cos(2 * Math.PI * modPhase));
  }
}

function applyEnvelope(
  buffer: Float32Array,
  attack: number,
  release: number,
) {
  const attackSamples = Math.max(1, Math.floor(attack * VOICE_SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(release * VOICE_SAMPLE_RATE));
  const length = buffer.length;
  for (let index = 0; index < length; index += 1) {
    let gain = 1;
    if (index < attackSamples) gain = (index / attackSamples) ** 1.4;
    else if (index > length - releaseSamples) {
      gain = ((length - index) / releaseSamples) ** 1.6;
    }
    buffer[index] *= gain;
  }
}

function normalise(buffer: Float32Array) {
  let peak = 0;
  for (const value of buffer) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) {
    for (let index = 0; index < buffer.length; index += 1) buffer[index] /= peak;
  }
  return buffer;
}

// Formant tables. Low, closely spaced formants read as a large chest cavity;
// the scream's boosted F3/F4 cluster sits on the ear-canal resonance, which is
// why a scream cuts through regardless of how loud anything else is.
const GROWL_FORMANTS: readonly Formant[] = [
  [285, 75, 0],
  [700, 110, -4],
  [1580, 220, -12],
  [2800, 350, -20],
];
const SCREAM_FORMANTS: readonly Formant[] = [
  [950, 130, 0],
  [1700, 160, -3],
  [2900, 220, 6],
  [3900, 300, 4],
];
const BREATH_FORMANTS: readonly Formant[] = [
  [500, 200, 0],
  [1300, 300, -5],
  [2400, 400, -11],
  [3600, 600, -16],
];
const PAIN_FORMANTS: readonly Formant[] = [
  [500, 100, 0],
  [1180, 120, -3],
  [2400, 180, -10],
];

export type VoiceKind =
  | "growl"
  | "alert"
  | "scream"
  | "breath"
  | "lunge"
  | "pain"
  | "gasp";

function seconds(value: number) {
  return Math.floor(value * VOICE_SAMPLE_RATE);
}

function mixSourceAndAir(
  source: Float32Array,
  air: Float32Array,
  airGain: number,
  voiceGain = 1,
) {
  const out = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    out[index] = source[index] * voiceGain + air[index] * airGain;
  }
  return out;
}

/** Renders one finished vocalisation. Called at load, never on a trigger. */
export function renderVoice(kind: VoiceKind, seed: number): Float32Array {
  if (kind === "growl" || kind === "alert") {
    const distant = kind === "alert";
    const length = seconds(distant ? 1.15 : 0.95);
    const source = glottalSource({
      length,
      f0Start: distant ? 88 : 74,
      f0End: distant ? 66 : 58,
      jitter: 0.035,
      shimmer: 0.22,
      flutter: 34,
      openQuotient: 0.3,
      speedQuotient: 5,
      doubling: 0.5,
      seed,
    });
    // Mixed before the tract, so voiced and turbulent energy share its
    // colouring. Filtering them separately is what makes two layers read as
    // two synth parts rather than one throat.
    const mixed = mixSourceAndAir(source, noise(length, seed + 1), 0.12);
    const voiced = formantBank(mixed, GROWL_FORMANTS, distant ? 0.86 : 0.78);
    normalise(voiced);
    applyEnvelope(voiced, distant ? 0.16 : 0.09, distant ? 0.45 : 0.34);
    return voiced;
  }

  if (kind === "scream") {
    const length = seconds(1.05);
    const source = glottalSource({
      length,
      f0Start: 320,
      f0End: 470,
      jitter: 0.05,
      shimmer: 0.26,
      flutter: 40,
      openQuotient: 0.36,
      speedQuotient: 4,
      doubling: 0.25,
      chaos: 0.5,
      seed,
    });
    const mixed = mixSourceAndAir(source, noise(length, seed + 1), 0.3);
    const voiced = formantBank(mixed, SCREAM_FORMANTS, 1);
    applyRoughness(voiced, 78, 0.6, seed);
    normalise(voiced);
    applyEnvelope(voiced, 0.02, 0.4);
    return voiced;
  }

  if (kind === "lunge") {
    // A short, rising, strangled bark. Rising pitch is what makes it read as
    // an action beginning rather than a creature idling.
    const length = seconds(0.42);
    const source = glottalSource({
      length,
      f0Start: 96,
      f0End: 190,
      jitter: 0.06,
      shimmer: 0.3,
      flutter: 38,
      openQuotient: 0.28,
      speedQuotient: 5.5,
      doubling: 0.34,
      chaos: 0.35,
      seed,
    });
    const mixed = mixSourceAndAir(source, noise(length, seed + 1), 0.22);
    const voiced = formantBank(mixed, GROWL_FORMANTS, 0.9);
    applyRoughness(voiced, 96, 0.45, seed);
    normalise(voiced);
    applyEnvelope(voiced, 0.012, 0.18);
    return voiced;
  }

  if (kind === "breath") {
    const length = seconds(0.8);
    const source = glottalSource({
      length,
      f0Start: 58,
      f0End: 46,
      jitter: 0.09,
      shimmer: 0.32,
      flutter: 45,
      openQuotient: 0.75,
      speedQuotient: 1.7,
      doubling: 0.55,
      seed,
    });
    const mixed = mixSourceAndAir(
      source,
      noise(length, seed + 1, 0.3),
      1,
      0.22,
    );
    const voiced = formantBank(mixed, BREATH_FORMANTS, 0.95);
    // Well below the roughness band, so it reads as fluid in the airway rather
    // than as fear.
    applyRoughness(voiced, 26, 0.42, seed);
    normalise(voiced);
    applyEnvelope(voiced, 0.2, 0.34);
    return voiced;
  }

  if (kind === "gasp") {
    // Noise only, with the envelope inverted: a slow draw cut off abruptly.
    // That terminal cutoff is the whole perceptual signature of a gasp.
    const length = seconds(0.36);
    const air = noise(length, seed, 0.2);
    const out = formantBank(air, BREATH_FORMANTS, 1.12);
    const rise = Math.floor(length * 0.72);
    for (let index = 0; index < length; index += 1) {
      const gain =
        index < rise
          ? (index / rise) ** 1.8
          : Math.max(0, 1 - (index - rise) / (length - rise)) ** 0.6;
      out[index] *= gain;
    }
    normalise(out);
    return out;
  }

  // Pain: an involuntary grunt. Pitch falls because the sound is terminated by
  // running out of air; a rising contour would read as effort, not injury.
  const length = seconds(0.34);
  const source = glottalSource({
    length,
    f0Start: 142,
    f0End: 98,
    jitter: 0.03,
    shimmer: 0.14,
    flutter: 22,
    openQuotient: 0.35,
    speedQuotient: 3.4,
    doubling: 0.12,
    seed,
  });
  const air = noise(length, seed + 1);
  const mixed = new Float32Array(length);
  const gateStart = VOICE_SAMPLE_RATE * 0.018;
  const gateLength = VOICE_SAMPLE_RATE * 0.02;
  for (let index = 0; index < length; index += 1) {
    // Aspiration leads the voicing by about 18 ms — the air leaving before the
    // folds engage. Without it the grunt starts too cleanly to be involuntary.
    const gate = Math.min(1, Math.max(0, (index - gateStart) / gateLength));
    mixed[index] = source[index] * gate + air[index] * 0.34;
  }
  const voiced = formantBank(mixed, PAIN_FORMANTS, 1);
  normalise(voiced);
  applyEnvelope(voiced, 0.014, 0.2);
  return voiced;
}

/**
 * Wet impact: a crack transient, a pitched thud for mass, and a squelch tail.
 * Layer onsets are staggered by a few milliseconds — perfectly coincident
 * onsets read as one synthetic event, whereas a small offset reads as a
 * physical object with parts.
 */
export function renderImpact(
  seed: number,
  options: { heavy?: boolean; bladed?: boolean } = {},
): Float32Array {
  const { heavy = false, bladed = false } = options;
  const length = seconds(heavy ? 0.55 : 0.42);
  const random = rng(seed);
  const out = new Float32Array(length);

  // Approach: a breath of air before contact. A perfectly clean attack is one
  // of the clearest tells of a synthetic impact.
  const approach = noise(length, seed + 7, 0.5);
  const approachSamples = seconds(0.03);
  for (let index = 0; index < approachSamples; index += 1) {
    out[index] += approach[index] * 0.05 * (index / approachSamples);
  }

  // Crack, offset a few samples so it does not land exactly with the thud.
  const crackStart = seconds(0.004);
  const crackNoise = noise(length, seed + 1, 0.1);
  const crackBand = formantBank(crackNoise, [[bladed ? 3400 : 2600, 1400, 0]], 1);
  const crackDecay = VOICE_SAMPLE_RATE * (bladed ? 0.006 : 0.0035);
  for (let index = crackStart; index < length; index += 1) {
    const t = index - crackStart;
    out[index] += crackBand[index] * Math.exp(-t / crackDecay) * 0.9;
  }

  // Body: an exponential pitch chirp. Its speed is the perceptual cue — under
  // about 80 ms it reads as a punch, over 200 ms as a synth drum.
  const thudStart = seconds(0.001);
  const chirpTime = heavy ? 0.07 : 0.045;
  const startHz = heavy ? 200 : 175;
  const endHz = heavy ? 44 : 55;
  let thudPhase = 0;
  for (let index = thudStart; index < length; index += 1) {
    const t = (index - thudStart) / VOICE_SAMPLE_RATE;
    const hz = startHz * Math.pow(endHz / startHz, Math.min(1, t / chirpTime));
    thudPhase += hz / VOICE_SAMPLE_RATE;
    const decay = Math.exp(-t / (heavy ? 0.16 : 0.1));
    const body =
      Math.sin(2 * Math.PI * thudPhase) +
      0.4 * Math.sin(2 * Math.PI * thudPhase * 0.63);
    out[index] += body * decay * (bladed ? 0.32 : 0.95);
  }

  // Squelch: a comb whose delay shortens, so its resonance rises. A rising
  // resonance reads unmistakably as something viscous being squeezed closed.
  const wetStart = seconds(0.008);
  const wetNoise = noise(length, seed + 3, 0.55);
  const wet = new Float32Array(length);
  const feedback = 0.66;
  for (let index = wetStart; index < length; index += 1) {
    const t = (index - wetStart) / VOICE_SAMPLE_RATE;
    const sweep = Math.min(1, t / 0.18);
    const delaySamples = Math.max(
      2,
      Math.round((0.014 * Math.pow(0.006 / 0.014, sweep)) * VOICE_SAMPLE_RATE),
    );
    const tapped = index - delaySamples >= 0 ? wet[index - delaySamples] : 0;
    wet[index] =
      wetNoise[index] * Math.exp(-t / 0.14) * 0.5 + tapped * feedback;
    out[index] += wet[index] * 0.55;
  }

  // Grains, for the tearing component.
  const grainCount = heavy ? 16 : 10;
  for (let grain = 0; grain < grainCount; grain += 1) {
    const at = seconds(0.02 + random() * 0.22);
    const grainLength = seconds(0.006 + random() * 0.012);
    const hz = 900 + random() * 1800;
    for (let index = 0; index < grainLength && at + index < length; index += 1) {
      const window = Math.sin((Math.PI * index) / grainLength);
      out[at + index] +=
        Math.sin((2 * Math.PI * hz * index) / VOICE_SAMPLE_RATE) *
        window *
        0.09 *
        (1 - grain / grainCount);
    }
  }

  // Damping is frequency dependent in the real world and not in a synthesiser,
  // so the whole sum is swept down. This does more to make an impact read as
  // physical than any single layer.
  let low = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / length;
    const cutoff = 6000 * Math.pow(700 / 6000, t);
    const coeff = Math.exp((-2 * Math.PI * cutoff) / VOICE_SAMPLE_RATE);
    low = low * coeff + out[index] * (1 - coeff);
    out[index] = low;
  }

  normalise(out);
  applyEnvelope(out, 0.0005, heavy ? 0.14 : 0.1);
  return out;
}
