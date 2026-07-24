"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Chapter = "hospital" | "street" | "station" | "escape";
type Mode = "menu" | "playing" | "paused" | "ending";
type Vec = { x: number; z: number };
type Enemy = Vec & {
  id: number;
  hp: number;
  maxHp: number;
  kind: "walker" | "runner";
  hitFlash: number;
  attackClock: number;
};
type Interaction = Vec & {
  id: string;
  label: string;
  glyph: string;
  active: boolean;
};
type SaveData = {
  chapter: Chapter;
  step: number;
  health: number;
  medicine: number;
  fuel: number;
  rescued: boolean;
  kills: number;
};
type SpriteName = "protagonist" | "maya" | "walker" | "runner";

const SAVE_KEY = "last-bus-out-save-v1";
const CHAPTERS: Record<
  Chapter,
  { kicker: string; title: string; location: string; sky: string; fog: string }
> = {
  hospital: {
    kicker: "Day 04 · 05:42",
    title: "Wake up",
    location: "St. Orison Hospital",
    sky: "#263632",
    fog: "#536c63",
  },
  street: {
    kicker: "Day 04 · 06:11",
    title: "No one came back",
    location: "Mercy District",
    sky: "#514b40",
    fog: "#867968",
  },
  station: {
    kicker: "Day 04 · 18:26",
    title: "Running on empty",
    location: "Northline Fuel Stop",
    sky: "#6b3827",
    fog: "#a66645",
  },
  escape: {
    kicker: "Day 04 · 18:53",
    title: "Ride",
    location: "Haven Route 9",
    sky: "#352b2c",
    fog: "#9b5441",
  },
};

const OBJECTIVES: Record<Chapter, string[]> = {
  hospital: [
    "Find a light",
    "Recover your radio",
    "Take the fire axe",
    "Clear the stairwell",
    "Reach the ambulance entrance",
  ],
  street: ["Follow the radio signal", "Help the trapped survivor", "Reach the motorcycle"],
  station: ["Restore power to the pumps", "Hold until the tank is full", "Get back to the motorcycle"],
  escape: ["Break through the horde", "Reach the safe house"],
};

const INTERACTIONS: Record<Chapter, Interaction[]> = {
  hospital: [
    { id: "torch", label: "Take torch", glyph: "!", x: 0, z: 6, active: true },
    { id: "radio", label: "Check emergency radio", glyph: "▥", x: -4, z: 12, active: true },
    { id: "axe", label: "Take fire axe", glyph: "†", x: 4.5, z: 18, active: true },
    { id: "exit", label: "Open ambulance entrance", glyph: "↗", x: 0, z: 31, active: true },
  ],
  street: [
    { id: "signal", label: "Tune the signal", glyph: "⌁", x: 0, z: 7, active: true },
    { id: "maya", label: "Help survivor", glyph: "+", x: 5, z: 17, active: true },
    { id: "pistol", label: "Search police cruiser", glyph: "•", x: -5, z: 21, active: true },
    { id: "bike", label: "Start motorcycle", glyph: "↗", x: 0, z: 32, active: true },
  ],
  station: [
    { id: "generator", label: "Start backup generator", glyph: "⚡", x: 6, z: 18, active: true },
    { id: "meds", label: "Search first-aid shelf", glyph: "+", x: -5, z: 15, active: true },
    { id: "bike", label: "Ride", glyph: "↗", x: 0, z: -1, active: true },
  ],
  escape: [],
};

