"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GameViewport3D,
  type GameViewportHandle,
} from "./GameViewport3D";
import {
  SurvivalAudio,
  type GameSoundEvent,
  type GameSoundOptions,
} from "./game3d/audio";
import type { EquipmentKind, GameChapter } from "./game3d/scene";

type Mode = "menu" | "playing" | "paused" | "ending";
type SaveData = {
  chapter: GameChapter;
  step: number;
  health: number;
  medicine: number;
  fuel: number;
  rescued: boolean;
  kills: number;
  ammo: number;
  hasPistol?: boolean;
};

const SAVE_KEY = "last-bus-out-3d-save-v1";

const CHAPTERS: Record<
  GameChapter,
  { kicker: string; title: string; location: string; description: string }
> = {
  hospital: {
    kicker: "Day 04 · 05:42",
    title: "Wake up",
    location: "St. Orison Hospital",
    description:
      "Four days after the sirens stopped, the emergency lights are still burning.",
  },
  street: {
    kicker: "Day 04 · 06:11",
    title: "No one came back",
    location: "Mercy District",
    description:
      "The evacuation route is blocked. A weak voice is still transmitting nearby.",
  },
  station: {
    kicker: "Day 04 · 18:26",
    title: "Running on empty",
    location: "Northline Fuel Stop",
    description:
      "One working pump remains. The generator will bring everything nearby with it.",
  },
  escape: {
    kicker: "Day 04 · 18:53",
    title: "The last road",
    location: "Haven Route 9",
    description:
      "Haven is beyond the wreckage. Keep moving and do not let the road close around you.",
  },
  survival: {
    kicker: "Day 05 · 00:17",
    title: "The night watch",
    location: "Haven Northern Perimeter",
    description:
      "The route is over, but the perimeter never sleeps. Hold the patrol ground for as long as you can.",
  },
};

