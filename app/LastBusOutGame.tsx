"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GameViewportHandle } from "./GameViewport3D";
import {
  SurvivalAudio,
  type GameSoundEvent,
  type GameSoundOptions,
} from "./game3d/audio";
import type { EquipmentKind, GameChapter } from "./game3d/scene";
import type { PointOfView } from "./GameViewport3D";

type Mode = "menu" | "playing" | "paused" | "ending";

const loadGameViewport = () => import("./GameViewport3D");
const GameViewport3D = lazy(async () => {
  const loadedViewport = await loadGameViewport();
  return { default: loadedViewport.GameViewport3D };
});

type SaveData = {
  chapter: GameChapter;
  step: number;
  health: number;
  medicine: number;
  infection: number;
  antivirals: number;
  food: number;
  survivors: number;
  power: number;
  rescued: boolean;
  kills: number;
  ammo: number;
  hasPistol?: boolean;
};

const SAVE_KEY = "last-bus-out-st-orison-save-v3";
// Point of view is a display preference rather than campaign state, so it is
// stored separately and survives starting a new run or clearing a save.
const POV_KEY = "last-bus-out-pov";

const CHAPTERS: Record<
  GameChapter,
  { kicker: string; title: string; location: string; description: string }
> = {
  hospital: {
    kicker: "Containment Hour 01 · 05:42",
    title: "The emergency floor",
    location: "St. Orison · Ground Floor Emergency",
    description:
      "You wake among overturned beds. The doors are sealed, the staff are missing, and something is breathing beyond surgery.",
  },
  street: {
    kicker: "Containment Hour 02 · 06:11",
    title: "Voices behind the doors",
    location: "St. Orison · Floor 2 Patient Ward",
    description:
      "The ward intercom still carries human voices. Find the trapped staff before the infected find them first.",
  },
  station: {
    kicker: "Containment Hour 03 · 06:38",
    title: "The cold rooms",
    location: "St. Orison · Basement B1 Services",
    description:
      "Food and temperature-sensitive medicine are spoiling below. Restoring power will wake more than the freezers.",
  },
  checkpoint: {
    kicker: "Containment Hour 04 · 07:16",
    title: "Isolation is open",
    location: "St. Orison · Floor 3 Isolation",
    description:
      "The isolation locks failed from the inside. A family is hiding in pediatrics while altered patients roam the ward.",
  },
  depot: {
    kicker: "Containment Hour 05 · 08:03",
    title: "What they made upstairs",
    location: "St. Orison · Floor 4 Research & Pharmacy",
    description:
      "Research records mention an antiviral trial. The specimens described in those records are no longer in their pods.",
  },
  escape: {
    kicker: "Containment Hour 06 · 09:12",
    title: "Bring them home",
    location: "St. Orison · Ground Floor Safe Wing",
    description:
      "The survivors are following with the food and medicine. Clear the final corridor and seal Shelter 04 behind them.",
  },
  survival: {
    kicker: "Containment Hour 07",
    title: "The quarantine annex",
    location: "St. Orison · Restricted Annex",
    description:
      "Shelter 04 is safe for now. Hold the annex and keep each new mutation away from the people below.",
  },
};

const OBJECTIVES: Record<GameChapter, string[]> = {
  hospital: [
    "Find a working light",
    "Recover the emergency radio",
    "Take the fire axe",
    "Clear the surgical corridor",
    "Restore power to Stairwell A",
    "Survive the emergency-wing ambush",
    "Enter Stairwell A",
  ],
  street: [
    "Check the ward survivor board",
    "Reach the trapped paramedic",
    "Free the injured orderly",
    "Take the elevator to Basement B1",
  ],
  station: [
    "Start the basement generator",
    "Collect sealed food for Shelter 04",
    "Recover refrigerated antivirals",
    "Defend the cold-storage circuit",
    "Take the elevator to Floor 3",
  ],
  checkpoint: [
    "Answer the isolation intercom",
    "Restore the pediatrics door circuit",
    "Survive the isolation breach",
    "Escort the hidden family to Stairwell A",
    "Climb to Floor 4 Research",
  ],
  depot: [
    "Find the pharmacy access card",
    "Recover the antiviral trial case",
    "Collect nutrition packs",
    "Kill the research-floor mutation",
    "Return to the ground-floor safe wing",
  ],
  escape: ["Lead the survivors through the safe wing", "Seal Shelter 04"],
  survival: ["Contain the next mutation wave"],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSave(): SaveData | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(SAVE_KEY);
    return value ? (JSON.parse(value) as SaveData) : null;
  } catch {
    return null;
  }
}

