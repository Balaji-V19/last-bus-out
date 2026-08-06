"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import {
  createAnimatedCharacter,
  preloadCharacterModels,
  disposeAnimatedCharacter,
  setAnimatedEquipment,
  setCharacterDetail,
  setCharacterHitFlash,
  updateAnimatedCharacter,
  type AnimatedCharacter,
  type AnimationState,
} from "./game3d/animatedCharacter";
import type {
  GameSoundEvent,
  GameSoundOptions,
} from "./game3d/audio";
import {
  buildWorld,
  computeFlowField,
  disposeWorld,
  flowDirection,
  gridAllows,
  gridSees,
  openDoorCells,
  type BuiltWorld,
  type EquipmentKind,
  type GameChapter,
} from "./game3d/scene";
import { INTRO_CARD_DURATION_SECONDS } from "./game3d/intro";

type Inventory = Partial<Record<EquipmentKind, boolean>>;
type TutorialAction = "look" | "move" | "run" | "dodge" | "perspective" | "interact";
type ViewportMode = "menu" | "intro" | "tutorial" | "playing" | "paused" | "ending";

export type PointOfView = "first" | "third";

type GameViewportProps = {
  chapter: GameChapter;
  mode: ViewportMode;
  step: number;
  rescued: boolean;
  health: number;
  ammo: number;
  inventory: Inventory;
  pov: PointOfView;
  introStage: number;
  tutorialStage: number;
  /** Canvas the minimap draws into. Drawn to directly, never through state. */
  minimapCanvas: HTMLCanvasElement | null;
  /** Full-screen canvas for blood thrown onto the view when the player is hit. */
  bloodCanvas: HTMLCanvasElement | null;
  resetToken: number;
  onReady: () => void;
  onPovChange: (pov: PointOfView) => void;
  onPointerLockLost: () => void;
  onInteraction: (id: string) => void;
  onPromptChange: (prompt: { id: string; label: string } | null) => void;
  onStaminaChange: (value: number) => void;
  onDamage: (amount: number) => void;
  onInfection: (amount: number) => void;
  onKill: () => void;
  onAmmoUsed: () => void;
  onCombatProgress: (combo: number, score: number) => void;
  onEncounterCleared: () => void;
  onFuelProgress: (value: number) => void;
  onEscapeProgress: (value: number) => void;
  onSurvivalProgress: (
    wave: number,
    seconds: number,
    remaining: number,
  ) => void;
  onFearChange: (value: number) => void;
  /** Fired when a wave or scripted encounter is coming, before anything spawns. */
  onWaveWarning: (wave: number, seconds: number) => void;
  /** Distance to the nearest living enemy, or Infinity. Throttled. */
  onThreatProximity: (distance: number) => void;
  /** Whether the player is holding aim, so the HUD can show the mark. */
  onAimChange: (aiming: boolean) => void;
  onTutorialAction: (action: TutorialAction) => void;
  onSound: (event: GameSoundEvent, options?: GameSoundOptions) => void;
};

export type GameViewportHandle = {
  attack: () => void;
  shoot: () => void;
  dodge: () => void;
  interact: () => void;
  togglePerspective: () => void;
  captureLook: () => void;
  releaseLook: () => void;
  setMove: (
    key: "w" | "a" | "s" | "d" | "shift",
    active: boolean,
  ) => void;
};

type HealthBar = {
  group: THREE.Group;
  fill: THREE.Mesh;
  width: number;
};

/**
 * Headings tried when an enemy's direct path is blocked, in order. Straight on
 * first, then progressively wider sweeps to either side.
 */
const ENEMY_AVOID_ANGLES = [0, 0.61, -0.61, 1.22, -1.22, 1.83, -1.83];

/**
 * What each floor is actually underfoot. Every floor previously reported
 * "tile", so an hour of play was an hour of the same footstep.
 */
const FLOOR_SURFACE: Record<GameChapter, GameSoundOptions["surface"]> = {
  hospital: "tile",
  street: "tile",
  station: "concrete",
  checkpoint: "vinyl",
  depot: "vinyl",
  escape: "concrete",
  survival: "grating",
};

type EnemyActor = {
  id: number;
  style: "walker" | "runner" | "heavy";
  hp: number;
  maxHp: number;
  speed: number;
  turnBias: number;
  targetTurnBias: number;
  turnClock: number;
  pace: number;
  targetPace: number;
  paceClock: number;
  gaitPhase: number;
  attackClock: number;
  attackAnimation: number;
  hitTimer: number;
  deathTimer: number;
  dying: boolean;
  /** Seconds spent unable to advance, used to break out of a wall wedge. */
  stuckClock: number;
  /** How many gashes this one is already carrying. */
  wounds: number;
  /** Down and still. The body stays where it fell. */
  dead: boolean;
  /** When it came to rest, so it cannot rise the instant it lands. */
  restedAt: number;
  /** Counts up while getting up, so the rise can be animated. */
  rising: number;
  /** Per-kill death variation, so no two go down the same way. */
  deathSpin: number;
  deathTopple: number;
  deathLean: number;
  deathRate: number;
  deathCollapse: boolean;
  /** Whether the windup cue has fired for the pending swing. */
  telegraphed: boolean;
  /** Countdown to the next proximity breath cue. */
  breathClock: number;
  /** Runners announce a charge once, not every frame they are close. */
  screamed: boolean;
  root: THREE.Group;
  character: AnimatedCharacter | null;
  healthBar: HealthBar;
};

type CompanionActor = {
  root: THREE.Group;
  character: AnimatedCharacter | null;
};

type BloodParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
};

type ShotEffect = {
  line: THREE.Line;
  flash: THREE.PointLight;
  life: number;
};

const UP = new THREE.Vector3(0, 1, 0);

function dampAngle(current: number, target: number, strength: number) {
  let delta = target - current;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  return current + delta * strength;
}

function isInteractionAvailable(
  chapter: GameChapter,
  step: number,
  id: string,
  inventory: Inventory,
) {
  if (chapter === "hospital") {
    if (id === "torch") return step === 0;
    if (id === "radio") return step === 1;
    if (id === "axe") return step === 2;
    if (id === "breaker") return step === 4;
    if (id === "exit") return step >= 6;
  }
  if (chapter === "street") {
    if (id === "signal") return step === 0;
    if (id === "maya") return step === 1;
    if (id === "orderly") return step === 2;
    if (id === "pistol") return !inventory.pistol;
    if (id === "bike") return step >= 3;
  }
  if (chapter === "station") {
    if (id === "generator") return step === 0;
    if (id === "food") return step === 1;
    if (id === "meds") return step === 2;
    if (id === "bike") return step >= 4;
  }
  if (chapter === "checkpoint") {
    if (id === "checkpoint-radio") return step === 0;
    if (id === "fuse") return step === 1;
    if (id === "survivor-family") return step === 3;
    if (id === "checkpoint-gate") return step >= 4;
  }
  if (chapter === "depot") {
    if (id === "depot-key") return step === 0;
    if (id === "battery") return step === 1;
    if (id === "food-cart") return step === 2;
    if (id === "bus") return step >= 4;
  }
  return false;
}

/**
 * Whether an actor of `radius` can stand at (x, z).
 *
 * Floors built from a room graph carry an occupancy grid, which is the only
 * thing that can describe a non-rectangular plan; it is a constant-cost lookup
 * rather than a linear scan over every prop. Floors still using the legacy
 * corridor builder fall back to the rectangle-plus-circles test.
 */
function canOccupy(
  world: BuiltWorld,
  x: number,
  z: number,
  radius = 0.48,
) {
  if (world.grid) return gridAllows(world.grid, x, z, radius);
  const { bounds, collisions } = world;
  if (
    x < bounds.minX ||
    x > bounds.maxX ||
    z < bounds.minZ ||
    z > bounds.maxZ
  ) {
    return false;
  }
  return !collisions.some(
    (collision) =>
      Math.hypot(x - collision.x, z - collision.z) <
      collision.radius + radius,
  );
}

function createHealthBar(): HealthBar {
  const group = new THREE.Group();
  const width = 1.34;
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.1, 0.2),
    new THREE.MeshBasicMaterial({
      color: 0x050706,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    }),
  );
  background.renderOrder = 50;
  group.add(background);
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.045, 0.13),
    new THREE.MeshBasicMaterial({
      color: 0xd8d4c8,
      transparent: true,
      opacity: 0.42,
      depthTest: false,
    }),
  );
  frame.position.z = 0.006;
  frame.renderOrder = 51;
  group.add(frame);
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.095),
    new THREE.MeshBasicMaterial({
      color: 0xb82e25,
      depthTest: false,
      toneMapped: false,
    }),
  );
  fill.position.z = 0.012;
  fill.renderOrder = 52;
  group.add(fill);
  group.visible = false;
  return { group, fill, width };
}

function setHealthBarValue(bar: HealthBar, value: number) {
  const ratio = THREE.MathUtils.clamp(value, 0, 1);
  bar.fill.scale.x = Math.max(0.001, ratio);
  bar.fill.position.x = -(bar.width * (1 - ratio)) / 2;
  const material = bar.fill.material as THREE.MeshBasicMaterial;
  material.color.setHex(ratio > 0.55 ? 0xb82e25 : ratio > 0.25 ? 0xd46624 : 0xe0a12c);
}

export const GameViewport3D = forwardRef<
  GameViewportHandle,
  GameViewportProps