const OBJECTIVES: Record<GameChapter, string[]> = {
  hospital: [
    "Find a working light",
    "Recover the emergency radio",
    "Take the fire axe",
    "Clear the ambulance corridor",
    "Open the ambulance entrance",
  ],
  street: [
    "Follow the radio signal",
    "Reach the trapped paramedic",
    "Find the motorcycle",
  ],
  station: [
    "Start the backup generator",
    "Defend the pump while it fills",
    "Return to the motorcycle",
  ],
  escape: ["Reach the Haven perimeter"],
  survival: ["Survive the next infected wave"],
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
  const killsRef = useRef(0);
  const fuelCompleteRef = useRef(false);
  const escapeCompleteRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("menu");
  const [chapter, setChapter] = useState<GameChapter>("hospital");
  const [step, setStep] = useState(0);
  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [medicine, setMedicine] = useState(0);
  const [fuel, setFuel] = useState(4);
  const [rescued, setRescued] = useState(false);
  const [kills, setKills] = useState(0);
  const [ammo, setAmmo] = useState(0);
  const [hasPistol, setHasPistol] = useState(false);
  const [combatCombo, setCombatCombo] = useState(0);
  const [combatScore, setCombatScore] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState("");
  const [prompt, setPrompt] = useState<{ id: string; label: string } | null>(null);
  const [fuelProgress, setFuelProgress] = useState(0);
  const [escapeProgress, setEscapeProgress] = useState(0);
  const [survivalWave, setSurvivalWave] = useState(1);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [survivalRemaining, setSurvivalRemaining] = useState(0);
  const [chapterCard, setChapterCard] = useState(0);
  const [hasSave, setHasSave] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [damagePulse, setDamagePulse] = useState(0);

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
        fuel,
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
      chapter,
      fuel,
      hasPistol,
      health,
      kills,
      medicine,
      rescued,
      step,
    ],
  );

  const loadChapter = useCallback(
    (nextChapter: GameChapter, nextStep = 0) => {
      setChapter(nextChapter);
      setStep(nextStep);
      setPrompt(null);
      setFuelProgress(0);
      setEscapeProgress(0);
      setSurvivalWave(1);
      setSurvivalTime(0);
      setSurvivalRemaining(0);
      setCombatCombo(0);
      setCombatScore(0);
      setStamina(100);
      fuelCompleteRef.current = false;
      escapeCompleteRef.current = false;
      setResetToken((value) => value + 1);
      setChapterCard((value) => value + 1);
      playSound("objective");
      window.setTimeout(() => saveGame(nextChapter, nextStep), 0);
    },
    [playSound, saveGame],
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
    healthRef.current = 100;
    killsRef.current = 0;
    setHealth(100);
    setStamina(100);
    setMedicine(0);
    setFuel(4);
    setRescued(false);
    setKills(0);
    setAmmo(0);
    setHasPistol(false);
    setCombatCombo(0);
    setCombatScore(0);
    setMode("playing");
    setChapter("hospital");
    setStep(0);
    setPrompt(null);
    setFuelProgress(0);
    setEscapeProgress(0);
    setSurvivalWave(1);
    setSurvivalTime(0);
    setSurvivalRemaining(0);
    setResetToken((value) => value + 1);
    setChapterCard((value) => value + 1);
    fuelCompleteRef.current = false;
    escapeCompleteRef.current = false;
    playSound("objective");
  }, [playSound, setMode]);

  const continueRun = useCallback(() => {
    const saved = getSave();
    if (!saved) {
      resetRun();
      return;
    }
    healthRef.current = saved.health;
    killsRef.current = saved.kills;
    setHealth(saved.health);
    setStamina(100);
    setMedicine(saved.medicine);
    setFuel(saved.fuel);
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

  const handleInteraction = useCallback(
    (id: string) => {
      playSound("pickup");
      if (chapter === "hospital") {
        if (id === "torch" && step === 0) {
          advanceStep(1);
          showToast("Torch mounted to your belt");
        } else if (id === "radio" && step === 1) {
          advanceStep(2);
          showToast("Haven Route Nine is still transmitting");
        } else if (id === "axe" && step === 2) {
          advanceStep(3);
          showToast("Fire axe secured · movement ahead");
        } else if (id === "exit" && step >= 4) {
          loadChapter("street");
        }
      } else if (chapter === "street") {
        if (id === "signal" && step === 0) {
          advanceStep(1);
          showToast("Signal located beyond the police barricade");
        } else if (id === "maya" && step === 1) {
          setRescued(true);
          advanceStep(2);
          showToast("Maya joined you");
        } else if (id === "pistol" && !hasPistol) {
          setHasPistol(true);
          setAmmo(12);
          showToast("Service pistol recovered · 12 rounds");
        } else if (id === "bike" && step >= 2) {
          setFuel(1);
          loadChapter("station");
        }
      } else if (chapter === "station") {
        if (id === "generator" && step === 0) {
          advanceStep(1);
          showToast("Generator online · the pump is drawing a crowd");
          playSound("generator");
        } else if (id === "meds" && medicine === 0) {
          setMedicine(1);
          showToast("Trauma kit packed");
        } else if (id === "bike" && step >= 2) {
          setFuel(100);
          loadChapter("escape");
        }
      }
    },
    [
      advanceStep,
      chapter,
      hasPistol,
      loadChapter,
      medicine,
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
        showToast("You collapsed · use a trauma kit or restart");
      }
    },
    [setMode, showToast],
  );

  const handleKill = useCallback(() => {
    const nextKills = killsRef.current + 1;
    killsRef.current = nextKills;
    setKills(nextKills);
    if (nextKills % 4 !== 0) return;
    if (hasPistol) {
      setAmmo((value) => value + 4);
      showToast("Infected cache · 4 pistol rounds recovered");
    } else {
      setMedicine((value) => Math.min(3, value + 1));
      showToast("Infected cache · trauma supplies recovered");
    }
    playSound("pickup");
  }, [hasPistol, playSound, showToast]);

  const handleEncounterCleared = useCallback(() => {
    if (chapter === "hospital" && step === 3) {
      advanceStep(4);
      showToast("Ambulance corridor clear");
    }
  }, [advanceStep, chapter, showToast, step]);

  const handleFuelProgress = useCallback(
    (value: number) => {
      setFuelProgress(value);
      if (
        chapter === "station" &&
        step === 1 &&
        value >= 0.999 &&
        !fuelCompleteRef.current
      ) {
        fuelCompleteRef.current = true;
        setFuel(100);
        advanceStep(2);
        showToast("Tank full · get back to the motorcycle");
      }
    },
    [advanceStep, chapter, showToast, step],
  );

  const handleEscapeProgress = useCallback(
    (value: number) => {
      setEscapeProgress(value);
      if (value >= 0.985 && !escapeCompleteRef.current) {
        escapeCompleteRef.current = true;
        setMode("ending");
        window.localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
      }
    },
    [setHasSave, setMode],
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
    setHealth(100);
    setStamina(100);
    setMedicine((value) => Math.max(1, value));
    setFuel(100);
    setMode("playing");
    loadChapter("survival");
    window.setTimeout(
      () =>
        saveGame("survival", 0, {
          health: 100,
          medicine: Math.max(1, medicine),
          fuel: 100,
        }),
      0,
    );
  }, [loadChapter, medicine, saveGame]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mode === "playing") setMode("paused");
      else if (mode === "paused") setMode("playing");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasSave(Boolean(getSave())), 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    const threat =
      chapter === "survival"
        ? clamp(0.48 + survivalRemaining * 0.045, 0.48, 1)
        : clamp(0.48 + (100 - health) / 180, 0.48, 0.92);
    activeAudio.startMusic(
      chapter,
      mode === "paused" ? threat * 0.38 : threat,
    );
  }, [chapter, health, mode, soundOn, survivalRemaining]);

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
    fuel: chapter === "station" || chapter === "escape",
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
      <GameViewport3D
        ref={viewportRef}
        chapter={chapter}
        mode={mode}
        step={step}
        rescued={rescued}
        health={health}
        ammo={ammo}
        inventory={inventory}
        resetToken={resetToken}
        onInteraction={handleInteraction}
        onPromptChange={setPrompt}
        onStaminaChange={setStamina}
        onDamage={handleDamage}
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
        onSound={playSound}
      />
      <div className="noise" />
      <div className="vignette" />
      <div className="letterbox" />
      {damagePulse > 0 && <div key={damagePulse} className="damage-flash" />}

      {mode !== "menu" && mode !== "ending" && (
        <>
          <div className="top-hud">
            <div className="brand-lockup">
              <span className="route-mark" />
              <span>
                <strong>Last Bus Out</strong>
                <small>{chapterInfo.location} · 3D field build</small>
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
                <div className="equipment-slot selected" title="Fire axe mounted to backpack">
                  <span className="equipment-icon item-axe" aria-hidden="true" />
                  <small>Axe</small>
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
                  title="Use trauma kit"
                >
                  <span className="equipment-icon item-medkit" aria-hidden="true" />
                  <small>Med {medicine}</small>
                </button>
              )}
              {inventory.pistol && (
                <div className="equipment-slot" title="Holstered service pistol">
                  <span className="equipment-icon item-pistol" aria-hidden="true" />
                  <small>{ammo} rnd</small>
                </div>
              )}
              {inventory.fuel && (
                <div className="equipment-slot" title="Fuel reserve">
                  <span className="equipment-icon item-fuel" aria-hidden="true" />
                  <small>{fuel}%</small>
                </div>
              )}
            </div>
          </div>

          <div className="look-hint">
            Drag to look · Shift to run · F melee
            {inventory.pistol ? " · G pistol" : ""}
          </div>

          {prompt && (
            <button className="prompt" onClick={() => viewportRef.current?.interact()}>
              <span className="keycap">E</span>
              {prompt.label}
            </button>
          )}

          {chapter === "station" && step === 1 && (
            <div className="fuel-meter">
              <div className="fuel-head">
                <span>Fuel transfer</span>
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
                <span>Distance to Haven</span>
                <strong>{Math.max(0, Math.ceil((1 - escapeProgress) * 5.2))} km</strong>
              </div>
              <div className="fuel-track">
                <span style={{ width: `${escapeProgress * 100}%` }} />
              </div>
            </div>
          )}

          {chapter === "survival" && (
            <div className="fuel-meter survival-meter">
              <div className="fuel-head">
                <span>Night-watch wave</span>
                <strong>{survivalWave}</strong>
              </div>
              <div className="survival-stats">
                <span>{survivalRemaining} infected active</span>
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
            <div className="eyebrow">Local three-dimensional survival build</div>
            <h1 className="game-title">
              Last Bus Out
              <span>Road to Haven</span>
            </h1>
            <p className="menu-copy">
              Enter the hospital, move through the city, search physical spaces,
              carry real equipment, and fight toward Haven. Finish the four-part
              story, then continue in an endless night-watch survival mode.
            </p>
            <div className="menu-actions">
              <button className="primary-button" onClick={resetRun}>Begin the escape</button>
              {hasSave && <button className="secondary-button" onClick={continueRun}>Continue</button>}
            </div>
            <div className="control-legend">
              <span>WASD · Walk</span>
              <span>Shift · Run</span>
              <span>Drag · Look</span>
              <span>Wheel · Zoom</span>
              <span>F · Attack</span>
              <span>G · Fire pistol</span>
              <span>E · Interact</span>
              <span>Space · Dodge</span>
            </div>
          </div>
        </section>
      )}

      {mode === "paused" && (
        <section className="pause-screen">
          <div className="pause-card">
            <div className="eyebrow">Route suspended</div>
            <h2>{health <= 0 ? "You went down" : "Paused"}</h2>
            <p>
              The world remains exactly where you left it. Camera movement, character
              animation, enemies, and the fuel timer are stopped.
            </p>
            <div className="pause-actions">
              {health > 0 && (
                <button className="primary-button" onClick={() => setMode("playing")}>
                  Return to the road
                </button>
              )}
              {medicine > 0 && health < 100 && (
                <button className="secondary-button" onClick={healWithMedicine}>
                  Use trauma kit · {medicine} left
                </button>
              )}
              {health <= 0 && (
                <button
                  className="primary-button"
                  onClick={
                    chapter === "survival" ? startEndlessSurvival : resetRun
                  }
                >
                  {chapter === "survival"
                    ? "Restart night watch"
                    : "Restart route"}
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
            <div className="eyebrow">Haven perimeter reached · Day 04</div>
            <h2>You crossed the city.<br />Not alone.</h2>
            <p>
              The road continues north. Behind you, St. Orison, Mercy District,
              and Northline have become places you survived—not painted backdrops.
            </p>
            <div className="run-stats">
              <div><strong>{kills}</strong><span>Infected stopped</span></div>
              <div><strong>{rescued ? "1" : "0"}</strong><span>Survivors found</span></div>
              <div><strong>{Math.round(health)}</strong><span>Health remaining</span></div>
            </div>
            <div className="menu-actions">
              <button
                className="primary-button"
                onClick={startEndlessSurvival}
              >
                Continue into endless survival
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