const PROP_LAYOUT: Record<Chapter, Array<Vec & { kind: string; label?: string }>> = {
  hospital: [
    { x: -7.5, z: 7, kind: "wall" },
    { x: 7.5, z: 7, kind: "wall" },
    { x: -7.5, z: 16, kind: "wall" },
    { x: 7.5, z: 16, kind: "wall" },
    { x: -6, z: 24, kind: "bed" },
    { x: 6, z: 26, kind: "bed" },
    { x: 0, z: 34, kind: "door", label: "AMBULANCE" },
  ],
  street: [
    { x: -8, z: 8, kind: "car" },
    { x: 8.5, z: 13, kind: "car" },
    { x: -7, z: 25, kind: "bus" },
    { x: 7.5, z: 30, kind: "fire" },
    { x: -10, z: 18, kind: "building", label: "POLICE" },
    { x: 11, z: 20, kind: "building", label: "TOWER 05" },
  ],
  station: [
    { x: -7, z: 7, kind: "pump", label: "02" },
    { x: 0, z: 8, kind: "pump", label: "04" },
    { x: 7, z: 7, kind: "pump", label: "06" },
    { x: 0, z: 25, kind: "building", label: "NORTHLINE" },
    { x: -9, z: 27, kind: "tanker" },
    { x: 9, z: 25, kind: "barrier" },
  ],
  escape: [
    { x: -8, z: 18, kind: "car" },
    { x: 7, z: 29, kind: "barrier" },
    { x: -6, z: 43, kind: "fire" },
    { x: 8, z: 56, kind: "car" },
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function getSave(): SaveData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

function initialPlayer(chapter: Chapter): Vec {
  return chapter === "station" ? { x: 0, z: 1.5 } : { x: 0, z: 0 };
}

export function LastBusOutGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const pointerRef = useRef<{ id: number; x: number } | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const healthRef = useRef(100);
  const staminaRef = useRef(100);
  const hudClockRef = useRef(0);
  const spritesRef = useRef<Record<SpriteName, HTMLImageElement | null>>({
    protagonist: null,
    maya: null,
    walker: null,
    runner: null,
  });
  const stateRef = useRef({
    player: { x: 0, z: 0, yaw: 0, dodge: 0, attack: 0 },
    enemies: [] as Enemy[],
    nextEnemyId: 1,
    interactions: [] as Interaction[],
    elapsed: 0,
    waveClock: 0,
    fuelProgress: 0,
    escapeProgress: 0,
    hitTint: 0,
    steps: 0,
    chapterCard: 0,
  });

  const [mode, setMode] = useState<Mode>("menu");
  const [chapter, setChapter] = useState<Chapter>("hospital");
  const [step, setStep] = useState(0);
  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [medicine, setMedicine] = useState(0);
  const [fuel, setFuel] = useState(4);
  const [rescued, setRescued] = useState(false);
  const [kills, setKills] = useState(0);
  const [ammo, setAmmo] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState("");
  const [prompt, setPrompt] = useState<Interaction | null>(null);
  const [fuelProgress, setFuelProgress] = useState(0);
  const [escapeProgress, setEscapeProgress] = useState(0);
  const [chapterCard, setChapterCard] = useState(0);
  const [hasSave, setHasSave] = useState(false);

  const playTone = useCallback(
    (frequency: number, duration = 0.08, volume = 0.035, type: OscillatorType = "sine") => {
      if (!soundOn || typeof window === "undefined") return;
      try {
        const AudioContextClass =
          window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioRef.current ?? new AudioContextClass();
        audioRef.current = context;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        gain.gain.setValueAtTime(volume, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
      } catch {
        // Audio is optional and may be blocked until the first user gesture.
      }
    },
    [soundOn],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 2400);
  }, []);

  const saveGame = useCallback(
    (chapterValue = chapter, stepValue = step) => {
      const payload: SaveData = {
        chapter: chapterValue,
        step: stepValue,
        health,
        medicine,
        fuel,
        rescued,
        kills,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      setHasSave(true);
    },
    [chapter, step, health, medicine, fuel, rescued, kills],
  );

  const loadChapter = useCallback(
    (nextChapter: Chapter, nextStep = 0) => {
      setChapter(nextChapter);
      setStep(nextStep);
      setPrompt(null);
      setFuelProgress(0);
      setEscapeProgress(0);
      const runtime = stateRef.current;
      const start = initialPlayer(nextChapter);
      runtime.player = { ...start, yaw: 0, dodge: 0, attack: 0 };
      runtime.enemies = [];
      runtime.interactions = INTERACTIONS[nextChapter].map((item) => ({ ...item }));
      runtime.elapsed = 0;
      runtime.waveClock = 0;
      runtime.fuelProgress = 0;
      runtime.escapeProgress = 0;
      runtime.hitTint = 0;
      runtime.chapterCard = 4.5;
      setChapterCard((value) => value + 1);
      window.setTimeout(() => saveGame(nextChapter, nextStep), 0);
    },
    [saveGame],
  );

  const spawnEnemy = useCallback((kind: "walker" | "runner", x: number, z: number) => {
    const runtime = stateRef.current;
    runtime.enemies.push({
      id: runtime.nextEnemyId++,
      kind,
      x,
      z,
      hp: kind === "runner" ? 34 : 52,
      maxHp: kind === "runner" ? 34 : 52,
      hitFlash: 0,
      attackClock: 0,
    });
  }, []);

  const resetRun = useCallback(() => {
    healthRef.current = 100;
    staminaRef.current = 100;
    setHealth(100);
    setStamina(100);
    setMedicine(0);
    setFuel(4);
    setRescued(false);
    setKills(0);
    setAmmo(0);
    loadChapter("hospital", 0);
    setMode("playing");
  }, [loadChapter]);

  const continueRun = useCallback(() => {
    const saved = getSave();
    if (!saved) {
      resetRun();
      return;
    }
    healthRef.current = saved.health;
    staminaRef.current = 100;
    setHealth(saved.health);
    setStamina(100);
    setMedicine(saved.medicine);
    setFuel(saved.fuel);
    setRescued(saved.rescued);
    setKills(saved.kills);
    loadChapter(saved.chapter, saved.step);
    setMode("playing");
  }, [loadChapter, resetRun]);

  useEffect(() => {
    setHasSave(Boolean(getSave()));
  }, []);

  useEffect(() => {
    const spritePaths: Record<SpriteName, string> = {
      protagonist: "/characters/protagonist.png",
      maya: "/characters/maya.png",
      walker: "/characters/walker.png",
      runner: "/characters/runner.png",
    };
    const images = Object.entries(spritePaths).map(([name, path]) => {
      const image = new Image();
      image.decoding = "async";
      image.src = path;
      spritesRef.current[name as SpriteName] = image;
      return image;
    });
    return () => {
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, []);

  useEffect(() => {
    healthRef.current = health;
  }, [health]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keysRef.current[key] = true;
      if (["w", "a", "s", "d", " ", "shift", "e", "escape"].includes(key)) {
        event.preventDefault();
      }
      if (key === "escape" && mode === "playing") setMode("paused");
      else if (key === "escape" && mode === "paused") setMode("playing");
    };
    const keyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [mode]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && mode === "playing") {
        setMode("paused");
        saveGame();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mode, saveGame]);

  const advanceStep = useCallback(
    (nextStep: number) => {
      setStep(nextStep);
      saveGame(chapter, nextStep);
      playTone(620, 0.16, 0.04, "triangle");
    },
    [chapter, playTone, saveGame],
  );

  const interact = useCallback(() => {
    if (mode !== "playing") return;
    const runtime = stateRef.current;
    const nearby = runtime.interactions
      .filter((item) => item.active && distance(item, runtime.player) < 2.7)
      .sort((a, b) => distance(a, runtime.player) - distance(b, runtime.player))[0];
    if (!nearby) return;
    playTone(360, 0.1, 0.045, "square");

    if (chapter === "hospital") {
      if (nearby.id === "torch" && step === 0) {
        nearby.active = false;
        advanceStep(1);
        showToast("Torch acquired · emergency power is failing");
      } else if (nearby.id === "radio" && step === 1) {
        nearby.active = false;
        advanceStep(2);
        showToast("Transmission found · “Haven route nine…”");
      } else if (nearby.id === "axe" && step === 2) {
        nearby.active = false;
        advanceStep(3);
        spawnEnemy("walker", 0.5, 24);
        showToast("Fire axe equipped · noise attracts the infected");
      } else if (nearby.id === "exit" && step >= 4) {
        loadChapter("street");
      } else {
        showToast("Something else comes first");
      }
    } else if (chapter === "street") {
      if (nearby.id === "signal" && step === 0) {
        nearby.active = false;
        advanceStep(1);
        spawnEnemy("walker", 4, 21);
        spawnEnemy("walker", -3, 26);
        showToast("Signal locked · a survivor is calling from the east");
      } else if (nearby.id === "maya" && step === 1) {
        nearby.active = false;
        setRescued(true);
        advanceStep(2);
        showToast("Maya joined you · paramedic · steady");
      } else if (nearby.id === "pistol") {
        nearby.active = false;
        setAmmo((value) => value + 8);
        showToast("Service pistol found · 8 rounds");
      } else if (nearby.id === "bike" && step >= 2) {
        setFuel(1);
        loadChapter("station");
      } else {
        showToast("The radio signal is still your best lead");
      }
    } else if (chapter === "station") {
      if (nearby.id === "generator" && step === 0) {
        nearby.active = false;
        advanceStep(1);
        stateRef.current.waveClock = 2;
        spawnEnemy("walker", -8, 29);
        spawnEnemy("walker", 8, 31);
        showToast("Generator online · fuel transfer started");
      } else if (nearby.id === "meds") {
        nearby.active = false;
        setMedicine((value) => value + 1);
        setHealth((value) => {
          const next = clamp(value + 25, 0, 100);
          healthRef.current = next;
          return next;
        });
        showToast("Medical supplies recovered · wounds dressed");
      } else if (nearby.id === "bike" && step >= 2) {
        setFuel(100);
        loadChapter("escape");
      }
    }
  }, [
    advanceStep,
    chapter,
    loadChapter,
    mode,
    playTone,
    showToast,
    spawnEnemy,
    step,
  ]);

  const attack = useCallback(() => {
    if (mode !== "playing" || chapter === "escape") return;
    const runtime = stateRef.current;
    if (runtime.player.attack > 0 || staminaRef.current < 12) return;
    runtime.player.attack = 0.4;
    staminaRef.current = clamp(staminaRef.current - 14, 0, 100);
    setStamina(staminaRef.current);
    playTone(110, 0.09, 0.06, "sawtooth");
    let struck = false;
    for (const enemy of runtime.enemies) {
      const d = distance(enemy, runtime.player);
      const angle = Math.atan2(enemy.x - runtime.player.x, enemy.z - runtime.player.z);
      let delta = angle - runtime.player.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (d < 3.2 && Math.abs(delta) < 1.15) {
        enemy.hp -= 34;
        enemy.hitFlash = 0.16;
        struck = true;
      }
    }
    if (struck) playTone(74, 0.12, 0.075, "square");
  }, [chapter, mode, playTone]);

  const dodge = useCallback(() => {
    if (mode !== "playing" || staminaRef.current < 24 || stateRef.current.player.dodge > 0) return;
    stateRef.current.player.dodge = 0.36;
    staminaRef.current = clamp(staminaRef.current - 24, 0, 100);
    setStamina(staminaRef.current);
    playTone(185, 0.08, 0.025, "triangle");
  }, [mode, playTone]);

  const useMedicine = useCallback(() => {
    if (medicine <= 0 || health >= 100) return;
    setMedicine((value) => value - 1);
    setHealth((value) => {
      const next = clamp(value + 42, 0, 100);
      healthRef.current = next;
      return next;
    });
    showToast("Bandage used");
    playTone(520, 0.18, 0.03, "sine");
  }, [health, medicine, playTone, showToast]);

  const drawScene = useCallback(
    (context: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      const runtime = stateRef.current;
      const palette = CHAPTERS[chapter];
      const horizon = height * 0.39;
      const focal = Math.min(width, height) * 1.04;
      const player = runtime.player;

      const project = (point: Vec, worldHeight = 0) => {
        const dx = point.x - player.x;
        const dz = point.z - player.z;
        const cos = Math.cos(player.yaw);
        const sin = Math.sin(player.yaw);
        const side = dx * cos - dz * sin;
        const forward = dx * sin + dz * cos;
        const depth = forward + 8;
        if (depth < 0.7) return null;
        return {
          x: width / 2 + (side * focal) / depth,
          ground: horizon + (2.7 * focal) / depth,
          y: horizon + ((2.7 - worldHeight) * focal) / depth,
          scale: focal / depth,
          depth,
          forward,
        };
      };

      const sky = context.createLinearGradient(0, 0, 0, horizon + 50);
      sky.addColorStop(0, "#0c1212");
      sky.addColorStop(0.55, palette.sky);
      sky.addColorStop(1, palette.fog);
      context.fillStyle = sky;
      context.fillRect(0, 0, width, horizon + 60);

      context.fillStyle = "rgba(7, 11, 10, .82)";
      for (let i = 0; i < 11; i += 1) {
        const buildingWidth = width / 9 + ((i * 17) % 42);
        const buildingHeight = 36 + ((i * 43) % 105);
        const x = i * (width / 10) - 18;
        context.fillRect(x, horizon - buildingHeight, buildingWidth, buildingHeight + 4);
        if (chapter !== "hospital") {
          context.fillStyle = i % 4 === 0 ? "rgba(231,115,54,.22)" : "rgba(255,255,255,.05)";
          for (let row = 0; row < 4; row += 1) {
            context.fillRect(x + 13, horizon - buildingHeight + 14 + row * 22, 7, 4);
          }
          context.fillStyle = "rgba(7, 11, 10, .82)";
        }
      }

      if (chapter === "street" || chapter === "station" || chapter === "escape") {
        context.fillStyle = "rgba(50, 48, 42, .42)";
        for (let i = 0; i < 5; i += 1) {
          context.beginPath();
          context.arc(width * (0.2 + i * 0.17), horizon - 45 - i * 6, 35 + i * 12, 0, Math.PI * 2);
          context.fill();
        }
      }

      const ground = context.createLinearGradient(0, horizon, 0, height);
      ground.addColorStop(0, palette.fog);
      ground.addColorStop(0.12, chapter === "hospital" ? "#29332f" : "#373831");
      ground.addColorStop(1, "#0b0f0d");
      context.fillStyle = ground;
      context.fillRect(0, horizon, width, height - horizon);

      context.lineWidth = 1;
      for (let lane = -12; lane <= 12; lane += 3) {
        const near = project({ x: lane, z: -5 });
        const far = project({ x: lane, z: 80 });
        if (!near || !far) continue;
        context.strokeStyle =
          lane === -6 || lane === 6 ? "rgba(235,194,112,.18)" : "rgba(255,255,255,.055)";
        context.beginPath();
        context.moveTo(near.x, near.ground);
        context.lineTo(far.x, far.ground);
        context.stroke();
      }

      for (let z = Math.ceil(player.z / 4) * 4; z < player.z + 80; z += 4) {
        const left = project({ x: player.x - 18, z });
        const right = project({ x: player.x + 18, z });
        if (!left || !right) continue;
        context.strokeStyle = "rgba(255,255,255,.045)";
        context.beginPath();
        context.moveTo(left.x, left.ground);
        context.lineTo(right.x, right.ground);
        context.stroke();
      }

      if (chapter !== "hospital") {
        context.strokeStyle = "rgba(232,191,85,.26)";
        context.lineWidth = 2;
        for (let z = Math.ceil(player.z / 9) * 9; z < player.z + 80; z += 9) {
          const a = project({ x: 0, z });
          const b = project({ x: 0, z: z + 4 });
          if (a && b) {
            context.beginPath();
            context.moveTo(a.x, a.ground);
            context.lineTo(b.x, b.ground);
            context.stroke();
          }
        }
      }

      const renderables: Array<
        | { type: "prop"; data: (typeof PROP_LAYOUT)[Chapter][number]; depth: number }
        | { type: "enemy"; data: Enemy; depth: number }
        | { type: "interaction"; data: Interaction; depth: number }
      > = [];

      for (const prop of PROP_LAYOUT[chapter]) {
        const point = project(prop);
        if (point && point.forward > -6 && Math.abs(point.x - width / 2) < width * 1.2) {
          renderables.push({ type: "prop", data: prop, depth: point.depth });
        }
      }
      for (const enemy of runtime.enemies) {
        const point = project(enemy);
        if (point && point.forward > -5) renderables.push({ type: "enemy", data: enemy, depth: point.depth });
      }
      for (const item of runtime.interactions) {
        if (!item.active) continue;
        const point = project(item);
        if (point && point.forward > -5) {
          renderables.push({ type: "interaction", data: item, depth: point.depth });
        }
      }

      renderables.sort((a, b) => b.depth - a.depth);

      for (const renderable of renderables) {
        if (renderable.type === "prop") {
          const prop = renderable.data;
          const heights: Record<string, number> = {
            wall: 3.2,
            building: 8,
            door: 4.2,
            bed: 1,
            car: 1.6,
            bus: 3.1,
            fire: 2,
            pump: 2.2,
            tanker: 3.3,
            barrier: 1.1,
          };
          const point = project(prop, heights[prop.kind] ?? 2);
          if (!point) continue;
          const scale = point.scale;
          let propWidth = scale * (prop.kind === "building" ? 7 : prop.kind === "bus" ? 4.5 : 2.4);
          const propHeight = scale * (heights[prop.kind] ?? 2);
          propWidth = Math.min(propWidth, width * 0.9);
          const x = point.x - propWidth / 2;
          const y = point.ground - propHeight;
          context.fillStyle =
            prop.kind === "fire"
              ? `rgba(228, ${86 + Math.sin(time * 8) * 26}, 31, .9)`
              : prop.kind === "pump"
                ? "#ddd5c2"
                : prop.kind === "car" || prop.kind === "bus" || prop.kind === "tanker"
                  ? "#252d2a"
                  : prop.kind === "building"
                    ? "#151b19"
                    : "#3b4540";
          if (prop.kind === "fire") {
            context.beginPath();
            context.moveTo(point.x, y);
            context.lineTo(x + propWidth, point.ground);
            context.lineTo(x, point.ground);
            context.closePath();
            context.fill();
            context.fillStyle = "rgba(238,173,57,.25)";
            context.beginPath();
            context.arc(point.x, point.ground, propWidth, 0, Math.PI * 2);
            context.fill();
          } else {
            context.fillRect(x, y, propWidth, propHeight);
            context.fillStyle = "rgba(255,255,255,.08)";
            context.fillRect(x + propWidth * 0.08, y + propHeight * 0.12, propWidth * 0.84, propHeight * 0.13);
            if (prop.kind === "car" || prop.kind === "bus" || prop.kind === "tanker") {
              context.fillStyle = "#101514";
              context.fillRect(x + propWidth * 0.12, y + propHeight * 0.25, propWidth * 0.76, propHeight * 0.32);
            }
          }
          if (prop.label && scale > 12) {
            context.fillStyle = prop.kind === "pump" ? "#a63226" : "#d4c58f";
            context.font = `700 ${clamp(scale * 0.3, 8, 18)}px monospace`;
            context.textAlign = "center";
            context.fillText(prop.label, point.x, y + propHeight * 0.18);
          }
        } else if (renderable.type === "enemy") {
          const enemy = renderable.data;
          const point = project(enemy, enemy.kind === "runner" ? 1.75 : 1.95);
          if (!point) continue;
          const bodyHeight = clamp(point.scale * (enemy.kind === "runner" ? 1.75 : 1.95), 13, height * 0.6);
          const bodyWidth = bodyHeight * 0.31;
          const sway = Math.sin(time * (enemy.kind === "runner" ? 9 : 4) + enemy.id) * bodyWidth * 0.12;
          const enemySprite = spritesRef.current[enemy.kind];
          context.save();
          context.translate(point.x + sway, point.ground);
          context.fillStyle = "rgba(0,0,0,.28)";
          context.beginPath();
          context.ellipse(0, 2, bodyHeight * 0.2, bodyHeight * 0.055, 0, 0, Math.PI * 2);
          context.fill();
          if (enemySprite?.complete && enemySprite.naturalWidth > 0) {
            const spriteSize = bodyHeight * (enemy.kind === "runner" ? 1.26 : 1.18);
            context.filter =
              enemy.hitFlash > 0
                ? "brightness(2.1) saturate(.6) sepia(.5)"
                : enemy.kind === "runner"
                  ? "contrast(1.08) saturate(.92)"
                  : "contrast(1.04) saturate(.82)";
            context.drawImage(
              enemySprite,
              -spriteSize / 2,
              -spriteSize * 0.98,
              spriteSize,
              spriteSize,
            );
            context.filter = "none";
          } else {
            context.fillStyle =
              enemy.hitFlash > 0 ? "#e6d6b9" : enemy.kind === "runner" ? "#582a22" : "#202923";
            context.beginPath();
            context.ellipse(0, -bodyHeight * 0.86, bodyWidth * 0.38, bodyWidth * 0.42, 0, 0, Math.PI * 2);
            context.fill();
            context.fillRect(-bodyWidth / 2, -bodyHeight * 0.77, bodyWidth, bodyHeight * 0.48);
          }
          if (point.depth < 18) {
            const barWidth = bodyHeight * 0.56;
            context.fillStyle = "rgba(0,0,0,.6)";
            context.fillRect(-barWidth / 2, -bodyHeight - 11, barWidth, 4);
            context.fillStyle = "#b64c38";
            context.fillRect(
              -barWidth / 2,
              -bodyHeight - 11,
              barWidth * clamp(enemy.hp / enemy.maxHp, 0, 1),
              4,
            );
          }
          context.restore();
        } else {
          const item = renderable.data;
          const point = project(item, 1.2 + Math.sin(time * 3) * 0.12);
          if (!point) continue;
          const radius = clamp(point.scale * 0.34, 8, 25);
          context.strokeStyle = "rgba(240,182,60,.72)";
          context.lineWidth = 2;
          context.beginPath();
          context.arc(point.x, point.y, radius, 0, Math.PI * 2);
          context.stroke();
          context.fillStyle = "rgba(240,182,60,.88)";
          context.font = `700 ${clamp(radius, 9, 18)}px monospace`;
          context.textAlign = "center";
          context.fillText(item.glyph, point.x, point.y + radius * 0.32);
          context.strokeStyle = "rgba(240,182,60,.28)";
          context.beginPath();
          context.moveTo(point.x, point.y + radius);
          context.lineTo(point.x, point.ground);
          context.stroke();
        }
      }

      if (chapter !== "escape") {
        const bob =
          keysRef.current.w || keysRef.current.s || keysRef.current.a || keysRef.current.d
            ? Math.sin(time * 11) * 3
            : 0;
        const px = width / 2 - Math.min(width, height) * 0.055;
        const py = height * 0.88 + bob;
        const scale = clamp(Math.min(width, height) / 720, 0.62, 1.3);
        const protagonistSprite = spritesRef.current.protagonist;
        const protagonistSize = clamp(Math.min(width, height) * 0.39, 205, 400);
        context.save();
        context.translate(px, py);
        context.fillStyle = "rgba(0,0,0,.42)";
        context.beginPath();
        context.ellipse(0, 5, protagonistSize * 0.2, protagonistSize * 0.045, 0, 0, Math.PI * 2);
        context.fill();
        if (protagonistSprite?.complete && protagonistSprite.naturalWidth > 0) {
          const attackLean = runtime.player.attack > 0 ? -0.075 : 0;
          context.rotate(attackLean);
          context.filter = runtime.player.dodge > 0 ? "brightness(1.18) saturate(.8)" : "none";
          context.drawImage(
            protagonistSprite,
            -protagonistSize / 2,
            -protagonistSize,
            protagonistSize,
            protagonistSize,
          );
          context.filter = "none";
          if (runtime.player.attack > 0) {
            context.strokeStyle = "rgba(235,205,142,.62)";
            context.lineWidth = Math.max(2, protagonistSize * 0.012);
            context.beginPath();
            context.arc(
              protagonistSize * 0.17,
              -protagonistSize * 0.43,
              protagonistSize * 0.31,
              -1.15,
              0.18,
            );
            context.stroke();
          }
        } else {
          context.fillStyle = "#303a35";
          context.fillRect(-31 * scale, -91 * scale, 62 * scale, 86 * scale);
        }
        context.restore();

        if (rescued && chapter !== "hospital") {
          const mayaSprite = spritesRef.current.maya;
          const mayaSize = clamp(Math.min(width, height) * 0.29, 150, 310);
          const mayaX = width * 0.59;
          const mayaY = height * 0.84 + bob * 0.65;
          context.save();
          context.translate(mayaX, mayaY);
          context.fillStyle = "rgba(0,0,0,.34)";
          context.beginPath();
          context.ellipse(0, 3, mayaSize * 0.18, mayaSize * 0.04, 0, 0, Math.PI * 2);
          context.fill();
          if (mayaSprite?.complete && mayaSprite.naturalWidth > 0) {
            context.drawImage(mayaSprite, -mayaSize / 2, -mayaSize, mayaSize, mayaSize);
          } else {
            context.fillStyle = "#264137";
            context.fillRect(-18 * scale, -64 * scale, 36 * scale, 64 * scale);
          }
          context.restore();
        }
      } else {
        const lean = clamp(player.x / 9, -1, 1);
        const bikeY = height * 0.76;
        const protagonistSprite = spritesRef.current.protagonist;
        context.save();
        context.translate(width / 2 + lean * 42, bikeY);
        context.rotate(lean * 0.09);
        context.fillStyle = "#0a0d0c";
        context.beginPath();
        context.ellipse(-34, 27, 27, 10, 0, 0, Math.PI * 2);
        context.ellipse(37, 27, 27, 10, 0, 0, Math.PI * 2);
        context.fill();
        if (protagonistSprite?.complete && protagonistSprite.naturalWidth > 0) {
          context.drawImage(protagonistSprite, -75, -143, 150, 150);
        }
        context.fillStyle = "#8c4a2f";
        context.fillRect(-28, 0, 66, 18);
        context.fillStyle = "#151b18";
        context.fillRect(-17, -12, 52, 19);
        context.strokeStyle = "#313b36";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(22, -4);
        context.lineTo(45, -38);
        context.stroke();
        context.restore();
      }

      if (runtime.hitTint > 0) {
        context.fillStyle = `rgba(158,33,25,${runtime.hitTint * 0.45})`;
        context.fillRect(0, 0, width, height);
      }

      const fog = context.createLinearGradient(0, horizon - 20, 0, height);
      fog.addColorStop(0, "rgba(210,208,189,.11)");
      fog.addColorStop(0.35, "rgba(15,20,18,0)");
      fog.addColorStop(1, "rgba(0,0,0,.18)");
      context.fillStyle = fog;
      context.fillRect(0, 0, width, height);
    },
    [chapter, rescued],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const ratio = clamp(window.devicePixelRatio || 1, 1, 1.75);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (timestamp: number) => {
      const dt = Math.min(0.035, (timestamp - (lastTimeRef.current || timestamp)) / 1000);
      lastTimeRef.current = timestamp;
      const rect = canvas.getBoundingClientRect();
      const runtime = stateRef.current;

      if (mode === "playing") {
        runtime.elapsed += dt;
        runtime.player.attack = Math.max(0, runtime.player.attack - dt);
        runtime.player.dodge = Math.max(0, runtime.player.dodge - dt);
        runtime.hitTint = Math.max(0, runtime.hitTint - dt * 1.8);
        runtime.chapterCard = Math.max(0, runtime.chapterCard - dt);

        const keys = keysRef.current;
        if (keys.e) {
          keys.e = false;
          interact();
        }
        if (keys[" "]) {
          keys[" "] = false;
          dodge();
        }
        if (keys.f || keys.enter) {
          keys.f = false;
          keys.enter = false;
          attack();
        }
        if (keys.h) {
          keys.h = false;
          useMedicine();
        }

        let moveX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
        let moveZ = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
        const moving = Math.abs(moveX) + Math.abs(moveZ) > 0;
        const sprinting = Boolean(keys.shift && staminaRef.current > 2 && chapter !== "escape");
        const dodgeBoost = runtime.player.dodge > 0 ? 2.65 : 1;
        const speed =
          chapter === "escape" ? 9.5 : (sprinting ? 5.7 : 3.45) * dodgeBoost;

        if (moving) {
          const length = Math.hypot(moveX, moveZ) || 1;
          moveX /= length;
          moveZ /= length;
          if (chapter === "escape") {
            runtime.player.x = clamp(runtime.player.x + moveX * speed * dt, -8, 8);
          } else {
            const sin = Math.sin(runtime.player.yaw);
            const cos = Math.cos(runtime.player.yaw);
            runtime.player.x += (moveX * cos + moveZ * sin) * speed * dt;
            runtime.player.z += (moveZ * cos - moveX * sin) * speed * dt;
            runtime.player.x = clamp(runtime.player.x, -10, 10);
            runtime.player.z = clamp(runtime.player.z, -3, 35);
          }
          runtime.steps += dt * speed;
        }

        if (keys.q) runtime.player.yaw -= dt * 1.5;
        if (keys.r) runtime.player.yaw += dt * 1.5;

        if (sprinting && moving) {
          staminaRef.current = clamp(staminaRef.current - dt * 18, 0, 100);
        } else if (!runtime.player.dodge) {
          staminaRef.current = clamp(staminaRef.current + dt * 13, 0, 100);
        }

        if (chapter === "escape") {
          runtime.escapeProgress = clamp(runtime.escapeProgress + dt / 35, 0, 1);
          runtime.player.z += dt * 12;
          if (runtime.waveClock <= 0) {
            runtime.waveClock = 2.2;
            const side = Math.random() * 16 - 8;
            spawnEnemy(Math.random() > 0.55 ? "runner" : "walker", side, runtime.player.z + 32);
          }
          runtime.waveClock -= dt;

          for (const enemy of runtime.enemies) {
            enemy.z -= dt * (enemy.kind === "runner" ? 2 : 0);
            if (Math.abs(enemy.x - runtime.player.x) < 1.25 && enemy.z - runtime.player.z < 2.4 && enemy.z > runtime.player.z - 1) {
              enemy.hp = 0;
              runtime.hitTint = 0.8;
              setHealth((value) => {
                const next = clamp(value - 7, 0, 100);
                healthRef.current = next;
                return next;
              });
            }
          }
          runtime.enemies = runtime.enemies.filter(
            (enemy) => enemy.hp > 0 && enemy.z > runtime.player.z - 8,
          );
          if (runtime.escapeProgress >= 1) {
            setMode("ending");
            window.localStorage.removeItem(SAVE_KEY);
            setHasSave(false);
          }
        } else {
          if (chapter === "station" && step === 1) {
            runtime.fuelProgress = clamp(runtime.fuelProgress + dt / 48, 0, 1);
            runtime.waveClock -= dt;
            if (runtime.waveClock <= 0) {
              runtime.waveClock = Math.max(2.3, 6 - runtime.fuelProgress * 3);
              const side = Math.random() > 0.5 ? -9 : 9;
              spawnEnemy(runtime.fuelProgress > 0.34 && Math.random() > 0.5 ? "runner" : "walker", side, 31);
            }
            if (runtime.fuelProgress >= 1) {
              advanceStep(2);
              showToast("Tank full · barricade failing");
              playTone(740, 0.28, 0.055, "triangle");
            }
          }

          for (const enemy of runtime.enemies) {
            enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
            enemy.attackClock = Math.max(0, enemy.attackClock - dt);
            const d = distance(enemy, runtime.player);
            if (d > 1.15) {
              const speedValue = enemy.kind === "runner" ? 2.05 : 0.95;
              enemy.x += ((runtime.player.x - enemy.x) / d) * speedValue * dt;
              enemy.z += ((runtime.player.z - enemy.z) / d) * speedValue * dt;
            } else if (enemy.attackClock <= 0 && runtime.player.dodge <= 0) {
              enemy.attackClock = enemy.kind === "runner" ? 0.75 : 1.25;
              runtime.hitTint = 0.9;
              setHealth((value) => {
                const next = clamp(value - (enemy.kind === "runner" ? 11 : 8), 0, 100);
                healthRef.current = next;
                return next;
              });
              playTone(52, 0.18, 0.07, "sawtooth");
            }
          }

          const dead = runtime.enemies.filter((enemy) => enemy.hp <= 0);
          if (dead.length) {
            setKills((value) => value + dead.length);
            runtime.enemies = runtime.enemies.filter((enemy) => enemy.hp > 0);
            if (chapter === "hospital" && step === 3 && runtime.enemies.length === 0) {
              advanceStep(4);
              showToast("Stairwell clear · find the ambulance entrance");
            }
          }

          const near = runtime.interactions
            .filter((item) => item.active && distance(item, runtime.player) < 2.7)
            .sort((a, b) => distance(a, runtime.player) - distance(b, runtime.player))[0];
          setPrompt((current) => (current?.id === near?.id ? current : near ?? null));
        }

        if (healthRef.current <= 0) {
          setMode("paused");
          healthRef.current = 35;
          setHealth(35);
          const start = initialPlayer(chapter);
          runtime.player.x = start.x;
          runtime.player.z = start.z;
          runtime.enemies = [];
          showToast("You blacked out · progress restored at last checkpoint");
        }

        if (timestamp - hudClockRef.current > 100) {
          hudClockRef.current = timestamp;
          setStamina(staminaRef.current);
          if (chapter === "station") setFuelProgress(runtime.fuelProgress);
          if (chapter === "escape") setEscapeProgress(runtime.escapeProgress);
        }
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      const ratio = clamp(window.devicePixelRatio || 1, 1, 1.75);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawScene(context, rect.width, rect.height, timestamp / 1000);
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [
    advanceStep,
    attack,
    chapter,
    dodge,
    drawScene,
    interact,
    mode,
    playTone,
    showToast,
    spawnEnemy,
    step,
    useMedicine,
  ]);

  const buttonControl = (key: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      keysRef.current[key] = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      keysRef.current[key] = false;
    },
    onPointerCancel: () => {
      keysRef.current[key] = false;
    },
  });

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerRef.current = { id: event.pointerId, x: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = event.clientX - pointer.x;
    stateRef.current.player.yaw += delta * 0.0045;
    pointer.x = event.clientX;
  };

  const onCanvasPointerUp = () => {
    pointerRef.current = null;
  };

  const objective = OBJECTIVES[chapter][clamp(step, 0, OBJECTIVES[chapter].length - 1)];
  const chapterInfo = CHAPTERS[chapter];

  return (
    <main className="game-shell" aria-label="Last Bus Out playable survival game">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="Game world. Use W A S D to move, drag to look, F to attack, E to interact."
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
      />
      <div className="noise" />
      <div className="vignette" />
      <div className="letterbox" />

      {mode !== "menu" && mode !== "ending" && (
        <>
          <div className="top-hud">
            <div className="brand-lockup">
              <span className="route-mark" />
              <span>
                <strong>Last Bus Out</strong>
                <small>{chapterInfo.location}</small>
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
              <button className="icon-button" aria-label="Pause game" onClick={() => setMode("paused")}>
                Ⅱ
              </button>
            </div>
          </div>

          <div className="status-stack">
            <div className="bar-row">
              <span>Health</span>
              <span className="bar-track"><span className="bar-fill health" style={{ width: `${health}%` }} /></span>
              <span>{Math.round(health)}</span>
            </div>
            <div className="bar-row">
              <span>Stamina</span>
              <span className="bar-track"><span className="bar-fill stamina" style={{ width: `${stamina}%` }} /></span>
              <span>{Math.round(stamina)}</span>
            </div>
            <div className="inventory-line">
              <span>AXE · READY</span>
              <span>MED · {medicine}</span>
              <span>AMMO · {ammo}</span>
            </div>
          </div>

          {prompt && (
            <button className="prompt" onClick={interact}>
              <span className="keycap">E</span>
              {prompt.label}
            </button>
          )}

          {step === 1 && chapter === "station" && (
            <div className="fuel-meter">
              <div className="fuel-head">
                <span>Fuel transfer</span>
                <strong>{Math.round(fuelProgress * 100)}%</strong>
              </div>
              <div className="fuel-track"><span style={{ width: `${fuelProgress * 100}%` }} /></div>
            </div>
          )}

          {chapter === "escape" && (
            <div className="fuel-meter">
              <div className="fuel-head">
                <span>Distance to safe house</span>
                <strong>{Math.max(0, Math.ceil((1 - escapeProgress) * 4.8))} km</strong>
              </div>
              <div className="fuel-track"><span style={{ width: `${escapeProgress * 100}%` }} /></div>
            </div>
          )}

          <div className="mobile-controls" aria-label="Touch controls">
            <div className="move-pad">
              <button aria-label="Move forward" className="move-button up" {...buttonControl("w")}>▲</button>
              <button aria-label="Move backward" className="move-button down" {...buttonControl("s")}>▼</button>
              <button aria-label="Move left" className="move-button left" {...buttonControl("a")}>◀</button>
              <button aria-label="Move right" className="move-button right" {...buttonControl("d")}>▶</button>
            </div>
            <div className="action-cluster">
              <button className="action-button dodge" onClick={dodge}>Dodge</button>
              <button className="action-button interact" onClick={interact}>Use</button>
              <button className="action-button attack" onClick={attack}>Attack</button>
            </div>
          </div>
        </>
      )}

      {chapterCard > 0 && mode === "playing" && (
        <div className="chapter-card" key={`${chapter}-${chapterCard}`}>
          <small>{chapterInfo.kicker} · {chapterInfo.location}</small>
          <h2>{chapterInfo.title}</h2>
          <p>
            {chapter === "hospital" && "Four days after the sirens stopped, the emergency lights are still on."}
            {chapter === "street" && "The evacuation route is blocked. A weak voice is still transmitting nearby."}
            {chapter === "station" && "One litre left. One working pump. Too much noise between you and Haven."}
            {chapter === "escape" && "The tank is full. The road is not."}
          </p>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {mode === "menu" && (
        <section className="menu-screen">
          <div className="menu-content">
            <div className="eyebrow">Playable vertical slice · Alpha 01</div>
            <h1 className="game-title">
              Last Bus Out
              <span>Road to Haven</span>
            </h1>
            <p className="menu-copy">
              Wake inside an abandoned hospital. Follow the last evacuation signal.
              Rescue who you can—and get fuel before the city notices you are still alive.
            </p>
            <div className="menu-actions">
              <button className="primary-button" onClick={resetRun}>Begin the escape</button>
              {hasSave && <button className="secondary-button" onClick={continueRun}>Continue</button>}
            </div>
            <div className="control-legend">
              <span>WASD · Move</span>
              <span>Drag / Q R · Look</span>
              <span>F · Attack</span>
              <span>E · Interact</span>
              <span>Space · Dodge</span>
              <span>Shift · Sprint</span>
            </div>
          </div>
        </section>
      )}

      {mode === "paused" && (
        <section className="pause-screen">
          <div className="pause-card">
            <div className="eyebrow">Route suspended</div>
            <h2>{health <= 35 ? "Still breathing" : "Paused"}</h2>
            <p>
              Progress is saved at every location. Move carefully—sprinting, attacking,
              and dodging all share the same stamina reserve.
            </p>
            <div className="pause-actions">
              <button className="primary-button" onClick={() => setMode("playing")}>Return to the road</button>
              {medicine > 0 && health < 100 && (
                <button className="secondary-button" onClick={useMedicine}>Use bandage · {medicine} left</button>
              )}
              <button className="secondary-button" onClick={() => { saveGame(); setMode("menu"); }}>Save & exit</button>
            </div>
          </div>
        </section>
      )}

      {mode === "ending" && (
        <section className="ending-screen">
          <div className="ending-card">
            <div className="eyebrow">Safe house reached · Day 04</div>
            <h2>You made it out.<br />Not alone.</h2>
            <p>
              The radio signal continues north. Maya knows of a wrecked transit depot.
              One of the buses there might still run.
            </p>
            <div className="run-stats">
              <div><strong>{kills}</strong><span>Infected stopped</span></div>
              <div><strong>{rescued ? 1 : 0}</strong><span>Survivors rescued</span></div>
              <div><strong>{fuel}%</strong><span>Fuel secured</span></div>
            </div>
            <button className="primary-button" onClick={resetRun}>Play again</button>
          </div>
        </section>
      )}
    </main>
  );
}