export function LastBusOutGame() {
  const viewportRef = useRef<GameViewportHandle>(null);
  const audioRef = useRef<SurvivalAudio | null>(null);
  const healthRef = useRef(100);
  const infectionRef = useRef(12);
  const killsRef = useRef(0);
  const powerCompleteRef = useRef(false);
  const escapeCompleteRef = useRef(false);
  const escapeScoutRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("menu");
  const [chapter, setChapter] = useState<GameChapter>("hospital");
  const [step, setStep] = useState(0);
  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [medicine, setMedicine] = useState(0);
  const [infection, setInfection] = useState(12);
  const [antivirals, setAntivirals] = useState(0);
  const [food, setFood] = useState(0);
  const [survivors, setSurvivors] = useState(0);
  const [power, setPower] = useState(4);
  const [rescued, setRescued] = useState(false);
  const [kills, setKills] = useState(0);
  const [ammo, setAmmo] = useState(0);
  const [hasPistol, setHasPistol] = useState(false);
  const [combatCombo, setCombatCombo] = useState(0);
  const [combatScore, setCombatScore] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [pov, setPov] = useState<PointOfView>("first");
  const [waveAlert, setWaveAlert] = useState(0);
  const [aiming, setAiming] = useState(false);
  // Held in state rather than a ref so the viewport re-reads it once the canvas
  // mounts; the viewport then draws to it directly, outside React.
  const [minimapCanvas, setMinimapCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [bloodCanvas, setBloodCanvas] = useState<HTMLCanvasElement | null>(null);
  const [toast, setToast] = useState("");
  const [prompt, setPrompt] = useState<{ id: string; label: string } | null>(null);
  const [fuelProgress, setFuelProgress] = useState(0);
  const [escapeProgress, setEscapeProgress] = useState(0);
  const [survivalWave, setSurvivalWave] = useState(1);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [survivalRemaining, setSurvivalRemaining] = useState(0);
  const [dread, setDread] = useState(8);
  const [chapterCard, setChapterCard] = useState(0);
  const [hasSave, setHasSave] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [damagePulse, setDamagePulse] = useState(0);
  const [worldReady, setWorldReady] = useState(false);

  const playSound = useCallback(
    (event: GameSoundEvent, options?: GameSoundOptions) => {
      if (!soundOn || typeof window === "undefined") return;
      try {
        const audio = audioRef.current ?? new SurvivalAudio();
        audioRef.current = audio;
        audio.setEnabled(soundOn);
        audio.play(event, options);
      } catch {
        // Gameplay remains available if a browser denies audio output.
      }
    },
    [soundOn],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  const saveGame = useCallback(
    (
      nextChapter = chapter,
      nextStep = step,
      overrides: Partial<SaveData> = {},
    ) => {
      const payload: SaveData = {
        chapter: nextChapter,
        step: nextStep,
        health,
        medicine,
        infection,
        antivirals,
        food,
        survivors,
        power,
        rescued,
        kills,
        ammo,
        hasPistol,
        ...overrides,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      setHasSave(true);
    },
    [
      ammo,
      antivirals,
      chapter,
      food,
      hasPistol,
      health,
      infection,
      kills,
      medicine,
      power,
      rescued,
      step,
      survivors,
    ],
  );

  const loadChapter = useCallback(
    (nextChapter: GameChapter, nextStep = 0) => {
      setWorldReady(false);
      setChapter(nextChapter);
      setStep(nextStep);
      setPrompt(null);
      setFuelProgress(0);
      setEscapeProgress(0);
      setSurvivalWave(1);
      setSurvivalTime(0);
      setSurvivalRemaining(0);
      setDread(8);
      setCombatCombo(0);
      setCombatScore(0);
      setStamina(100);
      powerCompleteRef.current = false;
      escapeCompleteRef.current = false;
      escapeScoutRef.current = false;
      setResetToken((value) => value + 1);
      setChapterCard((value) => value + 1);
      playSound("objective");
      // Changing floor is progress, not an interruption. The player gets the
      // floor card and a note that the run is saved, and walks straight on —
      // there is no confirmation to dismiss.
      showToast("Progress saved");
      window.setTimeout(() => saveGame(nextChapter, nextStep), 0);
      // Re-take the pointer once the new floor is up, so first person does not
      // silently drop to a dead mouse after a transition.
      window.setTimeout(() => viewportRef.current?.captureLook(), 60);
    },
    [playSound, saveGame, showToast],
  );

  const advanceStep = useCallback(
    (nextStep: number) => {
      setStep(nextStep);
      saveGame(chapter, nextStep);
      playSound("objective");
    },
    [chapter, playSound, saveGame],
  );

  const resetRun = useCallback(() => {
    setWorldReady(false);
    healthRef.current = 100;
    infectionRef.current = 12;
    killsRef.current = 0;
    setHealth(100);
    setStamina(100);
    setMedicine(0);
    setInfection(12);
    setAntivirals(0);
    setFood(0);
    setSurvivors(0);
    setPower(4);
    setRescued(false);
    setKills(0);
    setAmmo(0);
    setHasPistol(false);
    setCombatCombo(0);
    setCombatScore(0);
    setMode("playing");
    setHasSave(true);
    setChapter("hospital");
    setStep(0);
    setPrompt(null);
    setFuelProgress(0);
    setEscapeProgress(0);
    setSurvivalWave(1);
    setSurvivalTime(0);
    setSurvivalRemaining(0);
    setDread(8);
    setResetToken((value) => value + 1);
    setChapterCard((value) => value + 1);
    powerCompleteRef.current = false;
    escapeCompleteRef.current = false;
    escapeScoutRef.current = false;
    playSound("objective");
  }, [playSound, setMode]);

  const continueRun = useCallback(() => {
    setWorldReady(false);
    const saved = getSave();
    if (!saved) {
      resetRun();
      return;
    }
    healthRef.current = saved.health;
    infectionRef.current = saved.infection ?? 12;
    killsRef.current = saved.kills;
    setHealth(saved.health);
    setStamina(100);
    setMedicine(saved.medicine);
    setInfection(saved.infection ?? 12);
    setAntivirals(saved.antivirals ?? 0);
    setFood(saved.food ?? 0);
    setSurvivors(saved.survivors ?? (saved.rescued ? 1 : 0));
    setPower(saved.power ?? 4);
    setRescued(saved.rescued);
    setKills(saved.kills);
    setAmmo(saved.ammo ?? 0);
    setHasPistol(saved.hasPistol ?? (saved.ammo ?? 0) > 0);
    setCombatCombo(0);
    setCombatScore(0);
    setMode("playing");
    setChapter(saved.chapter);
    setStep(saved.step);
    setResetToken((value) => value + 1);
    setChapterCard((value) => value + 1);
    setSurvivalWave(1);
    setSurvivalTime(0);
    setSurvivalRemaining(0);
    setDread(8);
    escapeScoutRef.current = saved.chapter === "escape" && saved.step > 0;
    playSound("objective");
  }, [playSound, resetRun, setMode]);

  const healWithMedicine = useCallback(() => {
    if (medicine <= 0 || healthRef.current >= 100) return;
    setMedicine((value) => Math.max(0, value - 1));
    const nextHealth = clamp(healthRef.current + 42, 0, 100);
    healthRef.current = nextHealth;
    setHealth(nextHealth);
    showToast("Trauma kit used");
    playSound("heal");
  }, [medicine, playSound, showToast]);

  const injectAntiviral = useCallback(() => {
    if (antivirals <= 0 || infectionRef.current <= 0) return;
    setAntivirals((value) => Math.max(0, value - 1));
    const nextInfection = clamp(infectionRef.current - 38, 0, 100);
    infectionRef.current = nextInfection;
    setInfection(nextInfection);
    showToast("Antiviral injected · infection suppressed");
    playSound("heal");
  }, [antivirals, playSound, showToast]);

  const handleInteraction = useCallback(
    (id: string) => {
      playSound("pickup");
      if (chapter === "hospital") {
        if (id === "torch" && step === 0) {
          advanceStep(1);
          showToast("Torch on your belt · it lights whatever you look at");
        } else if (id === "radio" && step === 1) {
          advanceStep(2);
          showToast("A survivor is calling from Floor 2");
        } else if (id === "axe" && step === 2) {
          advanceStep(3);
          showToast("Fire axe secured · press F to swing it");
        } else if (id === "breaker" && step === 4) {
          advanceStep(5);
          showToast("Stairwell power restored · something heard the breaker");
          playSound("generator");
        } else if (id === "exit" && step >= 6) {
          loadChapter("street");
        }
      } else if (chapter === "street") {
        if (id === "signal" && step === 0) {
          advanceStep(1);
          showToast("Two survivor signals marked on the ward board");
        } else if (id === "maya" && step === 1) {
          setRescued(true);
          setSurvivors((value) => value + 1);
          advanceStep(2);
          showToast("Maya rescued · she will wait in Stairwell A");
        } else if (id === "orderly" && step === 2) {
          setSurvivors((value) => value + 1);
          advanceStep(3);
          showToast("Injured orderly rescued · elevator route is clear");
        } else if (id === "pistol" && !hasPistol) {
          setHasPistol(true);
          setAmmo(12);
          showToast("Service pistol recovered · press G to fire · 12 rounds");
        } else if (id === "bike" && step >= 3) {
          loadChapter("station");
        }
      } else if (chapter === "station") {
        if (id === "generator" && step === 0) {
          advanceStep(1);
          showToast("Basement generator online · the freezers are waking");
          playSound("generator");
        } else if (id === "food" && step === 1) {
          setFood((value) => value + 4);
          advanceStep(2);
          showToast("Four sealed food packs collected");
        } else if (id === "meds" && step === 2) {
          setAntivirals((value) => value + 2);
          setMedicine((value) => Math.min(3, value + 1));
          advanceStep(3);
          showToast("Antivirals and a trauma kit · press 1 to heal, 2 to inject");
        } else if (id === "bike" && step >= 4) {
          setPower(100);
          loadChapter("checkpoint");
        }
      } else if (chapter === "checkpoint") {
        if (id === "checkpoint-radio" && step === 0) {
          advanceStep(1);
          showToast("A family answers from the locked pediatrics wing");
        } else if (id === "fuse" && step === 1) {
          advanceStep(2);
          showToast("Isolation locks released · the ward is moving");
          playSound("generator");
        } else if (id === "survivor-family" && step === 3) {
          setSurvivors((value) => value + 2);
          advanceStep(4);
          showToast("Family rescued · follow the stairwell markers");
        } else if (id === "checkpoint-gate" && step >= 4) {
          loadChapter("depot");
        }
      } else if (chapter === "depot") {
        if (id === "depot-key" && step === 0) {
          advanceStep(1);
          showToast("Pharmacy access card recovered");
        } else if (id === "battery" && step === 1) {
          advanceStep(2);
          setAntivirals((value) => value + 2);
          showToast("Antiviral trial case secured · two doses inside");
        } else if (id === "food-cart" && step === 2) {
          setFood((value) => value + 3);
          advanceStep(3);
          showToast("Three nutrition packs secured · specimen pod opened");
        } else if (id === "bus" && step >= 4) {
          loadChapter("escape");
        }
      }
    },
    [
      advanceStep,
      chapter,
      hasPistol,
      loadChapter,
      playSound,
      showToast,
      step,
    ],
  );

  const handleDamage = useCallback(
    (amount: number) => {
      const next = clamp(healthRef.current - amount, 0, 100);
      healthRef.current = next;
      setHealth(next);
      setDamagePulse((value) => value + 1);
      if (next <= 0) {
        setMode("paused");
        showToast("You collapsed · press 1 for a trauma kit, or restart");
      }
    },
    [setMode, showToast],
  );

  const handleInfection = useCallback(
    (amount: number) => {
      const next = clamp(infectionRef.current + amount, 0, 100);
      infectionRef.current = next;
      setInfection(next);
      if (next >= 100) {
        setMode("paused");
        showToast("The infection took over · restart from the emergency floor");
      } else if (next >= 72 && infectionRef.current - amount < 72) {
        showToast("Critical infection · press 2 to inject an antiviral");
      }
    },
    [showToast],
  );

  const handleKill = useCallback(() => {
    const nextKills = killsRef.current + 1;
    killsRef.current = nextKills;
    setKills(nextKills);
    if (nextKills % 4 !== 0) return;
    if (hasPistol) {
      setAmmo((value) => value + 4);
      showToast("Infected cache · 4 pistol rounds · G to fire");
    } else {
      setMedicine((value) => Math.min(3, value + 1));
      showToast("Infected cache · trauma supplies · 1 to use");
    }
    playSound("pickup");
  }, [hasPistol, playSound, showToast]);

  const handleEncounterCleared = useCallback(() => {
    if (chapter === "hospital" && step === 3) {
      advanceStep(4);
      showToast("Surgical corridor clear · reach Stairwell A");
    } else if (chapter === "hospital" && step === 5) {
      advanceStep(6);
      showToast("Emergency wing clear · Stairwell A unlocked");
    } else if (chapter === "checkpoint" && step === 2) {
      advanceStep(3);
      showToast("Isolation breach contained · find the hidden family");
    } else if (chapter === "depot" && step === 3) {
      advanceStep(4);
      showToast("Research mutation killed · return everyone to Shelter 04");
    }
  }, [advanceStep, chapter, showToast, step]);

  const handleFuelProgress = useCallback(
    (value: number) => {
      setFuelProgress(value);
      if (
        chapter === "station" &&
        step === 3 &&
        value >= 0.999 &&
        !powerCompleteRef.current
      ) {
        powerCompleteRef.current = true;
        setPower(100);
        advanceStep(4);
        showToast("Cold storage stabilized · take the elevator to Floor 3");
      }
    },
    [advanceStep, chapter, showToast, step],
  );

  const handleEscapeProgress = useCallback(
    (value: number) => {
      setEscapeProgress(value);
      if (
        chapter === "escape" &&
        step === 0 &&
        value >= 0.16 &&
        !escapeScoutRef.current
      ) {
        escapeScoutRef.current = true;
        advanceStep(1);
        showToast("The survivors are following · Shelter 04 is ahead");
      }
      if (value >= 0.985 && !escapeCompleteRef.current) {
        escapeCompleteRef.current = true;
        setMode("ending");
        window.localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
      }
    },
    [advanceStep, chapter, setHasSave, setMode, showToast, step],
  );

  const handleSurvivalProgress = useCallback(
    (wave: number, seconds: number, remaining: number) => {
      setSurvivalWave(wave);
      setSurvivalTime(seconds);
      setSurvivalRemaining(remaining);
    },
    [],
  );

  const startEndlessSurvival = useCallback(() => {
    healthRef.current = 100;
    infectionRef.current = Math.min(infectionRef.current, 35);
    setHealth(100);
    setInfection((value) => Math.min(value, 35));
    setStamina(100);
    setMedicine((value) => Math.max(1, value));
    setPower(100);
    setMode("playing");
    loadChapter("survival");
    window.setTimeout(
      () =>
        saveGame("survival", 0, {
          health: 100,
          infection: Math.min(infectionRef.current, 35),
          medicine: Math.max(1, medicine),
          power: 100,
        }),
      0,
    );
  }, [loadChapter, medicine, saveGame]);

  // Duck the score as something closes. Fully out of the way by four metres so
  // that at the moment it matters the player is hearing the creature and
  // nothing else; back to full past twenty. Applied directly to the audio rig
  // rather than through state, so it does not re-render the HUD.
  const handleThreatProximity = useCallback((distance: number) => {
    const duck = clamp((20 - distance) / 16, 0, 1);
    audioRef.current?.setMusicDuck(duck);
  }, []);

  // Something is coming. The banner is deliberately text-only and short-lived;
  // the audio telegraph carries the direction, this only carries the fact.
  const handleWaveWarning = useCallback((wave: number, _seconds: number) => {
    void _seconds;
    setWaveAlert((value) => value + 1);
    showToast(wave > 0 ? `Containment failing · wave ${wave}` : "Movement ahead");
  }, [showToast]);

  // Resuming has to re-acquire pointer lock, and pointer lock can only be
  // requested from a user gesture. Both the pause button and the Escape key
  // qualify; Chrome additionally throttles re-locking for about a second after
  // an Escape exit, in which case the request is dropped and the next click on
  // the canvas takes it instead.
  const resumePlay = useCallback(() => {
    setMode("playing");
    viewportRef.current?.captureLook();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mode === "playing") setMode("paused");
        else if (mode === "paused") resumePlay();
        return;
      }
      if (mode !== "playing") return;
      // Consumables were click-only, which is unusable in first person with the
      // pointer locked — there is no cursor to click with.
      if (event.key === "1") healWithMedicine();
      if (event.key === "2") injectAntiviral();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [healWithMedicine, mode, resumePlay, injectAntiviral]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasSave(Boolean(getSave())), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Restore the saved point of view after mount so the server-rendered markup
  // and the first client render agree. Deferred by a timeout for the same
  // reason as the save probe above: it keeps the read out of the render pass.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(POV_KEY);
      if (stored === "first" || stored === "third") setPov(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(POV_KEY, pov);
  }, [pov]);

  useEffect(() => {
    if (mode !== "playing" || typeof window === "undefined") return;
    const payload: SaveData = {
      chapter,
      step,
      health,
      medicine,
      infection,
      antivirals,
      food,
      survivors,
      power,
      rescued,
      kills,
      ammo,
      hasPistol,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }, [
    ammo,
    antivirals,
    chapter,
    food,
    hasPistol,
    health,
    infection,
    kills,
    medicine,
    mode,
    power,
    rescued,
    step,
    survivors,
  ]);

  useEffect(() => {
    if (mode !== "menu") return;
    const preload = () => {
      void loadGameViewport();
    };
    const idleWindow = window as unknown as {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preload, { timeout: 2600 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timer = globalThis.setTimeout(preload, 1400);
    return () => globalThis.clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!soundOn || mode === "menu" || mode === "ending") {
      audio?.setEnabled(soundOn);
      audio?.stopMusic();
      return;
    }
    const activeAudio = audio ?? new SurvivalAudio();
    audioRef.current = activeAudio;
    activeAudio.setEnabled(true);
    const chapterThreat =
      chapter === "survival"
        ? clamp(0.48 + survivalRemaining * 0.045, 0.48, 1)
        : clamp(
            0.48 + (100 - health) / 220 + infection / 280,
            0.48,
            0.96,
          );
    const threat = clamp(
      Math.max(chapterThreat, 0.38 + dread / 115),
      0.48,
      1,
    );
    activeAudio.startMusic(
      chapter,
      mode === "paused" ? threat * 0.38 : threat,
    );
  }, [chapter, dread, health, infection, mode, soundOn, survivalRemaining]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      audioRef.current?.close();
    },
    [],
  );

  const beyondHospital = chapter !== "hospital";
  const inventory: Partial<Record<EquipmentKind, boolean>> = {
    torch: beyondHospital || step >= 1,
    radio: beyondHospital || step >= 2,
    axe: beyondHospital || step >= 3,
    medkit: medicine > 0,
    pistol: hasPistol,
    fuel:
      chapter === "station" ||
      chapter === "checkpoint" ||
      chapter === "depot" ||
      chapter === "escape",
  };
  const objective =
    OBJECTIVES[chapter][clamp(step, 0, OBJECTIVES[chapter].length - 1)];
  const chapterInfo = CHAPTERS[chapter];

  const setViewportMove = useCallback(
    (key: "w" | "a" | "s" | "d", active: boolean) => {
      viewportRef.current?.setMove(key, active);
    },
    [],
  );

  const moveButton = (key: "w" | "a" | "s" | "d") => ({
    onPointerDown: () => setViewportMove(key, true),
    onPointerUp: () => setViewportMove(key, false),
    onPointerCancel: () => setViewportMove(key, false),
    onPointerLeave: () => setViewportMove(key, false),
  });

  return (
    <main className="game-shell" aria-label="Last Bus Out three-dimensional survival game">
      {mode !== "menu" && (
        <Suspense fallback={null}>
          <GameViewport3D
            ref={viewportRef}
            chapter={chapter}
            mode={mode}
            step={step}
            rescued={rescued}
            health={health}
            ammo={ammo}
            inventory={inventory}
            pov={pov}
            minimapCanvas={minimapCanvas}
            bloodCanvas={bloodCanvas}
            resetToken={resetToken}
            onReady={() => setWorldReady(true)}
            onPovChange={setPov}
            onPointerLockLost={() => setMode("paused")}
            onInteraction={handleInteraction}
            onPromptChange={setPrompt}
            onStaminaChange={setStamina}
            onDamage={handleDamage}
            onInfection={handleInfection}
            onKill={handleKill}
            onAmmoUsed={() => setAmmo((value) => Math.max(0, value - 1))}
            onCombatProgress={(combo, score) => {
              setCombatCombo(combo);
              setCombatScore(score);
            }}
            onEncounterCleared={handleEncounterCleared}
            onFuelProgress={handleFuelProgress}
            onEscapeProgress={handleEscapeProgress}
            onSurvivalProgress={handleSurvivalProgress}
            onFearChange={setDread}
            onWaveWarning={handleWaveWarning}
            onThreatProximity={handleThreatProximity}
            onAimChange={setAiming}
            onSound={playSound}
          />
        </Suspense>
      )}
      <div className="noise" />
      <div className="vignette" />
      <div className="letterbox" />
      <div
        className={`terror-pulse ${dread > 68 ? "active" : ""}`}
        style={{ opacity: Math.max(0, (dread - 38) / 115) }}
      />
      <canvas
        ref={setBloodCanvas}
        className="view-blood"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
      {damagePulse > 0 && <div key={damagePulse} className="damage-flash" />}
      {waveAlert > 0 && <div key={`wave-${waveAlert}`} className="wave-alert" />}
      {mode === "playing" && aiming && (
        <div className="aim-mark" aria-hidden="true">
          <span />
          <span />
        </div>
      )}

      {mode !== "menu" && mode !== "ending" && (
        <>
          <div className="top-hud">
            <div className="brand-lockup">
              <span className="route-mark" />
              <span>
                <strong>Last Bus Out</strong>
                <small>{chapterInfo.location} · Hospital containment</small>
              </span>
            </div>
            <div className="objective" aria-live="polite">
              <small>Current objective</small>
              <strong>{objective}</strong>
            </div>
            <div className="hud-actions">
              <button
                className="icon-button"
                aria-label={soundOn ? "Mute audio" : "Enable audio"}
                onClick={() => setSoundOn((value) => !value)}
              >
                {soundOn ? "◖))" : "◖×"}
              </button>
              <button
                className="icon-button"
                aria-label="Pause game"
                onClick={() => setMode("paused")}
              >
                Ⅱ
              </button>
            </div>
          </div>

          <div className="minimap-frame" aria-hidden="true">
            <canvas ref={setMinimapCanvas} className="minimap" />
          </div>

          <div className="status-stack">
            <div className="bar-row">
              <span>Health</span>
              <span className="bar-track">
                <span className="bar-fill health" style={{ width: `${health}%` }} />
              </span>
              <span>{Math.round(health)}</span>
            </div>
            <div className="bar-row">
              <span>Stamina</span>
              <span className="bar-track">
                <span className="bar-fill stamina" style={{ width: `${stamina}%` }} />
              </span>
              <span>{Math.round(stamina)}</span>
            </div>
            <div className="bar-row infection-row">
              <span>Infection</span>
              <span className="bar-track">
                <span
                  className="bar-fill infection"
                  style={{ width: `${infection}%` }}
                />
              </span>
              <span>{Math.round(infection)}%</span>
            </div>
            <div className="bar-row dread-row">
              <span>Dread</span>
              <span className="bar-track">
                <span className="bar-fill dread" style={{ width: `${dread}%` }} />
              </span>
              <span>{dread > 78 ? "RUN" : dread > 46 ? "HIGH" : "LOW"}</span>
            </div>
            <div
              className={`combat-readout ${combatCombo > 0 ? "active" : ""}`}
            >
              <span>Momentum</span>
              <strong>
                {combatCombo > 0 ? `×${combatCombo}` : "Ready"}
              </strong>
              <small>{combatScore.toLocaleString()} pts</small>
            </div>
            <div className="equipment-tray" aria-label="Physical equipment carried by the character">
              {inventory.axe && (
                <div className="equipment-slot selected" title="Fire axe · press F to swing">
                  <span className="equipment-icon item-axe" aria-hidden="true" />
                  <small>Axe</small>
                  <span className="slot-key">F</span>
                </div>
              )}
              {inventory.radio && (
                <div className="equipment-slot" title="Emergency radio attached to vest">
                  <span className="equipment-icon item-radio" aria-hidden="true" />
                  <small>Radio</small>
                </div>
              )}
              {inventory.torch && (
                <div className="equipment-slot" title="Torch mounted on belt">
                  <span className="equipment-icon item-torch" aria-hidden="true" />
                  <small>Torch</small>
                </div>
              )}
              {inventory.medkit && (
                <button
                  className="equipment-slot actionable"
                  onClick={healWithMedicine}
                  title="Trauma kit · press 1 to use"
                >
                  <span className="equipment-icon item-medkit" aria-hidden="true" />
                  <small>Med {medicine}</small>
                  <span className="slot-key">1</span>
                </button>
              )}
              {antivirals > 0 && (
                <button
                  className="equipment-slot actionable antiviral-slot"
                  onClick={injectAntiviral}
                  title="Antiviral dose · press 2 to inject"
                >
                  <span className="equipment-icon item-antiviral" aria-hidden="true" />
                  <small>Anti {antivirals}</small>
                  <span className="slot-key">2</span>
                </button>
              )}
              {inventory.pistol && (
                <div
                  className={`equipment-slot ${ammo > 0 ? "actionable" : ""}`}
                  title="Service pistol · press G to fire"
                >
                  <span className="equipment-icon item-pistol" aria-hidden="true" />
                  <small>{ammo} rnd</small>
                  <span className="slot-key">G</span>
                </div>
              )}
              {inventory.fuel && (
                <div className="equipment-slot" title="Hospital emergency power">
                  <span className="equipment-icon item-fuel" aria-hidden="true" />
                  <small>Power {power}%</small>
                </div>
              )}
            </div>
            <div className="rescue-readout">
              <span>{survivors} survivors</span>
              <span>{food} food packs</span>
              <span>{antivirals} antivirals</span>
            </div>
          </div>

          <div className="look-hint">
            {pov === "first" ? "Click to look" : "Drag to look"} · V for{" "}
            {pov === "first" ? "third person" : "first person"} · Shift to run ·
            F axe
            {inventory.pistol ? " · G pistol" : ""}
            {inventory.medkit ? " · 1 trauma kit" : ""}
            {antivirals > 0 ? " · 2 antiviral" : ""}
          </div>

          {prompt && (
            <button className="prompt" onClick={() => viewportRef.current?.interact()}>
              <span className="keycap">E</span>
              {prompt.label}
            </button>
          )}

          {chapter === "station" && step === 3 && (
            <div className="fuel-meter">
              <div className="fuel-head">
                <span>Cold-storage power</span>
                <strong>{Math.round(fuelProgress * 100)}%</strong>
              </div>
              <div className="fuel-track">
                <span style={{ width: `${fuelProgress * 100}%` }} />
              </div>
            </div>
          )}

          {chapter === "escape" && (
            <div className="fuel-meter">
              <div className="fuel-head">
                <span>Distance to Shelter 04</span>
                <strong>{Math.max(0, Math.ceil((1 - escapeProgress) * 94))} m</strong>
              </div>
              <div className="fuel-track">
                <span style={{ width: `${escapeProgress * 100}%` }} />
              </div>
            </div>
          )}

          {chapter === "survival" && (
            <div className="fuel-meter survival-meter">
              <div className="fuel-head">
                <span>Containment wave</span>
                <strong>{survivalWave}</strong>
              </div>
              <div className="survival-stats">
                <span>{survivalRemaining} mutations active</span>
                <span>
                  {Math.floor(survivalTime / 60)
                    .toString()
                    .padStart(2, "0")}
                  :
                  {Math.floor(survivalTime % 60)
                    .toString()
                    .padStart(2, "0")} survived
                </span>
              </div>
            </div>
          )}

          <div className="mobile-controls" aria-label="Touch controls">
            <div className="move-pad">
              <button className="move-button up" aria-label="Move forward" {...moveButton("w")}>▲</button>
              <button className="move-button down" aria-label="Move backward" {...moveButton("s")}>▼</button>
              <button className="move-button left" aria-label="Move left" {...moveButton("a")}>◀</button>
              <button className="move-button right" aria-label="Move right" {...moveButton("d")}>▶</button>
            </div>
            <div className="action-cluster">
              <button className="action-button dodge" onClick={() => viewportRef.current?.dodge()}>Dodge</button>
              <button className="action-button interact" onClick={() => viewportRef.current?.interact()}>Use</button>
              <button className="action-button attack" onClick={() => viewportRef.current?.attack()}>Attack</button>
              {inventory.pistol && (
                <button
                  className="action-button shoot"
                  onClick={() => viewportRef.current?.shoot()}
                >
                  Shoot {ammo}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {chapterCard > 0 && mode === "playing" && (
        <div className="chapter-card" key={`${chapter}-${chapterCard}`}>
          <small>{chapterInfo.kicker} · {chapterInfo.location}</small>
          <h2>{chapterInfo.title}</h2>
          <p>{chapterInfo.description}</p>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {mode === "menu" && (
        <section className="menu-screen">
          <div className="menu-content">
            <div className="eyebrow">Original three-dimensional survival game</div>
            <h1 className="game-title">
              Last Bus Out
              <span>St. Orison</span>
            </h1>
            <p className="menu-copy">
              Wake inside a sealed hospital and descend into its containment
              failure. Search connected floors for survivors, food, power, and
              antivirals while ordinary infected give way to research mutations.
              Reach Shelter 04 before the infection reaches your bloodstream.
            </p>
            <div className="menu-actions">
              <button
                className="primary-button"
                onClick={resetRun}
                onFocus={() => void loadGameViewport()}
                onPointerEnter={() => void loadGameViewport()}
                onTouchStart={() => void loadGameViewport()}
              >
                Enter St. Orison
              </button>
              {hasSave && (
                <button
                  className="secondary-button"
                  onClick={continueRun}
                  onFocus={() => void loadGameViewport()}
                  onPointerEnter={() => void loadGameViewport()}
                  onTouchStart={() => void loadGameViewport()}
                >
                  Continue
                </button>
              )}
            </div>
            <div className="control-legend">
              <span>WASD · Walk</span>
              <span>Shift · Run</span>
              <span>Mouse · Look</span>
              <span>V · Perspective</span>
              <span>F · Axe</span>
              <span>G · Pistol</span>
              <span>1 · Trauma kit</span>
              <span>2 · Antiviral</span>
              <span>E · Interact</span>
              <span>Space · Dodge</span>
            </div>
          </div>
        </section>
      )}

      {mode !== "menu" && !worldReady && (
        <section className="loading-screen" aria-live="polite" aria-busy="true">
          <div className="loading-card">
            <div className="eyebrow">Opening the hospital</div>
            <h2>Entering {chapterInfo.location}</h2>
            <p>Loading the floor, survivor rigs, and containment state…</p>
            <span className="loading-track" aria-hidden="true">
              <span />
            </span>
          </div>
        </section>
      )}

      {mode === "paused" && (
        <section className="pause-screen">
          <div className="pause-card">
            <div className="eyebrow">Containment suspended</div>
            <h2>
              {infection >= 100
                ? "The infection took over"
                : health <= 0
                  ? "You went down"
                  : "Paused"}
            </h2>
            <p>
              The floor remains exactly where you left it. Movement, animation,
              enemies, lighting events, and objective timers are stopped.
            </p>
            <div className="pause-actions">
              {health > 0 && infection < 100 && (
                <button className="primary-button" onClick={resumePlay}>
                  Return to the hospital
                </button>
              )}
              {medicine > 0 && health < 100 && (
                <button className="secondary-button" onClick={healWithMedicine}>
                  Use trauma kit · {medicine} left
                </button>
              )}
              {antivirals > 0 && infection > 0 && infection < 100 && (
                <button className="secondary-button" onClick={injectAntiviral}>
                  Use antiviral · {antivirals} left
                </button>
              )}
              {(health <= 0 || infection >= 100) && (
                <button
                  className="primary-button"
                  onClick={
                    chapter === "survival" ? startEndlessSurvival : resetRun
                  }
                >
                  {chapter === "survival"
                    ? "Restart containment"
                    : "Restart hospital"}
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  saveGame();
                  setMode("menu");
                }}
              >
                Save & exit
              </button>
            </div>
          </div>
        </section>
      )}

      {mode === "ending" && (
        <section className="ending-screen">
          <div className="ending-card">
            <div className="eyebrow">Shelter 04 sealed · Containment Hour 06</div>
            <h2>The survivors are inside.<br />The hospital is not empty.</h2>
            <p>
              The food will last a little while, and the antiviral bought you
              time. Maya has locked the safe-room doors, but the restricted
              annex is still feeding new mutations into the floors above.
            </p>
            <div className="run-stats">
              <div><strong>{kills}</strong><span>Infected stopped</span></div>
              <div><strong>{survivors}</strong><span>Survivors found</span></div>
              <div><strong>{food}</strong><span>Food packs delivered</span></div>
              <div><strong>{Math.round(infection)}%</strong><span>Infection remaining</span></div>
            </div>
            <div className="menu-actions">
              <button
                className="primary-button"
                onClick={startEndlessSurvival}
              >
                Defend the quarantine annex
              </button>
              <button className="secondary-button" onClick={resetRun}>
                Run the story again
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
