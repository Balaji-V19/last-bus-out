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
  disposeWorld,
  gridAllows,
  type BuiltWorld,
  type EquipmentKind,
  type GameChapter,
} from "./game3d/scene";

type Inventory = Partial<Record<EquipmentKind, boolean>>;

export type PointOfView = "first" | "third";

type GameViewportProps = {
  chapter: GameChapter;
  mode: "menu" | "playing" | "paused" | "ending";
  step: number;
  rescued: boolean;
  health: number;
  ammo: number;
  inventory: Inventory;
  pov: PointOfView;
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
  onSound: (event: GameSoundEvent, options?: GameSoundOptions) => void;
};

export type GameViewportHandle = {
  attack: () => void;
  shoot: () => void;
  dodge: () => void;
  interact: () => void;
  captureLook: () => void;
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
    captureLook: () => undefined,
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
      captureLook: () => actionsRef.current.captureLook(),
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
    void createAnimatedCharacter("hero").then((character) => {
      if (disposed) {
        disposeAnimatedCharacter(character);
        return;
      }
      hero = character;
      setAnimatedEquipment(character, propsRef.current.inventory);
      playerRoot.add(character.root);
      requestAnimationFrame(() => {
        if (!disposed) propsRef.current.onReady();
      });
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
    const beamToObject = new THREE.Vector3();
    const beamForward = new THREE.Vector3();
    const lastPlayerPosition = playerRoot.position.clone();
    const livingEnemies: EnemyActor[] = [];
    let animationFrame = 0;
    let cameraYaw = 0;
    // Third-person pitch raises the camera on its boom, so positive looks DOWN.
    // First-person pitch is the eye's own rotation.x, where positive looks UP.
    // They are kept separate deliberately: folding them into one value inverts
    // the look direction the moment the player toggles.
    let cameraPitch = 0.2;
    let lookPitch = 0;
    let cameraDistance = props.chapter === "survival" ? 4.7 : 4.35;
    let bobPhase = 0;
    let bobAmplitude = 0;
    let sprintBlend = 0;
    let eyeHeight = 1.62;
    let kickPitch = 0;
    let kickPitchVelocity = 0;
    let kickYaw = 0;
    let lastStrideSign = 1;
    let dragPointer: { id: number; x: number; y: number } | null = null;

    // Stereo placement for a world position, relative to where the player is
    // facing. Every sound cue used to pan on raw world X, which meant the
    // stereo image did not rotate with the camera: turning 180 degrees left a
    // growl on the same ear, and anything directly ahead or behind collapsed to
    // centre. Projecting onto the camera's right vector and normalising by
    // distance gives the sine of the bearing, which is what the ear expects.
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
    const updateLocalLightBudget = (delta: number) => {
      localLightClock -= delta;
      if (localLightClock > 0) return;
      localLightClock = 0.45;
      const lightBudget = 5;
      const nearestLights = localLights
        .map((light) => {
          light.getWorldPosition(localLightPosition);
          return {
            light,
            distance: localLightPosition.distanceToSquared(playerRoot.position),
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
    const spawnEnemyInRoom = (
      style: "walker" | "runner" | "heavy",
      room: string,
      offsetX = 0,
      offsetZ = 0,
    ) => {
      const anchor = world.spawnPoints?.find((entry) => entry.room === room);
      if (!anchor) return;
      for (let attempt = 0; attempt <= 4; attempt += 1) {
        const scale = 1 - attempt * 0.25;
        const x = anchor.position.x + offsetX * scale;
        const z = anchor.position.z + offsetZ * scale;
        if (canOccupy(world, x, z, 0.44)) {
          spawnEnemy(style, x, z);
          return;
        }
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
      current.onSound("zombie-hit", {
        intensity: baseDamage >= 50 ? 1.05 : 0.78,
        pan: panFor(enemy.root.position, 0.85),
      });
      if (enemy.hp <= 0) {
        enemy.dying = true;
        enemy.deathTimer = 1.65;
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
      propsRef.current.onSound("attack-swing", {
        weapon: propsRef.current.inventory.axe ? "axe" : "unarmed",
      });
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
      const heroForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        playerRoot.quaternion,
      );
      let target: EnemyActor | null = null;
      let bestTargetScore = -Infinity;
      for (const enemy of enemies) {
        if (enemy.dying) continue;
        const offset = enemy.root.position.clone().sub(playerRoot.position);
        const distance = offset.length();
        if (distance > 28 || distance < 1.2) continue;
        const aim = heroForward.dot(offset.normalize());
        if (aim < 0.72) continue;
        const targetScore = aim * 2.2 - distance / 38;
        if (targetScore > bestTargetScore) {
          bestTargetScore = targetScore;
          target = enemy;
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
        const critical = bestTargetScore > 1.72;
        damageEnemy(target, critical ? 82 : 48, direction, critical ? 20 : 13, 0.28);
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
        propsRef.current.mode !== "playing" ||
        dodge > 0 ||
        stamina < 22
      ) {
        return;
      }
      dodge = 1;
      stamina = Math.max(0, stamina - 22);
      propsRef.current.onStaminaChange(stamina);
      propsRef.current.onSound("dodge");
    };

    const performInteract = () => {
      if (propsRef.current.mode !== "playing" || !currentPrompt) return;
      propsRef.current.onInteraction(currentPrompt);
    };

    const togglePov = () => {
      const next = propsRef.current.pov === "first" ? "third" : "first";
      if (next === "third" && isPointerLocked()) document.exitPointerLock();
      propsRef.current.onPovChange(next);
    };

    actionsRef.current = {
      attack: performAttack,
      shoot: performShoot,
      dodge: performDodge,
      interact: performInteract,
      // Wrapped rather than passed directly: requestPointerLock is declared
      // further down, so a bare reference here would hit the temporal dead zone.
      captureLook: () => requestPointerLock(),
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
      if (isPointerLocked()) return;
      // Chrome returns a Promise here while the DOM lib still types it void, and
      // it rejects if the browser is still throttling a recent Escape exit.
      const result: unknown = renderer.domElement.requestPointerLock();
      if (result instanceof Promise) result.catch(() => undefined);
    };

    const pointerDown = (event: PointerEvent) => {
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
    const pointerUp = () => {
      dragPointer = null;
      renderer.domElement.classList.remove("looking");
    };
    const wheel = (event: WheelEvent) => {
      // Zoom is a third-person concept. Keep the value intact while in first
      // person so toggling back restores the player's chosen boom length.
      if (propsRef.current.pov === "first") return;
      cameraDistance = THREE.MathUtils.clamp(
        cameraDistance + event.deltaY * 0.004,
        3.3,
        7.4,
      );
    };
    const pointerLockChange = () => {
      if (isPointerLocked()) {
        renderer.domElement.classList.add("looking");
        return;
      }
      renderer.domElement.classList.remove("looking");
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
      if (current.chapter === "hospital" && current.step === 3) {
        // Room-relative now that Ground Emergency is a room graph rather than a
        // corridor: the old absolute coordinates sat outside the new footprint.
        spawnEnemyInRoom("walker", "triage", -2.6, -3.4);
        spawnEnemyInRoom("runner", "bayB", 1.8, -1.2);
        spawnEnemyInRoom("walker", "nurse", 1.4, -1.8);
        encounterWasActive = true;
      } else if (current.chapter === "hospital" && current.step === 5) {
        spawnEnemyInRoom("walker", "southHall", -3.2, 1.4);
        spawnEnemyInRoom("runner", "radiology", 2.6, -1.6);
        spawnEnemyInRoom("walker", "subWait", 2.2, 2.4);
        spawnEnemyInRoom("heavy", "stairwell", 0, 2.6);
        encounterWasActive = true;
      } else if (current.chapter === "street" && current.step === 1) {
        spawnEnemy("walker", -2.7, -55);
        spawnEnemy("runner", 4.7, -63);
        spawnEnemy("walker", 1.6, -78);
        encounterWasActive = true;
      } else if (current.chapter === "station" && current.step === 3) {
        spawnEnemy("walker", -5.8, -48);
        spawnEnemy("runner", 5.9, -57);
        spawnEnemy("walker", 4, -71);
        encounterWasActive = true;
        stationWaveClock = 0;
      } else if (current.chapter === "checkpoint" && current.step === 2) {
        spawnEnemy("walker", -4.8, -51);
        spawnEnemy("runner", 5.4, -57);
        spawnEnemy("heavy", 0.8, -76);
        encounterWasActive = true;
        horrorPulse = 4.8;
        current.onSound("horror-sting", { intensity: 1.1 });
      } else if (current.chapter === "depot" && current.step === 3) {
        spawnEnemy("walker", -5.8, -45);
        spawnEnemy("runner", 5.9, -57);
        spawnEnemy("walker", -3.5, -72);
        spawnEnemy("heavy", 4.8, -82);
        encounterWasActive = true;
        horrorPulse = 5.5;
        current.onSound("metal-slam", { intensity: 1.15 });
      } else if (current.chapter === "escape") {
        spawnEnemy("walker", -2.8, -31);
        spawnEnemy("runner", 4.2, -68);
        spawnEnemy("heavy", -3.6, -94);
        escapeDirectorClock = 8;
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

    const animate = (timestamp = performance.now()) => {
      animationFrame = requestAnimationFrame(animate);
      if (document.hidden) {
        lastFrameTime = timestamp;
        lastRenderTime = timestamp;
        return;
      }
      const current = propsRef.current;
      const frameInterval =
        current.mode === "playing"
          ? 1000 / (coarsePointer ? 36 : 48)
          : 1000 / 10;
      const timeSinceRender = timestamp - lastRenderTime;
      if (timeSinceRender < frameInterval) return;
      lastRenderTime =
        timestamp - (timeSinceRender % Math.max(1, frameInterval));
      const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.034);
      lastFrameTime = timestamp;
      elapsedTime += delta;
      const time = elapsedTime;
      updateLocalLightBudget(delta);
      syncWorldState(time, delta);

      if (current.mode === "playing") {
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

        const moving = movement.lengthSq() > 0;
        const running = Boolean(keys.shift && stamina > 1);
        let movementSpeed = running ? 3.3 : 1.1;
        if (attack > 0) {
          movementSpeed *= current.inventory.axe ? 0.52 : 0.7;
        }
        if (dodge > 0) movementSpeed *= 2.25;
        const travel = movementSpeed * delta;
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

        // The torch and the hero mesh are both children of playerRoot, so in
        // first person the body must face exactly where the player is looking,
        // undamped and regardless of whether they are moving. Damping it, or
        // gating it on movement, makes the beam swing away when you strafe or
        // freeze when you turn on the spot.
        if (current.pov === "first") {
          playerRoot.rotation.y = cameraYaw;
        }

        if (running && moving) stamina = Math.max(0, stamina - delta * 17);
        else stamina = Math.min(100, stamina + delta * (moving ? 8 : 15));
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
              surface: "tile",
              intensity: running ? 1 : 0.82,
              pan: (Math.random() - 0.5) * 0.16,
            });
          }
          lastStrideSign = stride < 0 ? -1 : 1;
        } else {
          lastStrideSign = 1;
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
            }
          }
        }

        for (
          let enemyIndex = enemies.length - 1;
          enemyIndex >= 0;
          enemyIndex -= 1
        ) {
          const enemy = enemies[enemyIndex];
          if (enemy.dying) {
            enemy.deathTimer -= delta;
            if (enemy.character) {
              updateAnimatedCharacter(enemy.character, delta, "death");
            }
            if (enemy.deathTimer <= 0) removeEnemy(enemy);
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
          if (distance < 1.45 && enemy.attackClock <= 0) {
            enemy.attackClock =
              enemy.character?.style === "runner"
                ? 0.82
                : enemy.character?.style === "heavy"
                  ? 1.48
                  : 1.18;
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
            spawnBlood(
              bloodOrigin.copy(playerRoot.position).setY(
                playerRoot.position.y + 1.14,
              ),
              attackDirectionVector,
              enemy.character?.style === "runner"
                ? 15
                : enemy.character?.style === "heavy"
                  ? 20
                  : 10,
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
          enemy.healthBar.group.visible =
            distance < 25 || enemy.hp < enemy.maxHp;
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
          current.step >= 3 &&
          playerRoot.position.z < -10
            ? "hospital-curtain"
            : current.chapter === "hospital" &&
                current.step >= 1 &&
                playerRoot.position.z < 2
              ? "hospital-blackout"
              : current.chapter === "street" &&
                  current.step >= 1 &&
                  playerRoot.position.z < -36
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
                0.16,
                0.9,
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

        progressReportClock += delta;
        const reportProgress = progressReportClock >= 0.12;
        if (reportProgress) progressReportClock = 0;

        if (current.chapter === "survival") {
          survivalTime += delta;
          survivalReportClock += delta;
          if (livingEnemies.length === 0) {
            survivalWaveClock -= delta;
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
        const horizontalDistance =
          cameraDistance * Math.cos(cameraPitch);
        desiredCamera.set(
          playerRoot.position.x +
            Math.sin(cameraYaw) * horizontalDistance,
          playerRoot.position.y +
            2.0 +
            Math.sin(cameraPitch) * cameraDistance,
          playerRoot.position.z +
            Math.cos(cameraYaw) * horizontalDistance,
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