>(function GameViewport3D(props, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const actionsRef = useRef<GameViewportHandle>({
    attack: () => undefined,
    shoot: () => undefined,
    dodge: () => undefined,
    interact: () => undefined,
    togglePerspective: () => undefined,
    captureLook: () => undefined,
    releaseLook: () => undefined,
    setMove: () => undefined,
  });

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useImperativeHandle(
    ref,
    () => ({
      attack: () => actionsRef.current.attack(),
      shoot: () => actionsRef.current.shoot(),
      dodge: () => actionsRef.current.dodge(),
      interact: () => actionsRef.current.interact(),
      togglePerspective: () => actionsRef.current.togglePerspective(),
      captureLook: () => actionsRef.current.captureLook(),
      releaseLook: () => actionsRef.current.releaseLook(),
      setMove: (key, active) => actionsRef.current.setMove(key, active),
    }),
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    const scene = new THREE.Scene();
    // Fog is the horizon: it decides how far down a corridor the player can see
    // before the world stops existing. The old values were a light grey-green
    // haze at 0.019-0.025, which read as overcast daylight and let you take in a
    // whole floor at a glance. These are darker and denser so sightlines die
    // into black at roughly 18-26 m depending on the floor, and the torch beam
    // becomes the thing that pushes that horizon back.
    const atmosphere: Record<
      GameChapter,
      { background: number; fog: number; density: number; exposure: number }
    > = {
      hospital: { background: 0x080c0a, fog: 0x0d1512, density: 0.052, exposure: 1.22 },
      street: { background: 0x080c0a, fog: 0x0c1311, density: 0.055, exposure: 1.2 },
      station: { background: 0x040706, fog: 0x080c0b, density: 0.078, exposure: 1.3 },
      checkpoint: { background: 0x060a09, fog: 0x0a100e, density: 0.062, exposure: 1.26 },
      depot: { background: 0x030605, fog: 0x070b0a, density: 0.07, exposure: 1.3 },
      escape: { background: 0x090d0b, fog: 0x0e1512, density: 0.048, exposure: 1.2 },
      survival: { background: 0x040706, fog: 0x090e0c, density: 0.082, exposure: 1.32 },
    };
    const chapterAtmosphere = atmosphere[props.chapter];
    scene.background = new THREE.Color(chapterAtmosphere.background);
    scene.fog = new THREE.FogExp2(
      chapterAtmosphere.fog,
      chapterAtmosphere.density,
    );
    const baseBackgroundColor = (
      scene.background as THREE.Color
    ).clone();
    const blackoutBackgroundColor = new THREE.Color(0x000000);
    const sceneFog = scene.fog as THREE.FogExp2;
    const baseFogColor = sceneFog.color.clone();
    const blackoutFogColor = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 210);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      stencil: false,
      precision: "mediump",
      powerPreference: "low-power",
    });
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const pixelRatioLimit = coarsePointer ? 1 : 1.2;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, pixelRatioLimit),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Raised alongside the ambient cut in scene.ts: with the interior sun gone
    // the lit pools under each fitting need more exposure to stay readable,
    // which widens the gap between lit and unlit rather than lifting everything.
    renderer.toneMappingExposure = chapterAtmosphere.exposure;
    const baseToneMappingExposure = renderer.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.className = "three-canvas";
    renderer.domElement.setAttribute(
      "aria-label",
      "Three-dimensional game world. Use W A S D to walk, Shift to run, drag to look, F to attack, and E to interact.",
    );
    mount.appendChild(renderer.domElement);

    const world = buildWorld(props.chapter);
    scene.add(world.root);
    const flickerLights: THREE.Light[] = [];
    const localLights: Array<THREE.PointLight | THREE.SpotLight> = [];
    const environmentLights: THREE.Light[] = [];
    const fixtureMaterials = new Set<THREE.MeshStandardMaterial>();
    const shadowScale = new THREE.Vector3();
    world.root.updateMatrixWorld(true);
    world.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.castShadow) {
        if (!object.geometry.boundingSphere) {
          object.geometry.computeBoundingSphere();
        }
        object.getWorldScale(shadowScale);
        const shadowRadius =
          (object.geometry.boundingSphere?.radius ?? 1) *
          Math.max(shadowScale.x, shadowScale.y, shadowScale.z);
        if (shadowRadius < 0.3) object.castShadow = false;
      }
      if (object instanceof THREE.Mesh) {
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of objectMaterials) {
          if (
            material instanceof THREE.MeshStandardMaterial &&
            material.emissiveIntensity > 0.25
          ) {
            material.userData.baseEmissiveIntensity ??=
              material.emissiveIntensity;
            fixtureMaterials.add(material);
          }
        }
      }
      if (object instanceof THREE.Light && object.userData.flicker) {
        flickerLights.push(object);
      }
      if (
        object instanceof THREE.HemisphereLight ||
        object instanceof THREE.DirectionalLight
      ) {
        object.userData.baseIntensity ??= object.intensity;
        environmentLights.push(object);
      }
      if (
        object instanceof THREE.PointLight ||
        object instanceof THREE.SpotLight
      ) {
        object.userData.baseIntensity ??= object.intensity;
        localLights.push(object);
        object.visible = false;
      }
    });
    const flickerLightSet = new Set(flickerLights);
    // A film camera would carry a restrained fill so an unpowered room still
    // reads as a room. This light exists only for the opening and is kept out
    // of the gameplay light budget, where darkness and the torch are mechanics.
    const cinematicFill = new THREE.PointLight(0xcbd8cc, 7.2, 20, 1.65);
    cinematicFill.visible = false;
    cinematicFill.castShadow = false;
    scene.add(cinematicFill);

    const playerRoot = new THREE.Group();
    playerRoot.position.copy(world.start);
    scene.add(playerRoot);
    // The torch is now the primary light source rather than a highlight on top
    // of ambient, so it is brighter, reaches further, and has a softer edge to
    // give the beam a readable falloff against the darker corridors.
    const flashlight = new THREE.SpotLight(
      0xeaf4dc,
      11.5,
      34,
      Math.PI / 8,
      0.55,
      1.25,
    );
    flashlight.position.set(0.28, 1.46, -0.34);
    flashlight.castShadow = false;
    const flashlightTarget = new THREE.Object3D();
    flashlightTarget.position.set(0.1, 1.02, -10);
    flashlight.target = flashlightTarget;
    playerRoot.add(flashlight, flashlightTarget);
    let hero: AnimatedCharacter | null = null;
    let introClock = 0;
    let observedIntroStage = -1;
    // Every character model is fetched before the loading screen clears, not
    // just the hero. The infected body is the one the player meets first and
    // it was previously requested only when a zombie spawned, so on a cold
    // cache the enemy was an invisible empty group for several seconds.
    void preloadCharacterModels()
      .then(() => createAnimatedCharacter("hero"))
      .then((character) => {
        if (disposed) {
          disposeAnimatedCharacter(character);
          return;
        }
        hero = character;
        introClock = 0;
        setAnimatedEquipment(character, propsRef.current.inventory);
        playerRoot.add(character.root);
        requestAnimationFrame(() => {
          if (!disposed) propsRef.current.onReady();
        });
      })
      .catch(() => {
        // Never leave the player stuck on the loading screen.
        if (!disposed) propsRef.current.onReady();
      });

    let maya: CompanionActor | null = null;
    let mayaLoading = false;
    const enemies: EnemyActor[] = [];
    const bloodParticles: BloodParticle[] = [];
    const bloodDecals: THREE.Mesh[] = [];
    const shotEffects: ShotEffect[] = [];
    const bloodGeometry = new THREE.IcosahedronGeometry(0.045, 1);
    const bloodMaterial = new THREE.MeshStandardMaterial({
      color: 0x67130f,
      roughness: 0.74,
      metalness: 0.02,
    });
    const bloodDecalMaterial = new THREE.MeshStandardMaterial({
      color: 0x4d0c09,
      transparent: true,
      opacity: 0.76,
      roughness: 0.28,
      depthWrite: false,
    });

    const keys: Record<string, boolean> = {};
    const movement = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const dodgeDirection = new THREE.Vector3();
    const enemySideways = new THREE.Vector3();
    const enemyChaseDirection = new THREE.Vector3();
    const enemyOffset = new THREE.Vector3();
    const heroForwardVector = new THREE.Vector3();
    const toEnemyVector = new THREE.Vector3();
    const attackDirectionVector = new THREE.Vector3();
    const bloodOrigin = new THREE.Vector3();
    const healthBarOffset = new THREE.Vector3();
    const companionFollowOffset = new THREE.Vector3();
    const companionTarget = new THREE.Vector3();
    const companionOffset = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraTargetOffset = new THREE.Vector3(0, 1.28, 0);
    const cameraLookAhead = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const cameraShakeOffset = new THREE.Vector3();
    const deathAxis = new THREE.Vector3();
    /** Bodies left on the floor, oldest first. */
    const corpses: EnemyActor[] = [];
    /** Rate limiter for the reanimation roll, so it is not tested per frame. */
    let corpseCheckClock = 0;
    const beamToObject = new THREE.Vector3();
    const beamForward = new THREE.Vector3();
    const lastPlayerPosition = playerRoot.position.clone();
    const tutorialPositionBeforeMove = new THREE.Vector3();
    const livingEnemies: EnemyActor[] = [];
    let animationFrame = 0;
    let cameraYaw = 0;
    // Third-person pitch raises the camera on its boom, so positive looks DOWN.
    // First-person pitch is the eye's own rotation.x, where positive looks UP.
    // They are kept separate deliberately: folding them into one value inverts
    // the look direction the moment the player toggles.
    let cameraPitch = 0.2;
    let lookPitch = 0;
    // Shorter than before: the rooms are 4-14 m across, so a 4.35 m boom spent
    // most of its time inside a wall.
    let cameraDistance = props.chapter === "survival" ? 3.4 : 3.1;
    let bobPhase = 0;
    let bobAmplitude = 0;
    let sprintBlend = 0;
    let eyeHeight = 1.62;
    let kickPitch = 0;
    let kickPitchVelocity = 0;
    let kickYaw = 0;
    let lastStrideSign = 1;
    let sprinting = false;
    /** Holding aim: tightens the shot and shows the reticle. */
    let aiming = false;
    let aimReported = false;
    let exertion = 0;
    let exertionClock = 0;
    let dragPointer: { id: number; x: number; y: number } | null = null;

    // Stereo placement for a world position, relative to where the player is
    // facing. Every sound cue used to pan on raw world X, which meant the
    // stereo image did not rotate with the camera: turning 180 degrees left a
    // growl on the same ear, and anything directly ahead or behind collapsed to
    // centre. Projecting onto the camera's right vector and normalising by
    // distance gives the sine of the bearing, which is what the ear expects.
    // ---- minimap -----------------------------------------------------------
    // The floor plan never changes while a chapter is loaded, so it is rendered
    // once into an offscreen canvas and blitted each update; only the player
    // marker and objective pips are redrawn. Drawing goes straight to the DOM
    // canvas, never through React state.
    const MINIMAP_SIZE = 132;
    const minimapWorld = { minX: 0, minZ: 0, scale: 1 };
    let minimapBase: HTMLCanvasElement | null = null;
    let minimapClock = 0;

    const buildMinimapBase = () => {
      const span = Math.max(
        world.bounds.maxX - world.bounds.minX,
        world.bounds.maxZ - world.bounds.minZ,
      );
      if (span <= 0) return;
      const scale = (MINIMAP_SIZE - 8) / span;
      minimapWorld.minX = world.bounds.minX;
      minimapWorld.minZ = world.bounds.minZ;
      minimapWorld.scale = scale;

      const base = document.createElement("canvas");
      base.width = MINIMAP_SIZE;
      base.height = MINIMAP_SIZE;
      const context = base.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      const toMap = (x: number, z: number): [number, number] => [
        4 + (x - minimapWorld.minX) * scale,
        4 + (z - minimapWorld.minZ) * scale,
      ];

      if (world.grid) {
        // Room-graph floor: paint walkable cells, which gives an accurate plan
        // including doorways and dead ends.
        const grid = world.grid;
        const cellSize = Math.max(1, Math.ceil(grid.cell * scale));
        context.fillStyle = "rgba(150, 176, 158, 0.34)";
        for (let row = 0; row < grid.height; row += 1) {
          for (let column = 0; column < grid.width; column += 1) {
            if ((grid.data[row * grid.width + column] & 1) === 0) continue;
            const [mapX, mapY] = toMap(
              grid.originX + column * grid.cell,
              grid.originZ + row * grid.cell,
            );
            context.fillRect(mapX, mapY, cellSize, cellSize);
          }
        }
      } else {
        // Legacy corridor floor: the walkable area is the bounds rectangle with
        // the collision circles punched out.
        const [x0, y0] = toMap(world.bounds.minX, world.bounds.minZ);
        const [x1, y1] = toMap(world.bounds.maxX, world.bounds.maxZ);
        context.fillStyle = "rgba(150, 176, 158, 0.34)";
        context.fillRect(x0, y0, x1 - x0, y1 - y0);
        context.fillStyle = "rgba(10, 16, 14, 0.72)";
        for (const collision of world.collisions) {
          const [cx, cy] = toMap(collision.x, collision.z);
          context.beginPath();
          context.arc(cx, cy, Math.max(1, collision.radius * scale), 0, Math.PI * 2);
          context.fill();
        }
      }
      minimapBase = base;
    };

    const drawMinimap = () => {
      const canvas = propsRef.current.minimapCanvas;
      if (!canvas || !minimapBase) return;
      if (canvas.width !== MINIMAP_SIZE) canvas.width = MINIMAP_SIZE;
      if (canvas.height !== MINIMAP_SIZE) canvas.height = MINIMAP_SIZE;
      const context = canvas.getContext("2d");
      if (!context) return;
      const { scale } = minimapWorld;
      const toMap = (x: number, z: number): [number, number] => [
        4 + (x - minimapWorld.minX) * scale,
        4 + (z - minimapWorld.minZ) * scale,
      ];

      context.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      context.drawImage(minimapBase, 0, 0);

      // Objective pips: only ones currently available, so the map answers
      // "where now" rather than listing everything on the floor.
      const current = propsRef.current;
      for (const interaction of world.interactions) {
        if (
          !isInteractionAvailable(
            current.chapter,
            current.step,
            interaction.id,
            current.inventory,
          )
        ) {
          continue;
        }
        const [px, py] = toMap(interaction.position.x, interaction.position.z);
        context.fillStyle = "rgba(226, 178, 74, 0.95)";
        context.beginPath();
        context.arc(px, py, 3.1, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(20, 14, 4, 0.85)";
        context.lineWidth = 1;
        context.stroke();
      }

      // Player: a facing wedge, so the map is readable without a compass.
      //
      // A body at rotation.y = h faces world (-sin h, 0, -cos h). The map draws
      // +x rightward and +z downward, so that forward vector lands on the 2D
      // vector (-sin h, -cos h) with no extra half-turn. The previous version
      // added one, which is why the marker pointed backwards.
      const [mx, my] = toMap(playerRoot.position.x, playerRoot.position.z);
      const heading = playerRoot.rotation.y;
      const forwardX = -Math.sin(heading);
      const forwardY = -Math.cos(heading);
      context.fillStyle = "rgba(214, 232, 214, 0.95)";
      context.beginPath();
      for (const [index, [length, spread]] of (
        [
          [6.6, 0],
          [4.4, 2.55],
          [4.4, -2.55],
        ] as const
      ).entries()) {
        const cos = Math.cos(spread);
        const sin = Math.sin(spread);
        const pointX = mx + (forwardX * cos - forwardY * sin) * length;
        const pointY = my + (forwardX * sin + forwardY * cos) * length;
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      }
      context.closePath();
      context.fill();
    };

    buildMinimapBase();

    // ---- blood on the view --------------------------------------------------
    // In first person the camera sits where the player's head is, so world-space
    // blood spawned at chest height is behind the near plane and effectively
    // invisible. Being hit now also throws blood onto the view itself, which is
    // the only way the impact reads from inside the player's own eyes.
    let bloodOverlayAlpha = 0;

    const splashViewBlood = (strength: number, lateralBias: number) => {
      const canvas = propsRef.current.bloodCanvas;
      if (!canvas) return;
      const width = 640;
      const height = 360;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);

      // Biased toward the side the blow came from, heavier toward the edges so
      // the centre of the view stays readable enough to keep fighting or run.
      const originX = width * (0.5 + lateralBias * 0.32);
      const originY = height * 0.46;
      const drops = Math.round(16 + strength * 26);
      for (let index = 0; index < drops; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const spread = Math.pow(Math.random(), 0.55);
        const radius = spread * width * (0.16 + strength * 0.4);
        const x = originX + Math.cos(angle) * radius;
        const y = originY + Math.sin(angle) * radius * 0.62;
        const size = (3 + Math.random() * 16) * (0.5 + strength * 0.8);
        const alpha = 0.3 + Math.random() * 0.5;
        const gradient = context.createRadialGradient(x, y, 0, x, y, size);
        gradient.addColorStop(0, `rgba(96, 6, 4, ${alpha})`);
        gradient.addColorStop(0.62, `rgba(62, 3, 2, ${alpha * 0.72})`);
        gradient.addColorStop(1, "rgba(38, 2, 1, 0)");
        context.fillStyle = gradient;
        context.beginPath();
        // Slightly elliptical and rotated, so drops do not read as circles.
        context.ellipse(
          x,
          y,
          size,
          size * (0.55 + Math.random() * 0.6),
          Math.random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();

        // Occasional run streaking down from a heavier drop.
        if (size > 11 && Math.random() < 0.45) {
          const runLength = size * (1.6 + Math.random() * 3.4);
          const runGradient = context.createLinearGradient(x, y, x, y + runLength);
          runGradient.addColorStop(0, `rgba(74, 4, 3, ${alpha * 0.7})`);
          runGradient.addColorStop(1, "rgba(48, 2, 1, 0)");
          context.fillStyle = runGradient;
          context.fillRect(x - size * 0.16, y, size * 0.32, runLength);
        }
      }
      bloodOverlayAlpha = Math.min(1, 0.55 + strength * 0.5);
    };

    const panScratch = new THREE.Vector3();
    const panFor = (position: THREE.Vector3, limit = 0.92) => {
      panScratch.copy(position).sub(playerRoot.position);
      const distance = Math.max(0.6, panScratch.length());
      const lateral =
        panScratch.x * Math.cos(cameraYaw) - panScratch.z * Math.sin(cameraYaw);
      return THREE.MathUtils.clamp(lateral / distance, -limit, limit);
    };
    let attack = 0;
    let attackHit = false;
    let meleeConnected = false;
    let gunRecoil = 0;
    let dodge = 0;
    let heroHitTimer = 0;
    let stamina = 100;
    let currentPrompt: string | null = null;
    let currentPromptLabel = "";
    let encounterKey = "";
    let encounterWasActive = false;
    let fuelProgress = 0;
    let stationWaveClock = 0;
    let zombieVoiceClock = 1.4 + Math.random() * 1.8;
    let survivalWave = 0;
    let survivalWaveClock = 1.25;
    let survivalTime = 0;
    let survivalReportClock = 0;
    let combo = 0;
    let comboClock = 0;
    let combatScore = 0;
    let escapeDirectorClock = 7;
    let statsClock = 0;
    let progressReportClock = 0;
    let pendingEncounter: (() => void) | null = null;
    let pendingEncounterClock = 0;
    let tutorialObservedStage = -1;
    let tutorialReportedStage = -1;
    let tutorialLookTravel = 0;
    let tutorialMoveTravel = 0;
    let tutorialRunTravel = 0;
    // Routing field toward the player, rebuilt when they have moved far enough
    // for the old one to be misleading. One BFS over ~26k cells is cheap at
    // this cadence and replaces per-enemy pathfinding entirely.
    let flowField: Int32Array | null = null;
    let flowClock = 0;
    let encounterStallClock = 0;
    /** Countdown to the next wandering spawn. Long, so it stays unsettling. */
    let roamClock = 30 + Math.random() * 25;
    const flowOrigin = new THREE.Vector3();
    const enemyFlowDirection = new THREE.Vector3();
    let nextEnemyId = 1;
    let elapsedTime = 0;
    let fear = 8;
    let fearReportClock = 0;
    let heartbeatClock = 0;
    let horrorPulse = 0;
    let cameraShake = 0;
    let lightFailure = 0;
    let lightFailureCooldown = 0;
    let hospitalBlackoutClock = 0;
    let threatBlackoutClock = 0;
    let flashlightWasEquipped = false;
    let previousNearestThreat = 80;

    const roomCentre = (room: string, fallback: THREE.Vector3) => {
      const points = (world.spawnPoints ?? []).filter(
        (point) => point.room === room,
      );
      if (points.length === 0) return fallback.clone();
      const centre = new THREE.Vector3();
      for (const point of points) centre.add(point.position);
      return centre.multiplyScalar(1 / points.length);
    };
    const introVestibule = roomCentre("vestibule", world.start);
    const introTriage = roomCentre(
      "triage",
      world.start.clone().add(new THREE.Vector3(0, 0, -10)),
    );
    const introNurse = roomCentre(
      "nurse",
      world.start.clone().add(new THREE.Vector3(7, 0, -12)),
    );
    const introSouth = roomCentre(
      "southHall",
      world.start.clone().add(new THREE.Vector3(0, 0, -22)),
    );
    const introCameraPosition = new THREE.Vector3();
    const introCameraTarget = new THREE.Vector3();
    let localLightClock = 0;
    let shadowUpdateClock = 0;
    let lastRenderTime = performance.now() - 30;
    const scareFlags = new Set<string>();
    let lastFrameTime = performance.now();

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(
        Math.max(1, rect.width),
        Math.max(1, rect.height),
        false,
      );
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const localLightPosition = new THREE.Vector3();
    const updateLocalLightBudget = (
      delta: number,
      focus = playerRoot.position,
      lightBudget = 5,
    ) => {
      localLightClock -= delta;
      if (localLightClock > 0) return;
      localLightClock = 0.45;
      const nearestLights = localLights
        .map((light) => {
          light.getWorldPosition(localLightPosition);
          return {
            light,
            distance: localLightPosition.distanceToSquared(focus),
          };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, lightBudget);
      const activeLights = new Set(nearestLights.map(({ light }) => light));
      for (const light of localLights) {
        light.visible = activeLights.has(light);
      }
    };

    const spawnBlood = (
      position: THREE.Vector3,
      direction: THREE.Vector3,
      count: number,
    ) => {
      const normalizedDirection = direction.clone().normalize();
      const particleCount = Math.min(
        count,
        14,
        Math.max(0, 56 - bloodParticles.length),
      );
      for (let index = 0; index < particleCount; index += 1) {
        const mesh = new THREE.Mesh(bloodGeometry, bloodMaterial);
        mesh.scale.setScalar(0.58 + Math.random() * 1.18);
        mesh.position.copy(position);
        mesh.position.x += (Math.random() - 0.5) * 0.32;
        mesh.position.y += (Math.random() - 0.5) * 0.34;
        mesh.position.z += (Math.random() - 0.5) * 0.32;
        scene.add(mesh);
        bloodParticles.push({
          mesh,
          velocity: normalizedDirection
            .clone()
            .multiplyScalar(1.25 + Math.random() * 2.6)
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 2.4,
                1.15 + Math.random() * 2.1,
                (Math.random() - 0.5) * 2.4,
              ),
            ),
          life: 0.62 + Math.random() * 0.72,
        });
      }
    };

    /**
     * A wound left where a blow actually landed.
     *
     * Hits used to leave nothing on the body — the same spray every time and no
     * trace afterwards, so a zombie you had buried an axe in twice looked
     * exactly like one you had not touched. The gash is parented to the bone
     * nearest the impact, so it moves with the tissue and stays where it was
     * cut.
     */
    const gashGeometry = new THREE.PlaneGeometry(1, 1);
    const gashMaterial = new THREE.MeshBasicMaterial({
      color: 0x2a0705,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const openWound = (enemy: EnemyActor, direction: THREE.Vector3, heavy: boolean) => {
      const rig = enemy.character?.rig;
      if (!rig) return;
      // Roughly where the swing arrived: high blows land on the head and
      // shoulders, most on the chest, low ones on the legs.
      const roll = Math.random();
      const bone =
        roll > 0.86
          ? rig.head
          : roll > 0.62
            ? Math.random() > 0.5
              ? rig.leftShoulder
              : rig.rightShoulder
            : roll > 0.22
              ? rig.chest
              : rig.torso;
      // Cap it, so a long fight cannot bury an actor under decals.
      if ((enemy.wounds ?? 0) >= 5) return;
      enemy.wounds = (enemy.wounds ?? 0) + 1;

      const gash = new THREE.Mesh(gashGeometry, gashMaterial);
      const length = (heavy ? 0.3 : 0.19) * (0.75 + Math.random() * 0.6);
      gash.scale.set(length, length * (0.16 + Math.random() * 0.14), 1);
      // Sit just proud of the body so it does not z-fight with the skin.
      gash.position.set(
        (Math.random() - 0.5) * 0.11,
        (Math.random() - 0.5) * 0.16,
        0.055 + Math.random() * 0.02,
      );
      // Angled with the swing that made it, so a cut looks like it was cut
      // rather than stamped on.
      gash.rotation.z =
        Math.atan2(direction.y, direction.x) + (Math.random() - 0.5) * 1.5;
      gash.renderOrder = 6;
      gash.userData.ownedGeometry = false;
      bone.add(gash);
    };

    const spawnBloodDecal = (position: THREE.Vector3) => {
      if (bloodDecals.length >= 12) return;
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(0.12 + Math.random() * 0.2, 10),
        bloodDecalMaterial.clone(),
      );
      decal.rotation.x = -Math.PI / 2;
      decal.rotation.z = Math.random() * Math.PI;
      decal.scale.set(1.5 + Math.random(), 0.55 + Math.random() * 0.55, 1);
      decal.position.set(position.x, 0.024, position.z);
      scene.add(decal);
      bloodDecals.push(decal);
    };

    const spawnEnemy = (
      style: "walker" | "runner" | "heavy",
      x: number,
      z: number,
    ) => {
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      root.rotation.y = Math.PI;
      scene.add(root);
      const maxHp = style === "runner" ? 78 : style === "heavy" ? 245 : 112;
      const survivalDifficulty =
        propsRef.current.chapter === "survival"
          ? Math.min(0.8, Math.max(0, survivalWave - 1) * 0.055)
          : 0;
      const scaledMaxHp = Math.round(maxHp * (1 + survivalDifficulty));
      const healthBar = createHealthBar();
      scene.add(healthBar.group);
      const actor: EnemyActor = {
        id: nextEnemyId++,
        style,
        hp: scaledMaxHp,
        maxHp: scaledMaxHp,
        speed:
          (style === "runner" ? 2.75 : style === "heavy" ? 0.88 : 1.3) *
          (1 + survivalDifficulty * 0.28),
        turnBias: (Math.random() - 0.5) * 0.18,
        targetTurnBias: (Math.random() - 0.5) * 0.35,
        turnClock: 0.45 + Math.random() * 1.2,
        pace: 0.86 + Math.random() * 0.24,
        targetPace: 0.82 + Math.random() * 0.34,
        paceClock: 0.65 + Math.random() * 1.4,
        gaitPhase: Math.random() * Math.PI * 2,
        attackClock: 0.5 + Math.random() * 0.7,
        attackAnimation: 0,
        hitTimer: 0,
        deathTimer: 0,
        dying: false,
        stuckClock: 0,
        wounds: 0,
        dead: false,
        restedAt: 0,
        rising: 0,
        deathSpin: 0,
        deathTopple: 0,
        deathLean: 1,
        deathRate: 1,
        deathCollapse: false,
        telegraphed: false,
        breathClock: 0.8 + Math.random() * 2.2,
        screamed: false,
        root,
        character: null,
        healthBar,
      };
      enemies.push(actor);
      const spawnDistance = root.position.distanceTo(playerRoot.position);
      if (spawnDistance < 36 && lightFailureCooldown <= 0) {
        lightFailure = 2.35 + Math.random() * 0.65;
        lightFailureCooldown = 4.8;
        horrorPulse = Math.max(horrorPulse, 1.8);
        propsRef.current.onSound("horror-sting", {
          intensity: THREE.MathUtils.clamp(1 - spawnDistance / 52, 0.42, 0.92),
        });
        propsRef.current.onSound("zombie-growl", {
          intensity: THREE.MathUtils.clamp(1.08 - spawnDistance / 38, 0.32, 0.96),
          pan: panFor(root.position, 0.9),
        });
      }
      propsRef.current.onSound("zombie-alert", {
        intensity: THREE.MathUtils.clamp(1 - spawnDistance / 42, 0.14, 0.72),
        pan: panFor(root.position, 0.9),
      });
      void createAnimatedCharacter(style).then((character) => {
        if (disposed || !enemies.includes(actor)) {
          disposeAnimatedCharacter(character);
          return;
        }
        actor.character = character;
        root.add(character.root);
      });
    };

    /**
     * Spawn inside a named room of a room-graph floor. The offset is nudged
     * back toward the room centre until it lands on walkable floor, so an
     * encounter can never place an enemy inside a wall or a prop.
     */
    /**
     * True when the player could actually watch something appear at this spot:
     * roughly in front of them, close enough to resolve, and not behind a wall.
     * Nothing should ever pop into existence inside the player's view — an
     * arrival is only frightening if it was already there when they turned.
     */
    const isVisibleToPlayer = (x: number, z: number) => {
      const dx = x - playerRoot.position.x;
      const dz = z - playerRoot.position.z;
      const range = Math.hypot(dx, dz);
      if (range > 34) return false;
      if (range < 0.001) return true;
      const facing =
        (-Math.sin(cameraYaw) * dx + -Math.cos(cameraYaw) * dz) / range;
      // cos(50 deg): a little wider than the actual frustum, for safety.
      if (facing < 0.64) return false;
      if (!world.grid) return true;
      return gridSees(world.grid, playerRoot.position.x, playerRoot.position.z, x, z);
    };

    const spawnEnemyInRoom = (
      style: "walker" | "runner" | "heavy",
      room: string,
      offsetX = 0,
      offsetZ = 0,
    ) => {
      const anchor = world.spawnPoints?.find((entry) => entry.room === room);
      if (!anchor) return;
      const candidates: Array<[number, number]> = [];
      for (let attempt = 0; attempt <= 4; attempt += 1) {
        const scale = 1 - attempt * 0.25;
        candidates.push([
          anchor.position.x + offsetX * scale,
          anchor.position.z + offsetZ * scale,
        ]);
      }
      // Prefer somewhere out of sight; fall back to any legal spot rather than
      // failing to spawn and leaving an encounter that can never be cleared.
      for (const [x, z] of candidates) {
        if (!canOccupy(world, x, z, 0.44)) continue;
        if (isVisibleToPlayer(x, z)) continue;
        spawnEnemy(style, x, z);
        return;
      }
      for (const [x, z] of candidates) {
        if (!canOccupy(world, x, z, 0.44)) continue;
        spawnEnemy(style, x, z);
        return;
      }
    };

    const removeEnemy = (enemy: EnemyActor) => {
      const index = enemies.indexOf(enemy);
      if (index >= 0) enemies.splice(index, 1);
      scene.remove(enemy.root, enemy.healthBar.group);
      if (enemy.character) disposeAnimatedCharacter(enemy.character);
    };

    const spawnShotEffect = (target: THREE.Vector3) => {
      const start = playerRoot.position
        .clone()
        .add(new THREE.Vector3(0, 1.24, 0));
      const heroForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        playerRoot.quaternion,
      );
      start.addScaledVector(heroForward, 0.62);
      const geometry = new THREE.BufferGeometry().setFromPoints([start, target]);
      const material = new THREE.LineBasicMaterial({
        color: 0xffd68a,
        transparent: true,
        opacity: 0.86,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 48;
      const flash = new THREE.PointLight(0xffb55c, 10, 6, 2);
      flash.position.copy(start);
      scene.add(line, flash);
      shotEffects.push({ line, flash, life: 0.075 });
    };

    const damageEnemy = (
      enemy: EnemyActor,
      baseDamage: number,
      direction: THREE.Vector3,
      bloodCount: number,
      knockback: number,
    ) => {
      if (enemy.dying) return;
      const current = propsRef.current;
      const damageMultiplier = 1 + Math.min(0.34, combo * 0.035);
      const damage = Math.round(baseDamage * damageMultiplier);
      enemy.hp = Math.max(0, enemy.hp - damage);
      enemy.hitTimer = 0.52;
      setHealthBarValue(enemy.healthBar, enemy.hp / enemy.maxHp);
      enemy.root.position.add(direction.clone().multiplyScalar(knockback));
      spawnBlood(
        enemy.root.position.clone().add(new THREE.Vector3(0, 1.18, 0)),
        direction,
        bloodCount,
      );
      combo = Math.min(12, combo + 1);
      comboClock = 4.25;
      combatScore += Math.round(22 * (1 + combo * 0.18));
      current.onCombatProgress(combo, combatScore);
      if (combo === 4 || combo === 8 || combo === 12) {
        current.onSound("combo", {
          intensity: 0.7 + combo * 0.035,
        });
      }
      openWound(enemy, direction, baseDamage >= 50);
      current.onSound("zombie-hit", {
        intensity: baseDamage >= 50 ? 1.05 : 0.78,
        pan: panFor(enemy.root.position, 0.85),
      });
      if (enemy.hp <= 0) {
        enemy.dying = true;
        // Every kill used to play the one death clip identically, so the head
        // turned twice and the body dropped the same way every time. The clip
        // is the same, but how it plays is not: it is retimed, it starts from a
        // slightly different point, and the body topples in the direction the
        // blow actually came from.
        enemy.deathTimer = 1.45 + Math.random() * 0.6;
        enemy.deathSpin = (Math.random() - 0.5) * 1.4;
        // Falling away from the swing, with a little scatter.
        enemy.deathTopple = Math.atan2(direction.x, direction.z) +
          (Math.random() - 0.5) * 0.7;
        enemy.deathLean = 0.85 + Math.random() * 0.5;
        // A heavier blow drops them harder and faster.
        enemy.deathRate =
          (baseDamage >= 50 ? 1.15 : 0.85) + Math.random() * 0.3;
        // Roughly one in five drops straight down rather than toppling, which
        // breaks the pattern more than any amount of variation within one.
        enemy.deathCollapse = Math.random() < 0.22;
        enemy.healthBar.group.visible = false;
        stamina = Math.min(100, stamina + 9);
        combatScore += Math.round(120 * (1 + combo * 0.12));
        current.onCombatProgress(combo, combatScore);
        current.onSound("zombie-death", {
          pan: panFor(enemy.root.position, 0.85),
        });
        current.onKill();
      }
    };

    const isInteractiveMode = () => {
      const mode = propsRef.current.mode;
      return mode === "playing" || mode === "tutorial";
    };

    const reportTutorialAction = (action: TutorialAction) => {
      const current = propsRef.current;
      if (current.mode !== "tutorial") return;
      if (tutorialReportedStage === current.tutorialStage) return;
      tutorialReportedStage = current.tutorialStage;
      current.onTutorialAction(action);
    };

    const performAttack = () => {
      if (
        propsRef.current.mode !== "playing" ||
        attack > 0 ||
        stamina < 10
      ) {
        return;
      }
      attack = 1;
      attackHit = false;
      stamina = Math.max(0, stamina - 12);
      propsRef.current.onStaminaChange(stamina);
      propsRef.current.onSound(
        propsRef.current.inventory.axe ? "axe-swing" : "attack-swing",
        { weapon: propsRef.current.inventory.axe ? "axe" : "unarmed" },
      );
    };

    const performShoot = () => {
      const current = propsRef.current;
      if (
        current.mode !== "playing" ||
        !current.inventory.pistol ||
        gunRecoil > 0 ||
        attack > 0
      ) {
        return;
      }
      if (current.ammo <= 0) {
        current.onSound("dry-fire");
        return;
      }

      gunRecoil = 0.36;
      current.onAmmoUsed();
      current.onSound("gunshot");
      // Fire where the player is looking rather than at whoever is nearest.
      // The old version auto-aimed inside a wide cone, which is why pressing G
      // felt like it fired itself.
      const heroForward = new THREE.Vector3();
      camera.getWorldDirection(heroForward);
      const muzzle = camera.position.clone();

      // Unaimed fire is a spray; aiming down the sights tightens it right up.
      // That is the whole reason to hold aim.
      const acceptance = aiming ? 0.995 : 0.955;
      let target: EnemyActor | null = null;
      let bestTargetScore = -Infinity;
      let headshot = false;
      for (const enemy of enemies) {
        if (enemy.dying) continue;
        const offset = enemy.root.position
          .clone()
          .add(new THREE.Vector3(0, 1.05, 0))
          .sub(muzzle);
        const distance = offset.length();
        if (distance > 30 || distance < 0.8) continue;
        const aim = heroForward.dot(offset.normalize());
        if (aim < acceptance) continue;
        // Blocked by a wall? Then it is not a shot.
        if (
          world.grid &&
          !gridSees(
            world.grid,
            playerRoot.position.x,
            playerRoot.position.z,
            enemy.root.position.x,
            enemy.root.position.z,
          )
        ) {
          continue;
        }
        const targetScore = aim * 2.2 - distance / 38;
        if (targetScore > bestTargetScore) {
          bestTargetScore = targetScore;
          target = enemy;
          // Whether the ray passes through the head rather than the chest.
          const headOffset = enemy.root.position
            .clone()
            .add(new THREE.Vector3(0, enemy.character?.height ?? 1.8, 0))
            .sub(muzzle)
            .normalize();
          headshot = heroForward.dot(headOffset) > (aiming ? 0.997 : 0.9925);
        }
      }

      if (target) {
        const targetPoint = target.root.position
          .clone()
          .add(new THREE.Vector3(0, 1.2, 0));
        const direction = target.root.position
          .clone()
          .sub(playerRoot.position)
          .normalize();
        spawnShotEffect(targetPoint);
        // A head shot is a kill on anything but a heavy, which is what makes
        // aiming worth the time it costs.
        damageEnemy(
          target,
          headshot ? 140 : 46,
          direction,
          headshot ? 26 : 13,
          0.28,
        );
        if (headshot) {
          current.onSound("axe-flesh", { intensity: 1 });
        }
      } else {
        spawnShotEffect(
          playerRoot.position
            .clone()
            .add(new THREE.Vector3(0, 1.24, 0))
            .addScaledVector(heroForward, 27),
        );
      }
    };

    const performDodge = () => {
      if (
        !isInteractiveMode() ||
        dodge > 0 ||
        stamina < 22
      ) {
        return;
      }
      dodge = 1;
      forward
        .set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
        .normalize();
      right.crossVectors(forward, UP).normalize();
      dodgeDirection.set(0, 0, 0);
      if (keys.w) dodgeDirection.add(forward);
      if (keys.s) dodgeDirection.sub(forward);
      if (keys.d) dodgeDirection.add(right);
      if (keys.a) dodgeDirection.sub(right);
      // Evading from a standstill still throws the player away from danger;
      // the old implementation multiplied a zero movement vector and appeared
      // to do nothing when the touch button was tapped.
      if (dodgeDirection.lengthSq() === 0) dodgeDirection.copy(forward);
      dodgeDirection.normalize();
      stamina = Math.max(0, stamina - 22);
      propsRef.current.onStaminaChange(stamina);
      propsRef.current.onSound("dodge");
      if (
        propsRef.current.mode === "tutorial" &&
        propsRef.current.tutorialStage === 3
      ) {
        reportTutorialAction("dodge");
      }
    };

    const performInteract = () => {
      if (!isInteractiveMode() || !currentPrompt) return;
      if (propsRef.current.mode === "tutorial") {
        // The torch is close to the start. Collecting it before orientation
        // reaches its interaction lesson would remove the final prompt and
        // leave a new player unable to complete onboarding.
        if (propsRef.current.tutorialStage !== 5) return;
        reportTutorialAction("interact");
      }
      propsRef.current.onInteraction(currentPrompt);
    };

    const togglePov = () => {
      const next = propsRef.current.pov === "first" ? "third" : "first";
      if (next === "third" && isPointerLocked()) document.exitPointerLock();
      propsRef.current.onPovChange(next);
      if (
        propsRef.current.mode === "tutorial" &&
        propsRef.current.tutorialStage === 4
      ) {
        reportTutorialAction("perspective");
      }
    };

    actionsRef.current = {
      attack: performAttack,
      shoot: performShoot,
      dodge: performDodge,
      interact: performInteract,
      togglePerspective: togglePov,
      // Wrapped rather than passed directly: requestPointerLock is declared
      // further down, so a bare reference here would hit the temporal dead zone.
      captureLook: () => requestPointerLock(),
      releaseLook: () => {
        if (isPointerLocked()) document.exitPointerLock();
      },
      setMove: (key, active) => {
        keys[key] = active;
      },
    };

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "shift",
          "e",
          "f",
          "g",
          " ",
          "q",
          "r",
          "v",
        ].includes(key)
      ) {
        event.preventDefault();
      }
      if (!isInteractiveMode()) return;
      keys[key] = true;
      if (key === "f") performAttack();
      if (key === "g") performShoot();
      if (key === " ") performDodge();
      if (key === "e") performInteract();
      if (key === "v") togglePov();
    };
    const keyUp = (event: KeyboardEvent) => {
      keys[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);

    const isPointerLocked = () =>
      document.pointerLockElement === renderer.domElement;

    const requestPointerLock = () => {
      if (coarsePointer) return;
      if (!isInteractiveMode()) return;
      if (isPointerLocked()) return;
      // Chrome returns a Promise here while the DOM lib still types it void, and
      // it rejects if the browser is still throttling a recent Escape exit.
      const result: unknown = renderer.domElement.requestPointerLock();
      if (result instanceof Promise) result.catch(() => undefined);
    };

    const contextMenu = (event: Event) => event.preventDefault();

    const setAiming = (next: boolean) => {
      if (aiming === next) return;
      aiming = next;
      if (aimReported !== next) {
        aimReported = next;
        propsRef.current.onAimChange(next);
      }
    };

    const pointerDown = (event: PointerEvent) => {
      if (!isInteractiveMode()) return;
      // Right button raises the pistol. Left fires while aiming, so the whole
      // thing works from the mouse without reaching for a key.
      if (event.button === 2) {
        if (propsRef.current.inventory.pistol) setAiming(true);
        event.preventDefault();
        return;
      }
      if (event.button === 0 && aiming) {
        performShoot();
        return;
      }
      // First person uses pointer lock so the look has no drag boundary. Touch
      // devices have no pointer lock, so they keep drag-look in both modes.
      if (propsRef.current.pov === "first" && !coarsePointer) {
        requestPointerLock();
        return;
      }
      dragPointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add("looking");
    };
    const pointerMove = (event: PointerEvent) => {
      const locked = isPointerLocked();
      if (!locked && (!dragPointer || dragPointer.id !== event.pointerId)) {
        return;
      }
      const dx = locked ? event.movementX : event.clientX - dragPointer!.x;
      const dy = locked ? event.movementY : event.clientY - dragPointer!.y;
      if (
        propsRef.current.mode === "tutorial" &&
        propsRef.current.tutorialStage === 0
      ) {
        tutorialLookTravel += Math.abs(dx) + Math.abs(dy);
        if (tutorialLookTravel >= 90) reportTutorialAction("look");
      }
      if (propsRef.current.pov === "first") {
        // Raw pointer-lock deltas run about 1.6x a drag delta, so first person
        // uses a lower coefficient to land on a comparable feel.
        cameraYaw -= dx * 0.0026;
        // Roughly -66 to +60 degrees. Deliberately short of straight up/down:
        // looking at the ceiling plane or through an invisible body breaks it.
        lookPitch = THREE.MathUtils.clamp(
          lookPitch - dy * 0.0026,
          -1.15,
          1.05,
        );
      } else {
        cameraYaw -= dx * 0.0042;
        cameraPitch = THREE.MathUtils.clamp(
          cameraPitch - dy * 0.003,
          -0.08,
          0.58,
        );
      }
      if (dragPointer) {
        dragPointer.x = event.clientX;
        dragPointer.y = event.clientY;
      }
    };
    const pointerUp = (event?: PointerEvent) => {
      if (event && event.button === 2) setAiming(false);
      dragPointer = null;
      renderer.domElement.classList.remove("looking");
    };
    const wheel = (event: WheelEvent) => {
      // Zoom is a third-person concept. Keep the value intact while in first
      // person so toggling back restores the player's chosen boom length.
      if (propsRef.current.pov === "first") return;
      cameraDistance = THREE.MathUtils.clamp(
        cameraDistance + event.deltaY * 0.004,
        2.1,
        4.6,
      );
    };
    // Whether this world has ever actually held the pointer. Changing floor
    // tears down the old canvas, which releases its lock and fires a change
    // event that the freshly-mounted listener also receives. Without this the
    // new world reads that as the player pressing Escape and pauses the game
    // the instant they take a lift to the next floor.
    let hasHeldPointerLock = false;

    const pointerLockChange = () => {
      if (isPointerLocked()) {
        hasHeldPointerLock = true;
        renderer.domElement.classList.add("looking");
        return;
      }
      renderer.domElement.classList.remove("looking");
      if (!hasHeldPointerLock || disposed) return;
      hasHeldPointerLock = false;
      // Escape releases the lock, and browsers disagree about whether the
      // keydown also reaches us. Driving pause off the lock state instead makes
      // Escape behave identically everywhere.
      if (
        propsRef.current.pov === "first" &&
        propsRef.current.mode === "playing"
      ) {
        propsRef.current.onPointerLockLost();
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: true });
    renderer.domElement.addEventListener("contextmenu", contextMenu);
    document.addEventListener("pointerlockchange", pointerLockChange);

    const syncWorldState = (time: number, delta: number) => {
      const current = propsRef.current;
      if (hero) {
        setAnimatedEquipment(
          hero,
          current.inventory,
          gunRecoil > 0 ? "pistol" : "axe",
        );
      }
      flashlight.visible = Boolean(current.inventory.torch);

      if (current.rescued && !maya && !mayaLoading) {
        mayaLoading = true;
        void createAnimatedCharacter("maya").then((character) => {
          mayaLoading = false;
          if (disposed) {
            disposeAnimatedCharacter(character);
            return;
          }
          const root = new THREE.Group();
          root.position.copy(playerRoot.position).add(new THREE.Vector3(1.1, 0, 1.6));
          root.add(character.root);
          scene.add(root);
          maya = { root, character };
        });
      }
      if (!current.rescued && maya) {
        scene.remove(maya.root);
        if (maya.character) disposeAnimatedCharacter(maya.character);
        maya = null;
      }

      for (const interaction of world.interactions) {
        const visible = isInteractionAvailable(
          current.chapter,
          current.step,
          interaction.id,
          current.inventory,
        );
        interaction.object.visible = visible;
        if (!visible) continue;

        if (!interaction.object.userData.portable) continue;

        // Portable pickups keep a token amount of motion (CLAUDE.md allows it
        // for carryables only) but at an amplitude that reads as "handled
        // recently", not as a collectible: a slow turn and a 12 mm rise.
        const restHeight = Number(
          interaction.object.userData.restHeight ?? 0,
        );
        for (const child of interaction.object.children) {
          child.rotation.y = time * 0.16;
          child.position.y = restHeight + Math.sin(time * 1.1) * 0.012;
        }

        // Torchlight is what finds objectives now. Raise the pickup's primed
        // emissive when the beam is actually on it, so sweeping the corridor
        // with the torch is the search mechanic.
        let litFactor = 0;
        if (current.inventory.torch) {
          beamToObject
            .copy(interaction.position)
            .sub(playerRoot.position);
          const range = beamToObject.length();
          if (range < 26) {
            beamToObject.divideScalar(Math.max(0.001, range));
            beamForward
              .set(-Math.sin(playerRoot.rotation.y), 0, -Math.cos(playerRoot.rotation.y))
              .normalize();
            const alignment = beamForward.dot(beamToObject);
            // cos(22.5 deg) — matches the torch cone half-angle of PI/8.
            if (alignment > 0.924) {
              litFactor =
                ((alignment - 0.924) / 0.076) * (1 - range / 26);
            }
          }
        }
        const targetEmissive = THREE.MathUtils.clamp(litFactor, 0, 1) * 0.42;
        interaction.object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (!material.userData.pickupGlow) continue;
            material.emissiveIntensity = THREE.MathUtils.lerp(
              material.emissiveIntensity,
              targetEmissive,
              1 - Math.exp(-delta * 7),
            );
          }
        });
      }

      const spawnKey = `${current.chapter}:${current.step}`;
      if (spawnKey === encounterKey) return;
      encounterKey = spawnKey;
      encounterWasActive = false;

      // Scripted encounters no longer materialise the instant a step flips.
      // The spawn is deferred behind a warning cue so the player hears
      // something coming and has a beat to reposition, which is the whole
      // difference between a scare and an ambush that just happens.
      const arm = (spawn: () => void, warning = 1.9) => {
        pendingEncounter = () => {
          spawn();
          encounterWasActive = true;
          // The pack announces itself as it arrives, from somewhere off to one
          // side, so the player hears roughly where it came from.
          current.onSound("zombie-scream", {
            intensity: 1,
            pan: (Math.random() - 0.5) * 1.4,
          });
        };
        pendingEncounterClock = warning;
        current.onSound("wave-warning", { intensity: 0.9 });
        current.onWaveWarning(0, warning);
      };

      if (
        current.chapter === "hospital" &&
        current.step === 3 &&
        current.inventory.axe
      ) {
        // Room-relative now that Ground Emergency is a room graph rather than a
        // corridor: the old absolute coordinates sat outside the new footprint.
        arm(() => {
          spawnEnemyInRoom("walker", "triage", -2.6, -3.4);
          spawnEnemyInRoom("runner", "bayB", 1.8, -1.2);
          spawnEnemyInRoom("walker", "nurse", 1.4, -1.8);
        });
      } else if (
        current.chapter === "hospital" &&
        current.step === 5 &&
        current.inventory.axe
      ) {
        // Nothing spawns in the stairwell: it is the room the player has to
        // reach to finish the floor, and an enemy parked in it behind a closed
        // door is exactly what used to wedge and stall the encounter.
        arm(() => {
          spawnEnemyInRoom("walker", "southHall", -3.2, 1.4);
          spawnEnemyInRoom("runner", "radiology", 2.6, -1.6);
          spawnEnemyInRoom("walker", "subWait", 2.2, 2.4);
          spawnEnemyInRoom("heavy", "triage", 0, -4.2);
        });
      } else if (current.chapter === "street" && current.step === 1) {
        // Around the ring rather than ahead of the player: on a loop the threat
        // that matters is the one entering behind you.
        arm(() => {
          spawnEnemyInRoom("walker", "northRun", 6.4, 0);
          spawnEnemyInRoom("runner", "eastRun", 0, -7.5);
          spawnEnemyInRoom("walker", "dayroom", 1.6, 2.8);
        });
      } else if (current.chapter === "station" && current.step === 3) {
        arm(() => {
          spawnEnemy("walker", -5.8, -48);
          spawnEnemy("runner", 5.9, -57);
          spawnEnemy("walker", 4, -71);
          stationWaveClock = 0;
        });
      } else if (current.chapter === "checkpoint" && current.step === 2) {
        arm(() => {
          spawnEnemy("walker", -4.8, -51);
          spawnEnemy("runner", 5.4, -57);
          spawnEnemy("heavy", 0.8, -76);
          horrorPulse = 4.8;
          current.onSound("horror-sting", { intensity: 1.1 });
        }, 2.3);
      } else if (current.chapter === "depot" && current.step === 3) {
        arm(() => {
          spawnEnemy("walker", -5.8, -45);
          spawnEnemy("runner", 5.9, -57);
          spawnEnemy("walker", -3.5, -72);
          spawnEnemy("heavy", 4.8, -82);
          horrorPulse = 5.5;
          current.onSound("metal-slam", { intensity: 1.15 });
        }, 2.3);
      } else if (current.chapter === "escape") {
        arm(() => {
          spawnEnemy("walker", -2.8, -31);
          spawnEnemy("runner", 4.2, -68);
          spawnEnemy("heavy", -3.6, -94);
          escapeDirectorClock = 8;
        });
      }
    };

    const updateInteractions = () => {
      const current = propsRef.current;
      let nearestId: string | null = null;
      let nearestLabel = "";
      let nearestDistance = 2.65;
      for (const interaction of world.interactions) {
        if (
          !isInteractionAvailable(
            current.chapter,
            current.step,
            interaction.id,
            current.inventory,
          )
        ) {
          continue;
        }
        const distance = playerRoot.position.distanceTo(interaction.position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestId = interaction.id;
          nearestLabel = interaction.label;
        }
      }
      if (
        nearestId !== currentPrompt ||
        nearestLabel !== currentPromptLabel
      ) {
        currentPrompt = nearestId;
        currentPromptLabel = nearestLabel;
        propsRef.current.onPromptChange(
          nearestId ? { id: nearestId, label: nearestLabel } : null,
        );
      }
    };

    const updateBlood = (delta: number) => {
      for (let index = bloodParticles.length - 1; index >= 0; index -= 1) {
        const particle = bloodParticles[index];
        particle.life -= delta;
        particle.velocity.y -= delta * 6.8;
        particle.mesh.position.addScaledVector(particle.velocity, delta);
        particle.mesh.rotation.x += delta * 8;
        particle.mesh.rotation.z += delta * 5;
        if (particle.mesh.position.y <= 0.03 || particle.life <= 0) {
          if (particle.mesh.position.y <= 0.03 && Math.random() > 0.72) {
            spawnBloodDecal(particle.mesh.position);
          }
          scene.remove(particle.mesh);
          bloodParticles.splice(index, 1);
        }
      }
    };

    const updateShots = (delta: number) => {
      for (let index = shotEffects.length - 1; index >= 0; index -= 1) {
        const shot = shotEffects[index];
        shot.life -= delta;
        const material = shot.line.material as THREE.LineBasicMaterial;
        material.opacity = Math.max(0, shot.life / 0.075);
        shot.flash.intensity = Math.max(0, shot.life * 125);
        if (shot.life <= 0) {
          scene.remove(shot.line, shot.flash);
          shot.line.geometry.dispose();
          material.dispose();
          shotEffects.splice(index, 1);
        }
      }
    };

    const updateIntroCamera = (delta: number) => {
      const requestedStage = THREE.MathUtils.clamp(
        Math.round(propsRef.current.introStage),
        0,
        4,
      );
      if (requestedStage !== observedIntroStage) {
        observedIntroStage = requestedStage;
        introClock = 0;
        // The new shot may be in another room. Re-evaluate its practical
        // lights immediately instead of waiting for the normal budget cadence.
        localLightClock = 0;
      }
      introClock += delta;
      const shotLength = INTRO_CARD_DURATION_SECONDS;
      const shot = requestedStage;
      const raw = THREE.MathUtils.clamp(introClock / shotLength, 0, 1);
      const progress = raw * raw * (3 - 2 * raw);
      const drift = Math.sin(introClock * 0.55) * 0.08;

      if (shot === 0) {
        introCameraPosition.set(
          introVestibule.x - 1.8 + progress * 1.2,
          1.5 + drift,
          introVestibule.z + 3.8 - progress * 2.5,
        );
        introCameraTarget.set(
          introVestibule.x + 2.2,
          1.15,
          introVestibule.z - 2.8,
        );
      } else if (shot === 1) {
        introCameraPosition.set(
          introTriage.x - 1.8 + progress * 1.4,
          1.62 + drift,
          introTriage.z + 4.8 - progress * 3,
        );
        introCameraTarget.set(introTriage.x + 2.8, 1.1, introTriage.z - 4.5);
      } else if (shot === 2) {
        introCameraPosition.set(
          introNurse.x - 4.4 + progress * 0.7,
          1.48 + drift,
          introNurse.z - 2.5 + progress * 0.55,
        );
        introCameraTarget.set(introNurse.x + 0.3, 1.05, introNurse.z + 1.5);
      } else if (shot === 3) {
        introCameraPosition.set(
          introSouth.x + 3.8 - progress * 5.9,
          1.42 + drift,
          introSouth.z + 2.3 - progress * 1.1,
        );
        introCameraTarget.set(introSouth.x, 1.05, introSouth.z - 3.5);
      } else {
        introCameraPosition.set(
          playerRoot.position.x + 3.2 - progress * 0.8,
          playerRoot.position.y + 1.62 + drift,
          playerRoot.position.z + 3.6 - progress * 0.7,
        );
        introCameraTarget.copy(playerRoot.position).setY(1.05);
      }

      camera.position.lerp(
        introCameraPosition,
        1 - Math.exp(-delta * (raw < 0.08 ? 16 : 4.8)),
      );
      camera.lookAt(introCameraTarget);
      if (hero) updateAnimatedCharacter(hero, delta, "idle");
    };

    const animate = (timestamp = performance.now()) => {
      animationFrame = requestAnimationFrame(animate);
      if (document.hidden) {
        lastFrameTime = timestamp;
        lastRenderTime = timestamp;
        return;
      }
      const current = propsRef.current;
      const interactiveMode =
        current.mode === "playing" || current.mode === "tutorial";
      const frameInterval = interactiveMode
        ? 1000 / (coarsePointer ? 36 : 48)
        : current.mode === "intro"
          ? 1000 / 30
          : 1000 / 10;
      const timeSinceRender = timestamp - lastRenderTime;
      if (timeSinceRender < frameInterval) return;
      lastRenderTime =
        timestamp - (timeSinceRender % Math.max(1, frameInterval));
      const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.034);
      lastFrameTime = timestamp;
      elapsedTime += delta;
      const time = elapsedTime;
      if (current.mode === "intro") updateIntroCamera(delta);
      updateLocalLightBudget(
        delta,
        current.mode === "intro" ? camera.position : playerRoot.position,
        current.mode === "intro" ? 9 : 5,
      );
      syncWorldState(time, delta);

      if (current.mode === "intro") {
        // Gameplay darkness is intentional, but the introduction has to
        // establish an actual hospital rather than present silhouettes. Let
        // the camera carry a larger practical-light budget, reduce fog for the
        // shot, and lift existing lights only while the cinematic is active.
        sceneFog.density = chapterAtmosphere.density * 0.64;
        renderer.toneMappingExposure = baseToneMappingExposure * 1.44;
        cinematicFill.visible = true;
        cinematicFill.position
          .copy(camera.position)
          .lerp(introCameraTarget, 0.28);
        cinematicFill.position.y = Math.min(2.25, cinematicFill.position.y + 0.28);
        for (const light of environmentLights) {
          light.intensity = Number(light.userData.baseIntensity ?? 1) * 2.7;
        }
        for (const light of localLights) {
          light.intensity = Number(light.userData.baseIntensity ?? 1) * 1.12;
        }
        for (const material of fixtureMaterials) {
          material.emissiveIntensity =
            Number(material.userData.baseEmissiveIntensity ?? 1) * 1.08;
        }
        renderer.render(scene, camera);
        return;
      }
      cinematicFill.visible = false;
      sceneFog.density = chapterAtmosphere.density;

      if (interactiveMode) {
        if (
          current.mode === "tutorial" &&
          tutorialObservedStage !== current.tutorialStage
        ) {
          tutorialObservedStage = current.tutorialStage;
          tutorialLookTravel = 0;
          tutorialMoveTravel = 0;
          tutorialRunTravel = 0;
        }
        if (keys.q) cameraYaw += delta * 1.4;
        if (keys.r) cameraYaw -= delta * 1.4;
        forward
          .set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
          .normalize();
        right.crossVectors(forward, UP).normalize();
        movement.set(0, 0, 0);
        if (keys.w) movement.add(forward);
        if (keys.s) movement.sub(forward);
        if (keys.d) movement.add(right);
        if (keys.a) movement.sub(right);
        if (movement.lengthSq() > 0) movement.normalize();
        if (dodge > 0) movement.copy(dodgeDirection);

        const moving = movement.lengthSq() > 0;
        // Sprint needs headroom to start, so it cannot flicker on and off at
        // the bottom of the bar; once running it holds until the bar empties.
        if (keys.shift && moving && stamina > (sprinting ? 0.5 : 14)) {
          sprinting = true;
        } else if (!keys.shift || stamina <= 0.5 || !moving) {
          sprinting = false;
        }
        const running = sprinting;
        // Walking was 1.1 m/s, well under a real walking pace, which made the
        // whole game feel like wading and left sprint reading as "normal speed"
        // rather than as running. 1.5 walk against 3.9 sprint is a difference
        // the player can feel. Both stay inside the animation retiming clamp:
        // the walk clip skates above 1.74 m/s and the run clip below 1.72.
        if (aiming && (!current.inventory.pistol || current.ammo <= 0)) {
          setAiming(false);
        }
        let movementSpeed = running ? 3.9 : 1.5;
        // Braced to shoot: you cannot sprint with the pistol up, and you move
        // at a careful walk. That cost is what makes aiming a decision.
        if (aiming) movementSpeed = Math.min(movementSpeed, 1.05);
        if (attack > 0) {
          movementSpeed *= current.inventory.axe ? 0.52 : 0.7;
        }
        if (dodge > 0) movementSpeed *= 2.75;
        const travel = movementSpeed * delta;
        tutorialPositionBeforeMove.copy(playerRoot.position);
        if (moving) {
          const nextX = playerRoot.position.x + movement.x * travel;
          const nextZ = playerRoot.position.z + movement.z * travel;
          if (canOccupy(world, nextX, playerRoot.position.z)) {
            playerRoot.position.x = nextX;
          }
          if (canOccupy(world, playerRoot.position.x, nextZ)) {
            playerRoot.position.z = nextZ;
          }
          if (current.pov !== "first") {
            const targetRotation = Math.atan2(-movement.x, -movement.z);
            playerRoot.rotation.y = dampAngle(
              playerRoot.rotation.y,
              targetRotation,
              Math.min(1, delta * 11),
            );
          }
        }

        if (current.mode === "tutorial") {
          const travelled = playerRoot.position.distanceTo(
            tutorialPositionBeforeMove,
          );
          if (current.tutorialStage === 1) {
            tutorialMoveTravel += travelled;
            if (tutorialMoveTravel >= 1.5) reportTutorialAction("move");
          } else if (current.tutorialStage === 2 && running) {
            tutorialRunTravel += travelled;
            if (tutorialRunTravel >= 2) reportTutorialAction("run");
          }
        }

        // The torch and the hero mesh are both children of playerRoot, so in
        // first person the body must face exactly where the player is looking,
        // undamped and regardless of whether they are moving. Damping it, or
        // gating it on movement, makes the beam swing away when you strafe or
        // freeze when you turn on the spot.
        if (current.pov === "first") {
          playerRoot.rotation.y = cameraYaw;
        }

        // Roughly seven seconds of sprint from full, recovering faster when
        // standing still, so running is a resource rather than a toggle.
        if (running && moving) stamina = Math.max(0, stamina - delta * 14);
        else stamina = Math.min(100, stamina + delta * (moving ? 9 : 17));
        attack = Math.max(0, attack - delta * 1.72);
        gunRecoil = Math.max(0, gunRecoil - delta * 2.8);
        dodge = Math.max(0, dodge - delta * 2.9);
        heroHitTimer = Math.max(0, heroHitTimer - delta);
        if (combo > 0) {
          comboClock -= delta;
          if (comboClock <= 0) {
            combo = 0;
            current.onCombatProgress(0, combatScore);
          }
        }

        const actualSpeed =
          playerRoot.position.distanceTo(lastPlayerPosition) /
          Math.max(delta, 0.001);
        lastPlayerPosition.copy(playerRoot.position);

        // Head bob. Only the eye POSITION is bobbed, never the look axis: a few
        // centimetres of vertical travel reads as walking, whereas rotating the
        // view on the same curve is the classic nausea source. 32 mm is the
        // ceiling here and is deliberately conservative.
        const bobRate = running ? 11.4 : 7.2;
        const bobScale = Math.min(
          1,
          actualSpeed / (running ? 3.15 : 1.35),
        );
        bobPhase += delta * bobRate * bobScale;
        const bobTarget = moving ? (running ? 0.032 : 0.018) : 0;
        bobAmplitude = THREE.MathUtils.lerp(
          bobAmplitude,
          bobTarget,
          1 - Math.exp(-delta * 6),
        );
        sprintBlend = THREE.MathUtils.lerp(
          sprintBlend,
          running && moving ? 1 : 0,
          1 - Math.exp(-delta * 4),
        );

        // Footsteps land on the bob's downstroke rather than on an arbitrary
        // clock, so the step you hear matches the step you feel.
        if (actualSpeed > 0.18) {
          const stride = Math.cos(bobPhase * 2);
          if (stride < 0 && lastStrideSign >= 0) {
            current.onSound("footstep", {
              running,
              surface: FLOOR_SURFACE[current.chapter],
              intensity: running ? 1 : 0.82,
              pan: (Math.random() - 0.5) * 0.16,
            });
          }
          lastStrideSign = stride < 0 ? -1 : 1;
        } else {
          lastStrideSign = 1;
        }

        // The player's own breathing. Running costs air, and a spent player
        // gasping is both feedback that the sprint bar is empty and a horror
        // beat in its own right — you can hear yourself failing to get away.
        exertion = THREE.MathUtils.lerp(
          exertion,
          running && moving ? 1 : stamina < 30 ? 0.55 : 0,
          1 - Math.exp(-delta * 1.4),
        );
        if (exertion > 0.16) {
          exertionClock -= delta;
          if (exertionClock <= 0) {
            exertionClock = THREE.MathUtils.lerp(2.4, 0.78, exertion);
            current.onSound("player-breath", {
              intensity: 0.35 + exertion * 0.5,
            });
          }
        } else {
          exertionClock = 0;
        }

        // View kick is a critically damped spring on the eye's pitch. In third
        // person the positional camera shake below is fine; in first person the
        // same random jitter is the single worst nausea offender, so impacts
        // are expressed as a rotational recoil that settles in about 0.22 s.
        kickPitchVelocity += (-kickPitch * 185 - kickPitchVelocity * 23) * delta;
        kickPitch += kickPitchVelocity * delta;
        kickYaw = THREE.MathUtils.lerp(kickYaw, 0, 1 - Math.exp(-delta * 9));
        if (hero) {
          const heroState: AnimationState =
            heroHitTimer > 0.05
              ? "hit"
              : gunRecoil > 0
                ? "shoot"
                : attack > 0
                ? actualSpeed > 0.36
                  ? "attackRun"
                  : "attack"
                : actualSpeed > 0.12
                  ? // 1.73 rather than 1.6: updateAnimatedCharacter retimes the
                    // clip by locomotionSpeed / referenceSpeed and clamps that
                    // ratio to [0.65, 2.1], so the run clip cannot keep up below
                    // 3.3 * 0.65 = 1.72 m/s and visibly skates if used there.
                    actualSpeed > 1.73
                    ? "run"
                    : "walk"
                  : "idle";
          updateAnimatedCharacter(hero, delta, heroState, actualSpeed);
          setCharacterHitFlash(hero, heroHitTimer > 0 ? heroHitTimer : 0);
          hero.root.rotation.x =
            gunRecoil > 0 ? -Math.sin(gunRecoil * 20) * 0.055 : 0;
        }

        if (attack < 0.65 && attack > 0.18 && !attackHit) {
          attackHit = true;
          heroForwardVector
            .set(0, 0, -1)
            .applyQuaternion(playerRoot.quaternion);
          for (const enemy of enemies) {
            if (enemy.dying) continue;
            toEnemyVector
              .copy(enemy.root.position)
              .sub(playerRoot.position);
            const distance = toEnemyVector.length();
            if (distance > 0.001) {
              toEnemyVector.multiplyScalar(1 / distance);
            }
            if (
              distance < 2.85 &&
              heroForwardVector.dot(toEnemyVector) > -0.05
            ) {
              damageEnemy(
                enemy,
                current.inventory.axe ? 58 : 25,
                toEnemyVector,
                current.inventory.axe ? 24 : 13,
                0.38,
              );
              meleeConnected = true;
            }
          }

          // A swing that finds nothing should not sound like a swing that buries
          // an axe in someone. Connecting plays the wet chop; missing plays the
          // blade biting whatever was behind them.
          if (current.inventory.axe) {
            current.onSound(meleeConnected ? "axe-flesh" : "axe-wall", {
              intensity: meleeConnected ? 1 : 0.6,
            });
          }
          meleeConnected = false;
        }

        for (
          let enemyIndex = enemies.length - 1;
          enemyIndex >= 0;
          enemyIndex -= 1
        ) {
          const enemy = enemies[enemyIndex];
          if (enemy.dying) {
            // Already at rest: nothing to animate until something rouses it.
            if (enemy.dead && enemy.rising === 0) continue;
            enemy.deathTimer -= delta;
            // How far through the fall we are, 0 at the killing blow.
            const fallen = THREE.MathUtils.clamp(
              1 - enemy.deathTimer / 1.75,
              0,
              1,
            );
            const settle = 1 - (1 - fallen) ** 2.6;

            // A body falls by pivoting about its feet and ending flat. The
            // previous version accumulated rotation.y every frame, which spun
            // the corpse on the spot, and sank it into the floor at the same
            // time — between them that is the rolling the player saw. This is
            // a single rotation about one horizontal axis, so it reads as
            // something going over rather than tumbling.
            if (enemy.deathCollapse) {
              // Legs go first: folds down almost in place.
              enemy.root.quaternion.setFromAxisAngle(
                deathAxis.set(
                  Math.cos(enemy.deathTopple),
                  0,
                  -Math.sin(enemy.deathTopple),
                ),
                1.42 * settle,
              );
              enemy.root.position.y = -0.08 * settle;
            } else {
              // Topples away from the blow, ending flat on the floor.
              deathAxis
                .set(Math.cos(enemy.deathTopple), 0, -Math.sin(enemy.deathTopple))
                .normalize();
              enemy.root.quaternion.setFromAxisAngle(
                deathAxis,
                1.55 * enemy.deathLean * settle,
              );
              enemy.root.position.y = 0;
            }

            if (enemy.character) {
              updateAnimatedCharacter(
                enemy.character,
                delta * enemy.deathRate,
                "death",
              );
            }
            // Once it is down it stays down. Bodies used to vanish, which made
            // a cleared floor look untouched; they now remain where they fell.
            if (enemy.deathTimer <= 0 && !enemy.dead) {
              enemy.dead = true;
              enemy.restedAt = time;
              enemy.healthBar.group.visible = false;
              corpses.push(enemy);
              // Bound the number kept, so a long fight cannot accumulate
              // bodies without limit. The oldest is cleared first.
              while (corpses.length > 12) {
                const oldest = corpses.shift();
                if (oldest) removeEnemy(oldest);
              }
            }
            continue;
          }

          enemy.hitTimer = Math.max(0, enemy.hitTimer - delta);
          enemy.attackAnimation = Math.max(
            0,
            enemy.attackAnimation - delta,
          );
          enemyOffset
            .copy(playerRoot.position)
            .sub(enemy.root.position);
          const distance = enemyOffset.length();
          enemyOffset.y = 0;
          if (enemyOffset.lengthSq() > 0) enemyOffset.normalize();
          const canChase = distance < 28;
          enemy.turnClock -= delta;
          if (enemy.turnClock <= 0) {
            const turnRange =
              enemy.style === "runner"
                ? 0.2
                : enemy.style === "heavy"
                  ? 0.26
                  : 0.4;
            enemy.targetTurnBias = (Math.random() - 0.5) * turnRange;
            enemy.turnClock =
              enemy.style === "runner"
                ? 0.35 + Math.random() * 0.7
                : 0.65 + Math.random() * 1.45;
          }
          enemy.paceClock -= delta;
          if (enemy.paceClock <= 0) {
            enemy.targetPace =
              enemy.style === "runner"
                ? 0.9 + Math.random() * 0.25
                : enemy.style === "heavy"
                  ? 0.68 + Math.random() * 0.24
                  : 0.68 + Math.random() * 0.42;
            enemy.paceClock = 0.55 + Math.random() * 1.6;
          }
          enemy.turnBias = THREE.MathUtils.lerp(
            enemy.turnBias,
            enemy.targetTurnBias,
            1 - Math.exp(-delta * 1.8),
          );
          enemy.pace = THREE.MathUtils.lerp(
            enemy.pace,
            enemy.targetPace,
            1 - Math.exp(-delta * 2.2),
          );
          if (
            canChase &&
            distance > 1.18 &&
            enemy.hitTimer <= 0.08 &&
            enemy.attackAnimation <= 0.08
          ) {
            enemySideways.set(-enemyOffset.z, 0, enemyOffset.x);
            const weaveStrength =
              distance < 3
                ? enemy.turnBias * 0.2
                : enemy.turnBias +
                  Math.sin(time * 0.72 + enemy.gaitPhase) *
                    (enemy.style === "walker" ? 0.1 : 0.045);
            enemyChaseDirection
              .copy(enemyOffset)
              .addScaledVector(enemySideways, weaveStrength)
              .normalize();

            // Prefer the routed direction over the straight line whenever a
            // flow field exists and the enemy is far enough away that going
            // through the doorway matters more than closing the last metre.
            if (world.grid && flowField && distance > 2.4) {
              const routed = flowDirection(
                world.grid,
                flowField,
                enemy.root.position.x,
                enemy.root.position.z,
              );
              if (routed && (routed.x !== 0 || routed.z !== 0)) {
                enemyFlowDirection.set(routed.x, 0, routed.z);
                // Blend so movement still reads as a shambling advance rather
                // than a grid-perfect march.
                enemyChaseDirection
                  .lerp(enemyFlowDirection, 0.78)
                  .normalize();
              }
            }
            const gaitPulse =
              0.82 +
              Math.sin(
                time * (enemy.style === "runner" ? 5.2 : 2.15) +
                  enemy.gaitPhase,
              ) *
                (enemy.style === "walker" ? 0.18 : 0.1);
            const hesitation =
              enemy.style === "walker" &&
              Math.sin(time * 0.66 + enemy.gaitPhase * 1.7) > 0.92
                ? 0.24
                : 1;
            const step =
              enemy.speed *
              enemy.pace *
              Math.max(0.28, gaitPulse) *
              hesitation *
              delta;

            // Enemies used to move with no collision at all, walking through
            // beds, walls and each other. With real rooms that is fatal to the
            // illusion, so the step is tested first and, if blocked, retried at
            // widening angles before giving up for this frame.
            let moved = false;
            for (const sweep of ENEMY_AVOID_ANGLES) {
              const angle = Math.atan2(
                enemyChaseDirection.x,
                enemyChaseDirection.z,
              ) + sweep;
              const tryX = enemy.root.position.x + Math.sin(angle) * step;
              const tryZ = enemy.root.position.z + Math.cos(angle) * step;
              if (!canOccupy(world, tryX, tryZ, 0.44)) continue;
              enemy.root.position.x = tryX;
              enemy.root.position.z = tryZ;
              if (sweep !== 0) {
                enemyChaseDirection.set(Math.sin(angle), 0, Math.cos(angle));
              }
              moved = true;
              break;
            }
            if (!moved) enemy.stuckClock += delta;
            else enemy.stuckClock = 0;
            // Wedged against geometry for long enough: pick a new heading
            // rather than grinding into the wall forever.
            if (enemy.stuckClock > 1.5) {
              enemy.stuckClock = 0;
              enemy.targetTurnBias = (Math.random() - 0.5) * 2.4;
            }

            const targetRotation = Math.atan2(
              -enemyChaseDirection.x,
              -enemyChaseDirection.z,
            );
            enemy.root.rotation.y = dampAngle(
              enemy.root.rotation.y,
              targetRotation,
              Math.min(
                1,
                delta * (enemy.style === "runner" ? 8.5 : 4.8),
              ),
            );
          }

          enemy.attackClock -= delta;

          // Attack telegraph. The blow itself is still resolved on the clock,
          // but a lunge cue fires while the enemy is closing and its cooldown
          // is nearly up, so a hit is something you can hear arriving instead
          // of damage that simply appears.
          if (
            !enemy.telegraphed &&
            distance < 2.5 &&
            enemy.attackClock <= 0.34 &&
            !enemy.dying
          ) {
            enemy.telegraphed = true;
            current.onSound("zombie-lunge", {
              intensity: THREE.MathUtils.clamp(1.2 - distance / 3.4, 0.45, 1.15),
              pan: panFor(enemy.root.position, 0.9),
            });
          }

          // Close-range breathing, staggered per actor so several enemies do
          // not inhale in unison.
          if (distance < 6.5 && !enemy.dying) {
            enemy.breathClock -= delta;
            if (enemy.breathClock <= 0) {
              enemy.breathClock = 1.9 + Math.random() * 2.4;
              current.onSound("zombie-breath", {
                intensity: THREE.MathUtils.clamp(1.1 - distance / 8, 0.22, 0.85),
                pan: panFor(enemy.root.position, 0.85),
              });
            }
          }

          // A runner committing to a charge announces itself once per chase.
          if (
            enemy.style === "runner" &&
            !enemy.screamed &&
            canChase &&
            distance < 18 &&
            !enemy.dying
          ) {
            enemy.screamed = true;
            current.onSound("zombie-scream", {
              intensity: THREE.MathUtils.clamp(1.25 - distance / 26, 0.5, 1.2),
              pan: panFor(enemy.root.position, 0.92),
            });
            horrorPulse = Math.max(horrorPulse, 2.4);
          }

          if (distance < 1.45 && enemy.attackClock <= 0 && dodge <= 0) {
            enemy.attackClock =
              enemy.character?.style === "runner"
                ? 0.82
                : enemy.character?.style === "heavy"
                  ? 1.48
                  : 1.18;
            // Re-arm the telegraph for the next swing.
            enemy.telegraphed = false;
            enemy.attackAnimation = 0.74;
            heroHitTimer = 0.36;
            cameraShake = enemy.character?.style === "heavy" ? 0.58 : 0.34;
            // First person expresses the same impact as a rotational recoil,
            // biased away from whoever hit you, rather than positional jitter.
            kickPitch +=
              enemy.character?.style === "heavy"
                ? 0.11
                : enemy.character?.style === "runner"
                  ? 0.075
                  : 0.055;
            attackDirectionVector
              .copy(playerRoot.position)
              .sub(enemy.root.position)
              .normalize();
            kickYaw += attackDirectionVector.x > 0 ? -0.03 : 0.03;
            const heavyHit = enemy.character?.style === "heavy";
            const runnerHit = enemy.character?.style === "runner";
            // Spawn the world-space spray forward of the eye in first person so
            // it arcs across the view instead of erupting behind the near plane.
            if (current.pov === "first") {
              bloodOrigin
                .copy(playerRoot.position)
                .setY(playerRoot.position.y + 1.42)
                .addScaledVector(forward, 0.55);
            } else {
              bloodOrigin
                .copy(playerRoot.position)
                .setY(playerRoot.position.y + 1.14);
            }
            spawnBlood(
              bloodOrigin,
              attackDirectionVector,
              runnerHit ? 15 : heavyHit ? 20 : 10,
            );
            splashViewBlood(
              heavyHit ? 1 : runnerHit ? 0.72 : 0.5,
              THREE.MathUtils.clamp(
                attackDirectionVector.x * Math.cos(cameraYaw) -
                  attackDirectionVector.z * Math.sin(cameraYaw),
                -1,
                1,
              ),
            );
            current.onSound("zombie-attack", {
              intensity:
                enemy.character?.style === "runner"
                  ? 1.08
                  : enemy.character?.style === "heavy"
                    ? 1.2
                    : 0.86,
              pan: panFor(enemy.root.position, 0.9),
            });
            if (lightFailure > 0) {
              current.onSound("zombie-growl", {
                intensity: enemy.character?.style === "heavy" ? 1.2 : 1.02,
                pan: panFor(enemy.root.position, 0.9),
              });
            }
            current.onSound("player-hit", {
              intensity: enemy.character?.style === "runner" ? 1.08 : 0.88,
            });
            if (combo > 0) {
              combo = 0;
              comboClock = 0;
              current.onCombatProgress(0, combatScore);
            }
            current.onDamage(
              enemy.character?.style === "runner"
                ? 12
                : enemy.character?.style === "heavy"
                  ? 19
                  : 8,
            );
            current.onInfection(
              enemy.character?.style === "runner"
                ? 7
                : enemy.character?.style === "heavy"
                  ? 11
                  : 3.5,
            );
          }

          if (enemy.character) {
            const enemyState: AnimationState =
              enemy.hitTimer > 0.06
                ? "hit"
                : enemy.attackAnimation > 0.05
                  ? "attack"
                  : canChase && distance > 1.18
                    ? enemy.character.style === "runner"
                      ? "run"
                      : "walk"
                    : "idle";
            updateAnimatedCharacter(enemy.character, delta, enemyState);
            setCharacterDetail(enemy.character, distance < 13);
            setCharacterHitFlash(
              enemy.character,
              enemy.hitTimer > 0 ? enemy.hitTimer : 0,
            );
          }

          enemy.healthBar.group.position
            .copy(enemy.root.position)
            .add(
              healthBarOffset.set(
                0,
                (enemy.character?.height ?? 1.9) + 0.24,
                0,
              ),
            );
          enemy.healthBar.group.quaternion.copy(camera.quaternion);
          // A body on the floor carries no bar. Leaving one floating over a
          // corpse would also give away which ones are still a threat.
          enemy.healthBar.group.visible =
            !enemy.dying && (distance < 25 || enemy.hp < enemy.maxHp);
        }

        livingEnemies.length = 0;
        for (const enemy of enemies) {
          if (!enemy.dying) livingEnemies.push(enemy);
        }
        // Ground Emergency is a room graph now, so its two thresholds are tied
        // to the new footprint: the blackout fires on entering the triage hall
        // and the curtain scare on committing to the south link.
        const scareKey =
          current.chapter === "hospital" &&
          current.inventory.axe &&
          current.step >= 3 &&
          playerRoot.position.z < -10
            ? "hospital-curtain"
            : current.chapter === "hospital" &&
                current.step >= 1 &&
                playerRoot.position.z < 2
              ? "hospital-blackout"
              : current.chapter === "street" &&
                  current.step >= 1 &&
                  playerRoot.position.x < -12
                ? "street-radio"
                : current.chapter === "station" &&
                    current.step >= 3 &&
                    playerRoot.position.z < -46
                  ? "basement-freezers"
                  : current.chapter === "checkpoint" &&
                      current.step >= 2 &&
                      playerRoot.position.z < -52
                    ? "isolation-breach"
                  : current.chapter === "depot" &&
                      current.step >= 3 &&
                      playerRoot.position.z < -42
                    ? "research-pod"
                    : "";
        if (scareKey && !scareFlags.has(scareKey)) {
          scareFlags.add(scareKey);
          horrorPulse = scareKey === "hospital-curtain" ? 5.2 : 3.8;
          cameraShake = scareKey === "hospital-curtain" ? 0.3 : 0.14;
          current.onSound(
            scareKey === "street-radio"
              ? "radio-static"
              : scareKey === "research-pod"
                ? "metal-slam"
                : "horror-sting",
            { intensity: scareKey === "hospital-curtain" ? 1.15 : 0.88 },
          );
          if (scareKey === "hospital-curtain") {
            // Behind the player, and only somewhere they could actually stand.
            const behindZ = playerRoot.position.z + 7;
            const candidates: Array<[number, number]> = [
              [playerRoot.position.x, behindZ],
              [playerRoot.position.x - 3.2, behindZ],
              [playerRoot.position.x + 3.2, behindZ],
              [playerRoot.position.x, playerRoot.position.z + 4],
            ];
            for (const [x, z] of candidates) {
              if (!canOccupy(world, x, z, 0.44)) continue;
              spawnEnemy("runner", x, z);
              encounterWasActive = true;
              break;
            }
          }
        }

        horrorPulse = Math.max(0, horrorPulse - delta);
        cameraShake = Math.max(0, cameraShake - delta * 1.8);
        let nearestThreat = 80;
        for (const enemy of livingEnemies) {
          nearestThreat = Math.min(
            nearestThreat,
            enemy.root.position.distanceTo(playerRoot.position),
          );
        }
        lightFailure = Math.max(0, lightFailure - delta);
        lightFailureCooldown = Math.max(0, lightFailureCooldown - delta);
        const flashlightEquipped = Boolean(current.inventory.torch);
        const hospitalPowerUnstable =
          current.chapter === "hospital" && flashlightEquipped;
        if (
          current.chapter === "hospital" &&
          flashlightEquipped &&
          !flashlightWasEquipped
        ) {
          hospitalBlackoutClock = 0.55;
          lightFailureCooldown = Math.min(lightFailureCooldown, 0.55);
        }
        flashlightWasEquipped = flashlightEquipped;

        if (hospitalPowerUnstable) {
          hospitalBlackoutClock -= delta;
          if (hospitalBlackoutClock <= 0 && lightFailureCooldown <= 0) {
            const threatClose = nearestThreat < 18;
            lightFailure = 2.55 + Math.random() * 0.75;
            lightFailureCooldown = 2.35;
            hospitalBlackoutClock = threatClose
              ? 3.8 + Math.random() * 2.5
              : 5.4 + Math.random() * 3.8;
            if (threatClose) {
              threatBlackoutClock = Math.max(
                threatBlackoutClock,
                3.4 + Math.random() * 2.1,
              );
            }
            horrorPulse = Math.max(horrorPulse, threatClose ? 2.35 : 1.2);
            current.onSound(
              threatClose ? "horror-sting" : "metal-slam",
              { intensity: threatClose ? 0.86 : 0.48 },
            );
            if (threatClose) {
              current.onSound("zombie-growl", { intensity: 0.92 });
            }
          }
        }

        if (nearestThreat < 16) {
          threatBlackoutClock -= delta;
          if (threatBlackoutClock <= 0 && lightFailureCooldown <= 0) {
            lightFailure = 2.7 + Math.random() * 0.65;
            lightFailureCooldown = 2.5;
            threatBlackoutClock =
              current.chapter === "hospital"
                ? 3.6 + Math.random() * 2.6
                : 6.5 + Math.random() * 3.8;
            if (current.chapter === "hospital") {
              hospitalBlackoutClock = Math.max(
                hospitalBlackoutClock,
                4.2 + Math.random() * 2.6,
              );
            }
            horrorPulse = Math.max(horrorPulse, 2.25);
            cameraShake = Math.max(cameraShake, 0.105);
            current.onSound("horror-sting", { intensity: 0.76 });
            current.onSound("zombie-growl", {
              intensity: nearestThreat < 8 ? 1.08 : 0.88,
            });
          }
        } else {
          threatBlackoutClock = 0;
        }
        if (
          nearestThreat < 14 &&
          previousNearestThreat >= 14 &&
          lightFailureCooldown <= 0
        ) {
          lightFailure = 2.65;
          lightFailureCooldown = 5.4;
          horrorPulse = Math.max(horrorPulse, 2.15);
          cameraShake = Math.max(cameraShake, 0.11);
          current.onSound("horror-sting", { intensity: 0.72 });
          current.onSound("zombie-growl", { intensity: 0.9 });
        }
        previousNearestThreat = nearestThreat;
        const chapterDread =
          current.chapter === "hospital"
            ? 16
            : current.chapter === "depot"
              ? 23
              : current.chapter === "checkpoint"
                ? 18
                : current.chapter === "survival"
                  ? 24
                  : current.chapter === "station"
                    ? 17
                    : 12;
        const proximityDread =
          livingEnemies.length === 0
            ? 0
            : THREE.MathUtils.clamp((26 - nearestThreat) * 2.9, 0, 64);
        const injuryDread = THREE.MathUtils.clamp((55 - current.health) * 0.48, 0, 25);
        const fearTarget = THREE.MathUtils.clamp(
          chapterDread +
            proximityDread +
            injuryDread +
            Math.min(26, livingEnemies.length * 2.2) +
            (horrorPulse > 0 ? 34 : 0),
          4,
          100,
        );
        fear = THREE.MathUtils.lerp(
          fear,
          fearTarget,
          1 - Math.exp(-delta * (fearTarget > fear ? 3.1 : 0.62)),
        );
        fearReportClock += delta;
        if (fearReportClock >= 0.12) {
          fearReportClock = 0;
          current.onFearChange(Math.round(fear));
        }
        heartbeatClock -= delta;
        if (fear > 72 && heartbeatClock <= 0) {
          current.onSound("heartbeat", {
            intensity: THREE.MathUtils.clamp((fear - 58) / 34, 0.45, 1.2),
          });
          heartbeatClock = THREE.MathUtils.lerp(1.05, 0.48, fear / 100);
        }
        const hardBlackout =
          lightFailure > 0.48 && lightFailure < 1.88;
        const globalPowerFactor =
          lightFailure <= 0
            ? 1
            : hardBlackout
              ? 0
              : Math.sin(time * 34) + Math.sin(time * 11.3) > 0.1
                ? 0.02
                : 0.62;
        for (let index = 0; index < localLights.length; index += 1) {
          const light = localLights[index];
          const baseIntensity = Number(light.userData.baseIntensity ?? 1);
          const failure =
            horrorPulse > 0 &&
            Math.sin(time * 28 + index * 2.17) + Math.sin(time * 9.2) > 0.48;
          const unstable =
            Math.sin(time * 1.7 + index * 4.9) > 0.988;
          const threatFailure =
            lightFailure > 0 &&
            (hardBlackout ||
              Math.sin(time * 31 + index * 1.73) > -0.08);
          const fixtureFactor = threatFailure
            ? hardBlackout
              ? 0
              : 0.025
            : globalPowerFactor;
          const normalFactor = flickerLightSet.has(light)
            ? failure
              ? 0.04
              : unstable
                ? 0.38
                : 1
            : 1;
          light.intensity =
            baseIntensity * Math.min(fixtureFactor, normalFactor);
        }
        for (const material of fixtureMaterials) {
          const baseIntensity = Number(
            material.userData.baseEmissiveIntensity ?? 1,
          );
          material.emissiveIntensity = baseIntensity * globalPowerFactor;
        }
        const indoorPowerFailure =
          current.chapter === "hospital" ||
          current.chapter === "street" ||
          current.chapter === "station" ||
          current.chapter === "checkpoint" ||
          current.chapter === "depot" ||
          current.chapter === "escape" ||
          current.chapter === "survival";
        for (const light of environmentLights) {
          const baseIntensity = Number(light.userData.baseIntensity ?? 1);
          light.intensity =
            baseIntensity *
            (indoorPowerFailure
              ? THREE.MathUtils.lerp(
                  hardBlackout ? 0 : 0.035,
                  1,
                  globalPowerFactor,
                )
              : 1);
        }
        const worldPowerFactor =
          indoorPowerFailure && lightFailure > 0
            ? hardBlackout
              ? 0
              : globalPowerFactor
            : 1;
        (scene.background as THREE.Color)
          .copy(baseBackgroundColor)
          .lerp(blackoutBackgroundColor, 1 - worldPowerFactor);
        sceneFog.color
          .copy(baseFogColor)
          .lerp(blackoutFogColor, 1 - worldPowerFactor);
        renderer.toneMappingExposure =
          baseToneMappingExposure *
          THREE.MathUtils.lerp(0.34, 1, worldPowerFactor);

        zombieVoiceClock -= delta;
        if (livingEnemies.length > 0 && zombieVoiceClock <= 0) {
          let nearest = livingEnemies[0];
          let nearestDistance = nearest.root.position.distanceTo(
            playerRoot.position,
          );
          for (let index = 1; index < livingEnemies.length; index += 1) {
            const enemy = livingEnemies[index];
            const distance = enemy.root.position.distanceTo(
              playerRoot.position,
            );
            if (distance < nearestDistance) {
              nearest = enemy;
              nearestDistance = distance;
            }
          }
          current.onSound(
            lightFailure > 0 || nearestDistance < 11
              ? "zombie-growl"
              : "zombie-alert",
            {
              intensity: THREE.MathUtils.clamp(
                1.05 - nearestDistance / 30,
                0.38,
                1,
              ),
              pan: panFor(nearest.root.position, 0.9),
            },
          );
          zombieVoiceClock =
            lightFailure > 0 || nearestDistance < 11
              ? 1.35 + Math.random() * 1.9
              : 3.2 + Math.random() * 4.4;
        }
        if (encounterWasActive && livingEnemies.length === 0) {
          encounterWasActive = false;
          current.onEncounterCleared();
        }

        // Safety net. Progress on several steps is gated on clearing an
        // encounter, so an enemy that can never be reached — wedged in
        // geometry, or spawned in a pocket the player has no route to — used to
        // strand the campaign with no way forward. If every survivor of an
        // encounter has been unroutable and far away for a sustained period,
        // treat the encounter as cleared rather than let it dead-end the run.
        if (encounterWasActive && livingEnemies.length > 0) {
          let anyReachable = false;
          for (const enemy of livingEnemies) {
            const range = enemy.root.position.distanceTo(playerRoot.position);
            if (range < 24) {
              anyReachable = true;
              break;
            }
            if (!world.grid || !flowField) {
              anyReachable = true;
              break;
            }
            if (
              flowDirection(
                world.grid,
                flowField,
                enemy.root.position.x,
                enemy.root.position.z,
              )
            ) {
              anyReachable = true;
              break;
            }
          }
          if (anyReachable) encounterStallClock = 0;
          else encounterStallClock += delta;
          if (encounterStallClock > 12) {
            encounterStallClock = 0;
            for (const enemy of [...livingEnemies]) removeEnemy(enemy);
            encounterWasActive = false;
            current.onEncounterCleared();
          }
        } else {
          encounterStallClock = 0;
        }

            // The ones that were not finished.
        //
        // Bodies stay where they fall, and some of them get back up. Which ones
        // is decided when they land and never shown, so no corpse can be walked
        // past safely — the floor behind you stops being cleared ground.
        for (let index = corpses.length - 1; index >= 0; index -= 1) {
          const corpse = corpses[index];
          if (corpse.rising > 0) {
            // Getting up: unwind the fall, then hand it back to the AI.
            // Fast enough to be a shock rather than a transformation.
            corpse.rising = Math.min(1, corpse.rising + delta * 4.6);
            // Most of the movement lands in the first 100 ms and the rest
            // settles: 56 per cent upright at 50 ms, 79 at 100, done by 230.
            // An evenly paced rise reads as a transformation; this reads as a
            // body snapping up off the floor.
            const eased = (1 - corpse.rising) ** 2.4;
            deathAxis
              .set(Math.cos(corpse.deathTopple), 0, -Math.sin(corpse.deathTopple))
              .normalize();
            corpse.root.quaternion.setFromAxisAngle(
              deathAxis,
              1.55 * corpse.deathLean * eased,
            );
            corpse.root.position.y = 0;
            if (corpse.character) {
              updateAnimatedCharacter(corpse.character, delta, "hit");
            }
            if (corpse.rising >= 1) {
              // Back on its feet and hunting.
              corpse.rising = 0;
              corpse.dead = false;
              corpse.dying = false;
              corpse.deathTimer = 0;
              corpse.hp = Math.max(24, Math.round(corpse.maxHp * 0.45));
              corpse.root.quaternion.identity();
              corpse.root.rotation.set(0, corpse.root.rotation.y, 0);
              corpse.root.position.y = 0;
              corpse.healthBar.group.visible = true;
              corpse.attackClock = 0.35;
              corpses.splice(index, 1);
              encounterWasActive = true;
            }
            continue;
          }

          // It goes when the player walks over it, not from across the room.
          // Standing on a body is the moment the player has decided it is
          // just scenery, which is the moment worth taking from them.
          if (time - corpse.restedAt < 4) continue;
          const range = corpse.root.position.distanceTo(playerRoot.position);
          if (range > 1.15) continue;
          // Rolled on contact rather than decided when it fell, so the same
          // body stepped over twice does not give the same answer, and no
          // corpse is ever known to be safe.
          corpseCheckClock -= delta;
          if (corpseCheckClock > 0) continue;
          corpseCheckClock = 0.45;
          if (Math.random() > 0.38) continue;

          corpse.rising = 0.001;
          // Right on top of the player, so it is centred rather than panned
          // off to one side — it is not somewhere over there, it is here.
          current.onSound("zombie-scream", { intensity: 1.25, pan: 0 });
          current.onSound("zombie-lunge", { intensity: 1.1, pan: 0 });
          horrorPulse = Math.max(horrorPulse, 5.5);
          cameraShake = Math.max(cameraShake, 0.58);
          kickPitch += 0.14;
          // Already swinging as it comes up.
          corpse.attackClock = 0.28;
        }

        // Doors.
        //
        // A shut door now blocks, so it has to be opened rather than walked
        // through. The player pushes one open by walking into it, and the
        // infected shove through on contact — a door swinging open on its own
        // is a better warning than any sound, because it means something is
        // already on the other side.
        if (world.doors) {
          for (const door of world.doors) {
            if (!door.open) {
              let pushed =
                door.position.distanceTo(playerRoot.position) < 1.35;
              if (!pushed) {
                for (const enemy of livingEnemies) {
                  if (door.position.distanceTo(enemy.root.position) < 1.3) {
                    pushed = true;
                    break;
                  }
                }
              }
              if (pushed) {
                door.open = true;
                if (world.grid) openDoorCells(world.grid, door);
                // Force the routing field to be rebuilt: a new opening changes
                // every route through this part of the floor.
                flowField = null;
                current.onSound("door-open", {
                  intensity: 0.9,
                  pan: panFor(door.position, 0.8),
                });
              }
            }
            // Swing over about half a second, easing out so it settles rather
            // than snapping to the stop.
            const target = door.open ? 1 : 0;
            if (door.progress !== target) {
              door.progress = THREE.MathUtils.clamp(
                door.progress + delta * 1.9 * (target ? 1 : -1),
                0,
                1,
              );
              const eased = 1 - (1 - door.progress) ** 2.2;
              for (let leaf = 0; leaf < door.pivots.length; leaf += 1) {
                door.pivots[leaf].rotation.y = door.swings[leaf] * eased;
              }
            }
          }
        }

        // Wandering infected, independent of the scripted encounters.
        //
        // Every threat used to arrive on a step change, so once a floor's
        // encounter was cleared it was empty and safe. A slow trickle from
        // random rooms the player cannot currently see means no corridor is
        // ever reliably clear, and it is the cheapest way to make a floor stop
        // feeling like a checklist.
        const infectedAllowed =
          current.chapter !== "hospital" || Boolean(current.inventory.axe);
        if (
          current.mode === "playing" &&
          infectedAllowed &&
          world.spawnPoints &&
          world.spawnPoints.length > 0
        ) {
          roamClock -= delta;
          if (roamClock <= 0) {
            roamClock = 26 + Math.random() * 34;
            if (livingEnemies.length < 4 && current.chapter !== "survival") {
              // Only rooms that are out of sight and not on top of the player.
              const options = world.spawnPoints.filter((entry) => {
                const range = entry.position.distanceTo(playerRoot.position);
                if (range < 14 || range > 52) return false;
                return !isVisibleToPlayer(entry.position.x, entry.position.z);
              });
              if (options.length > 0) {
                const pick =
                  options[Math.floor(Math.random() * options.length)];
                const style = Math.random() < 0.22 ? "runner" : "walker";
                if (canOccupy(world, pick.position.x, pick.position.z, 0.44)) {
                  spawnEnemy(style, pick.position.x, pick.position.z);
                  // Heard, never seen arriving: a distant call from the room it
                  // came from, so the player knows something changed.
                  current.onSound("zombie-alert", {
                    intensity: 0.55,
                    pan: panFor(pick.position, 0.85),
                  });
                }
              }
            }
          }
        }

        // Rebuild the routing field when the player has moved far enough that
        // the old one would send enemies to where they used to be.
        if (world.grid) {
          flowClock -= delta;
          if (
            !flowField ||
            flowClock <= 0 ||
            flowOrigin.distanceToSquared(playerRoot.position) > 1.44
          ) {
            flowClock = 0.45;
            flowOrigin.copy(playerRoot.position);
            flowField = computeFlowField(
              world.grid,
              playerRoot.position.x,
              playerRoot.position.z,
              flowField ?? undefined,
            );
          }
        }

        // Release a warned encounter once its telegraph has played out.
        if (pendingEncounter) {
          pendingEncounterClock -= delta;
          if (pendingEncounterClock <= 0) {
            const release = pendingEncounter;
            pendingEncounter = null;
            release();
          }
        }

        // Blood on the view dries off rather than snapping away. Opacity is
        // driven on the element so the canvas itself is only redrawn on a hit.
        if (bloodOverlayAlpha > 0) {
          bloodOverlayAlpha = Math.max(0, bloodOverlayAlpha - delta * 0.2);
          const canvas = current.bloodCanvas;
          if (canvas) canvas.style.opacity = `${bloodOverlayAlpha.toFixed(3)}`;
        }

        // 10 Hz is plenty for a 132 px map and keeps it off the render budget.
        minimapClock += delta;
        if (minimapClock >= 0.1) {
          minimapClock = 0;
          drawMinimap();
        }

        progressReportClock += delta;
        const reportProgress = progressReportClock >= 0.12;
        if (reportProgress) progressReportClock = 0;

        if (reportProgress) {
          let nearestThreat = Infinity;
          for (const enemy of livingEnemies) {
            nearestThreat = Math.min(
              nearestThreat,
              enemy.root.position.distanceTo(playerRoot.position),
            );
          }
          current.onThreatProximity(nearestThreat);
        }

        if (current.chapter === "survival") {
          survivalTime += delta;
          survivalReportClock += delta;
          if (livingEnemies.length === 0) {
            const previousClock = survivalWaveClock;
            survivalWaveClock -= delta;
            // Two-stage telegraph across the lull between waves: a distant
            // structural groan as the countdown opens, then an alarm doublet
            // with about a second left. The player gets time to reposition and
            // to hear which way the pressure is coming from.
            if (previousClock > 3.2 && survivalWaveClock <= 3.2) {
              current.onSound("wave-warning", {
                intensity: Math.min(1.2, 0.7 + survivalWave * 0.03),
              });
              current.onWaveWarning(survivalWave + 1, 3.2);
            }
            if (previousClock > 1.05 && survivalWaveClock <= 1.05) {
              current.onSound("wave-imminent", {
                intensity: Math.min(1.2, 0.8 + survivalWave * 0.03),
              });
              // Something screams just before the shutters give.
              current.onSound("zombie-scream", {
                intensity: 1.1,
                pan: (Math.random() - 0.5) * 1.5,
              });
              horrorPulse = Math.max(horrorPulse, 2.6);
            }
            if (survivalWaveClock <= 0) {
              survivalWave += 1;
              survivalWaveClock = 3.6;
              const enemyCount = Math.min(
                14,
                3 + survivalWave + Math.floor(survivalWave / 3),
              );
              current.onSound("wave", {
                intensity: Math.min(1.2, 0.75 + survivalWave * 0.035),
              });
              for (let index = 0; index < enemyCount; index += 1) {
                const edge = index % 4;
                const along =
                  world.bounds.minZ + 6 +
                  Math.random() *
                    Math.max(1, world.bounds.maxZ - world.bounds.minZ - 12);
                const x =
                  edge === 0
                    ? world.bounds.minX + 0.9
                    : edge === 1
                      ? world.bounds.maxX - 0.9
                      : world.bounds.minX +
                        1.2 +
                        Math.random() *
                          Math.max(1, world.bounds.maxX - world.bounds.minX - 2.4);
                const z =
                  edge === 2
                    ? world.bounds.minZ + 2.4
                    : edge === 3
                      ? world.bounds.maxZ - 2.4
                      : along;
                const runnerChance = Math.min(
                  0.62,
                  0.16 + survivalWave * 0.035,
                );
                const style =
                  survivalWave >= 4 &&
                  index === 0 &&
                  survivalWave % 3 === 1
                    ? "heavy"
                    : Math.random() < runnerChance
                      ? "runner"
                      : "walker";
                spawnEnemy(style, x, z);
              }
            }
          } else {
            survivalWaveClock = 3.6;
          }
          if (survivalReportClock >= 0.2) {
            survivalReportClock = 0;
            current.onSurvivalProgress(
              Math.max(1, survivalWave),
              survivalTime,
              livingEnemies.length,
            );
          }
        }

        if (current.chapter === "station" && current.step === 3) {
          fuelProgress = Math.min(1, fuelProgress + delta / 24);
          stationWaveClock += delta;
          if (stationWaveClock > 7 && fuelProgress < 0.86) {
            stationWaveClock = 0;
            const side = Math.random() > 0.5 ? 1 : -1;
            spawnEnemy(
              Math.random() > 0.68 ? "runner" : "walker",
              side * (4.8 + Math.random() * 1.4),
              -45 - Math.random() * 20,
            );
            encounterWasActive = true;
          }
          // Throttled like every other reported value. The terminal value is
          // always sent regardless of the clock, so the completion latch on the
          // React side can never be skipped by a dropped report.
          if (reportProgress || fuelProgress >= 0.999) {
            current.onFuelProgress(fuelProgress);
          }
        }

        if (current.chapter === "escape") {
          const progress = THREE.MathUtils.clamp(
            (world.start.z - playerRoot.position.z) /
              (world.start.z - world.bounds.minZ),
            0,
            1,
          );
          if (reportProgress || progress >= 0.985) {
            current.onEscapeProgress(progress);
          }
          escapeDirectorClock -= delta;
          if (
            progress < 0.93 &&
            escapeDirectorClock <= 0 &&
            livingEnemies.length < 5
          ) {
            const spawnZ = THREE.MathUtils.clamp(
              playerRoot.position.z - 18 - Math.random() * 9,
              world.bounds.minZ + 4,
              world.bounds.maxZ - 8,
            );
            const side = Math.random() > 0.5 ? 1 : -1;
            spawnEnemy(
              Math.random() > 0.62 ? "runner" : "walker",
              side * (3.5 + Math.random() * 3.2),
              spawnZ,
            );
            if (current.health > 58 && Math.random() > 0.46) {
              spawnEnemy(
                "walker",
                -side * (2.5 + Math.random() * 3.4),
                Math.min(world.bounds.maxZ - 8, spawnZ + 5),
              );
            }
            escapeDirectorClock =
              current.health < 35
                ? 17 + Math.random() * 5
                : 10 + Math.random() * 4;
          }
        }

        if (maya) {
          companionFollowOffset
            .set(1.05, 0, 1.55)
            .applyAxisAngle(UP, playerRoot.rotation.y);
          companionTarget
            .copy(playerRoot.position)
            .add(companionFollowOffset);
          companionOffset
            .copy(companionTarget)
            .sub(maya.root.position);
          const distance = companionOffset.length();
          let companionSpeed = 0;
          if (distance > 0.42) {
            companionOffset.normalize();
            companionSpeed = Math.min(
              running ? 4.2 : 2.2,
              distance * 3.2,
            );
            maya.root.position.addScaledVector(
              companionOffset,
              companionSpeed * delta,
            );
            const targetRotation = Math.atan2(
              -companionOffset.x,
              -companionOffset.z,
            );
            maya.root.rotation.y = dampAngle(
              maya.root.rotation.y,
              targetRotation,
              Math.min(1, delta * 10),
            );
          }
          if (maya.character) {
            setCharacterDetail(maya.character, distance < 10);
            updateAnimatedCharacter(
              maya.character,
              delta,
              companionSpeed > 1.45
                ? "run"
                : companionSpeed > 0.1
                  ? "walk"
                  : "idle",
              companionSpeed,
            );
          }
        }

        updateInteractions();
        statsClock += delta;
        if (statsClock > 0.12) {
          statsClock = 0;
          current.onStaminaChange(stamina);
        }
      } else {
        if (hero) updateAnimatedCharacter(hero, delta, "idle");
        if (maya?.character) {
          updateAnimatedCharacter(maya.character, delta, "idle");
        }
        for (const enemy of enemies) {
          if (enemy.character) {
            updateAnimatedCharacter(
              enemy.character,
              delta,
              enemy.dying ? "death" : "idle",
            );
          }
        }
      }

      updateBlood(delta);
      updateShots(delta);

      const firstPerson = current.pov === "first";
      if (hero) {
        // Hide the body rather than tear it down, so toggling is instant. The
        // detail flag also drops the mixer to 20 Hz while it cannot be seen.
        if (hero.root.visible === firstPerson) {
          hero.root.visible = !firstPerson;
          setCharacterDetail(hero, !firstPerson);
        }
      }

      if (firstPerson) {
        eyeHeight = THREE.MathUtils.lerp(
          eyeHeight,
          1.62,
          1 - Math.exp(-delta * 9),
        );
        // Snap, never lerp, the first-person eye. Smoothing the head position
        // against the body it is attached to reads as swimming.
        camera.position.set(
          playerRoot.position.x,
          playerRoot.position.y + eyeHeight + Math.sin(bobPhase * 2) * bobAmplitude,
          playerRoot.position.z,
        );
        // Lateral sway is applied along the camera's own right vector.
        const swayAmount = Math.sin(bobPhase) * bobAmplitude * 0.55;
        camera.position.x += Math.cos(cameraYaw) * swayAmount;
        camera.position.z += -Math.sin(cameraYaw) * swayAmount;
        camera.rotation.order = "YXZ";
        camera.rotation.set(
          lookPitch + kickPitch,
          cameraYaw + kickYaw,
          Math.sin(bobPhase) * (sprintBlend > 0.5 ? 0.0085 : 0.004),
        );
        // The torch target is a child of playerRoot, which already carries yaw,
        // so only pitch has to be reapplied here. Without this the beam points
        // at the floor ahead no matter where the player is looking.
        flashlightTarget.position.set(
          0.1,
          1.52 + 10 * Math.sin(lookPitch),
          -10 * Math.cos(lookPitch),
        );
        flashlight.position.set(0.14, 1.52, -0.06);
      } else {
        cameraTarget
          .copy(playerRoot.position)
          .add(cameraTargetOffset);

        // Pull the boom in until it is inside the room. Without this the camera
        // sat a metre outside the wall of any small room, and at its old height
        // of 2.86 m it was above the 2.7 m ceilings entirely — which is why
        // switching to third person looked down on the building from outside.
        let boom = cameraDistance;
        if (world.grid) {
          for (let step = 0; step < 8; step += 1) {
            const test = boom * (1 - step / 8);
            const horizontal = test * Math.cos(cameraPitch);
            const testX = playerRoot.position.x + Math.sin(cameraYaw) * horizontal;
            const testZ = playerRoot.position.z + Math.cos(cameraYaw) * horizontal;
            if (canOccupy(world, testX, testZ, 0.3)) {
              boom = test;
              break;
            }
          }
        }
        const horizontalDistance = boom * Math.cos(cameraPitch);
        const eyeX =
          playerRoot.position.x + Math.sin(cameraYaw) * horizontalDistance;
        const eyeZ =
          playerRoot.position.z + Math.cos(cameraYaw) * horizontalDistance;

        // Stay under whatever ceiling is actually overhead.
        let headroom = 2.55;
        if (world.ceilings) {
          for (const room of world.ceilings) {
            if (eyeX < room.minX || eyeX > room.maxX) continue;
            if (eyeZ < room.minZ || eyeZ > room.maxZ) continue;
            headroom = Math.min(headroom, room.ceiling - 0.22);
            break;
          }
        }
        desiredCamera.set(
          eyeX,
          Math.min(
            playerRoot.position.y + headroom,
            playerRoot.position.y + 1.62 + Math.sin(cameraPitch) * boom,
          ),
          eyeZ,
        );
        if (cameraShake > 0) {
          desiredCamera.add(
            cameraShakeOffset.set(
              (Math.random() - 0.5) * cameraShake,
              (Math.random() - 0.5) * cameraShake * 0.62,
              (Math.random() - 0.5) * cameraShake,
            ),
          );
        }
        camera.rotation.order = "XYZ";
        camera.position.lerp(
          desiredCamera,
          1 - Math.exp(-delta * 9),
        );
        cameraLookAhead.copy(forward).multiplyScalar(2.5);
        camera.lookAt(cameraTarget.add(cameraLookAhead));
        flashlightTarget.position.set(0.1, 1.02, -10);
        flashlight.position.set(0.28, 1.46, -0.34);
      }

      // Dread widens the view slightly; first person amplifies any FOV change,
      // so it gets a gentler coefficient plus a sprint push, which is the
      // strongest "running for your life" cue available for one matrix update.
      const targetFov = firstPerson
        ? 68 + fear * 0.01 + sprintBlend * 4.5
        : 58 + fear * 0.018;
      if (Math.abs(camera.fov - targetFov) > 0.02) {
        camera.fov = THREE.MathUtils.lerp(
          camera.fov,
          targetFov,
          1 - Math.exp(-delta * 3.2),
        );
        camera.updateProjectionMatrix();
      }
      shadowUpdateClock += delta;
      if (
        renderer.shadowMap.enabled &&
        (shadowUpdateClock >= (current.mode === "playing" ? 0.14 : 0.8) ||
          renderer.shadowMap.needsUpdate)
      ) {
        renderer.shadowMap.needsUpdate = true;
        shadowUpdateClock = 0;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.domElement.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("pointerlockchange", pointerLockChange);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      propsRef.current.onPromptChange(null);
      if (hero) disposeAnimatedCharacter(hero);
      if (maya?.character) disposeAnimatedCharacter(maya.character);
      for (const enemy of enemies) {
        if (enemy.character) disposeAnimatedCharacter(enemy.character);
      }
      for (const decal of bloodDecals) {
        decal.geometry.dispose();
        (decal.material as THREE.Material).dispose();
      }
      for (const shot of shotEffects) {
        shot.line.geometry.dispose();
        (shot.line.material as THREE.Material).dispose();
      }
      bloodGeometry.dispose();
      bloodMaterial.dispose();
      bloodDecalMaterial.dispose();
      gashGeometry.dispose();
      gashMaterial.dispose();
      disposeWorld(world);
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [props.chapter, props.resetToken]);

  return <div ref={mountRef} className="game-canvas game-viewport-3d" />;
});
