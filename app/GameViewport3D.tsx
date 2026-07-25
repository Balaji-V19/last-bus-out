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
  type EquipmentKind,
  type GameChapter,
} from "./game3d/scene";

type Inventory = Partial<Record<EquipmentKind, boolean>>;

type GameViewportProps = {
  chapter: GameChapter;
  mode: "menu" | "playing" | "paused" | "ending";
  step: number;
  rescued: boolean;
  health: number;
  ammo: number;
  inventory: Inventory;
  resetToken: number;
  onInteraction: (id: string) => void;
  onPromptChange: (prompt: { id: string; label: string } | null) => void;
  onStaminaChange: (value: number) => void;
  onDamage: (amount: number) => void;
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

type EnemyActor = {
  id: number;
  hp: number;
  maxHp: number;
  speed: number;
  attackClock: number;
  attackAnimation: number;
  hitTimer: number;
  deathTimer: number;
  dying: boolean;
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
    if (id === "exit") return step >= 4;
  }
  if (chapter === "street") {
    if (id === "signal") return step === 0;
    if (id === "maya") return step === 1;
    if (id === "pistol") return !inventory.pistol;
    if (id === "bike") return step >= 2;
  }
  if (chapter === "station") {
    if (id === "generator") return step === 0;
    if (id === "meds") return !inventory.medkit;
    if (id === "bike") return step >= 2;
  }
  if (chapter === "checkpoint") {
    if (id === "checkpoint-radio") return step === 0;
    if (id === "fuse") return step === 1;
    if (id === "checkpoint-gate") return step >= 3;
  }
  if (chapter === "depot") {
    if (id === "depot-key") return step === 0;
    if (id === "battery") return step === 1;
    if (id === "bus") return step >= 3;
  }
  return false;
}

function playerCanOccupy(
  x: number,
  z: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  collisions: Array<{ x: number; z: number; radius: number }>,
) {
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
      collision.radius + 0.48,
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
      setMove: (key, active) => actionsRef.current.setMove(key, active),
    }),
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    const scene = new THREE.Scene();
    const backgroundColors: Record<GameChapter, number> = {
      hospital: 0x111916,
      street: 0x3f453e,
      station: 0x5d3328,
      checkpoint: 0x151b19,
      depot: 0x0b100e,
      escape: 0x49312d,
      survival: 0x152321,
    };
    scene.background = new THREE.Color(backgroundColors[props.chapter]);
    scene.fog = new THREE.FogExp2(
      props.chapter === "hospital"
        ? 0x35433d
        : props.chapter === "checkpoint"
          ? 0x222c28
          : props.chapter === "depot"
            ? 0x18201d
        : props.chapter === "survival"
          ? 0x243c38
          : 0x6c5a4d,
      props.chapter === "hospital" || props.chapter === "depot"
        ? 0.025
        : props.chapter === "checkpoint"
          ? 0.019
        : props.chapter === "survival"
          ? 0.018
          : 0.012,
    );

    const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 210);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure =
      props.chapter === "hospital" || props.chapter === "depot" ? 1.02 : 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "three-canvas";
    renderer.domElement.setAttribute(
      "aria-label",
      "Three-dimensional game world. Use W A S D to walk, Shift to run, drag to look, F to attack, and E to interact.",
    );
    mount.appendChild(renderer.domElement);

    const world = buildWorld(props.chapter);
    scene.add(world.root);
    const flickerLights: THREE.Light[] = [];
    world.root.traverse((object) => {
      if (object instanceof THREE.Light && object.userData.flicker) {
        flickerLights.push(object);
      }
    });

    const playerRoot = new THREE.Group();
    playerRoot.position.copy(world.start);
    scene.add(playerRoot);
    const flashlight = new THREE.SpotLight(
      0xeaf4dc,
      6.8,
      29,
      Math.PI / 7.5,
      0.42,
      1.35,
    );
    flashlight.position.set(0.28, 1.46, -0.34);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
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
    const bloodDecalMaterial = new THREE.MeshPhysicalMaterial({
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
    const cameraTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const lastPlayerPosition = playerRoot.position.clone();
    let animationFrame = 0;
    let cameraYaw = 0;
    let cameraPitch = 0.2;
    let cameraDistance = props.chapter === "hospital" ? 4.3 : 5.4;
    let dragPointer: { id: number; x: number; y: number } | null = null;
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
    let footstepClock = 0;
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
    let nextEnemyId = 1;
    let elapsedTime = 0;
    let fear = 8;
    let fearReportClock = 0;
    let heartbeatClock = 0;
    let horrorPulse = 0;
    let cameraShake = 0;
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

    const spawnBlood = (
      position: THREE.Vector3,
      direction: THREE.Vector3,
      count: number,
    ) => {
      const normalizedDirection = direction.clone().normalize();
      for (let index = 0; index < count; index += 1) {
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
      if (bloodDecals.length >= 24) return;
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(0.12 + Math.random() * 0.2, 14),
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
        hp: scaledMaxHp,
        maxHp: scaledMaxHp,
        speed:
          (style === "runner" ? 2.75 : style === "heavy" ? 0.88 : 1.3) *
          (1 + survivalDifficulty * 0.28),
        attackClock: 0.5 + Math.random() * 0.7,
        attackAnimation: 0,
        hitTimer: 0,
        deathTimer: 0,
        dying: false,
        root,
        character: null,
        healthBar,
      };
      enemies.push(actor);
      const spawnDistance = root.position.distanceTo(playerRoot.position);
      propsRef.current.onSound("zombie-alert", {
        intensity: THREE.MathUtils.clamp(1 - spawnDistance / 42, 0.14, 0.72),
        pan: THREE.MathUtils.clamp(
          (root.position.x - playerRoot.position.x) / 18,
          -0.9,
          0.9,
        ),
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
        pan: THREE.MathUtils.clamp(
          (enemy.root.position.x - playerRoot.position.x) / 8,
          -0.85,
          0.85,
        ),
      });
      if (enemy.hp <= 0) {
        enemy.dying = true;
        enemy.deathTimer = 1.65;
        enemy.healthBar.group.visible = false;
        stamina = Math.min(100, stamina + 9);
        combatScore += Math.round(120 * (1 + combo * 0.12));
        current.onCombatProgress(combo, combatScore);
        current.onSound("zombie-death", {
          pan: THREE.MathUtils.clamp(
            (enemy.root.position.x - playerRoot.position.x) / 10,
            -0.85,
            0.85,
          ),
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

    actionsRef.current = {
      attack: performAttack,
      shoot: performShoot,
      dodge: performDodge,
      interact: performInteract,
      setMove: (key, active) => {
        keys[key] = active;
      },
    };

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        ["w", "a", "s", "d", "shift", "e", "f", "g", " ", "q", "r"].includes(
          key,
        )
      ) {
        event.preventDefault();
      }
      keys[key] = true;
      if (key === "f") performAttack();
      if (key === "g") performShoot();
      if (key === " ") performDodge();
      if (key === "e") performInteract();
    };
    const keyUp = (event: KeyboardEvent) => {
      keys[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);

    const pointerDown = (event: PointerEvent) => {
      dragPointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add("looking");
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragPointer || dragPointer.id !== event.pointerId) return;
      const dx = event.clientX - dragPointer.x;
      const dy = event.clientY - dragPointer.y;
      cameraYaw -= dx * 0.0042;
      cameraPitch = THREE.MathUtils.clamp(
        cameraPitch - dy * 0.003,
        -0.08,
        0.58,
      );
      dragPointer.x = event.clientX;
      dragPointer.y = event.clientY;
    };
    const pointerUp = () => {
      dragPointer = null;
      renderer.domElement.classList.remove("looking");
    };
    const wheel = (event: WheelEvent) => {
      cameraDistance = THREE.MathUtils.clamp(
        cameraDistance + event.deltaY * 0.004,
        3.3,
        7.4,
      );
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: true });

    const syncWorldState = (time: number) => {
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
        interaction.object.rotation.y = Math.sin(time * 0.5) * 0.08;
        for (const child of interaction.object.children) {
          if (child.userData.marker) {
            child.rotation.z = time * 0.7;
            child.scale.setScalar(1 + Math.sin(time * 2.4) * 0.08);
          } else {
            child.rotation.y = time * 0.65;
            child.position.y = 0.72 + Math.sin(time * 2.2) * 0.08;
          }
        }
      }

      const spawnKey = `${current.chapter}:${current.step}`;
      if (spawnKey === encounterKey) return;
      encounterKey = spawnKey;
      encounterWasActive = false;
      if (current.chapter === "hospital" && current.step === 3) {
        spawnEnemy("walker", 0.4, -59);
        spawnEnemy("walker", -3.8, -69);
        encounterWasActive = true;
      } else if (current.chapter === "street" && current.step === 1) {
        spawnEnemy("walker", -2.7, -55);
        spawnEnemy("runner", 4.7, -63);
        spawnEnemy("walker", 1.6, -78);
        encounterWasActive = true;
      } else if (current.chapter === "station" && current.step === 1) {
        spawnEnemy("walker", -12, -48);
        spawnEnemy("runner", 13, -52);
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
      } else if (current.chapter === "depot" && current.step === 2) {
        spawnEnemy("walker", -5.8, -45);
        spawnEnemy("runner", 7.4, -57);
        spawnEnemy("walker", -3.5, -72);
        spawnEnemy("heavy", 8.8, -78);
        encounterWasActive = true;
        horrorPulse = 5.5;
        current.onSound("metal-slam", { intensity: 1.15 });
      } else if (current.chapter === "escape") {
        spawnEnemy("walker", -2.8, -31);
        spawnEnemy("runner", 4.2, -68);
        spawnEnemy("walker", -3.6, -112);
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
      const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.034);
      lastFrameTime = timestamp;
      elapsedTime += delta;
      const time = elapsedTime;
      const current = propsRef.current;
      syncWorldState(time);

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
        let movementSpeed = running ? 5.8 : 3.05;
        if (dodge > 0) movementSpeed *= 2.25;
        const travel = movementSpeed * delta;
        if (moving) {
          const nextX = playerRoot.position.x + movement.x * travel;
          const nextZ = playerRoot.position.z + movement.z * travel;
          if (
            playerCanOccupy(
              nextX,
              playerRoot.position.z,
              world.bounds,
              world.collisions,
            )
          ) {
            playerRoot.position.x = nextX;
          }
          if (
            playerCanOccupy(
              playerRoot.position.x,
              nextZ,
              world.bounds,
              world.collisions,
            )
          ) {
            playerRoot.position.z = nextZ;
          }
          const targetRotation = Math.atan2(-movement.x, -movement.z);
          playerRoot.rotation.y = dampAngle(
            playerRoot.rotation.y,
            targetRotation,
            Math.min(1, delta * 11),
          );
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
        if (actualSpeed > 0.18) {
          footstepClock -= delta;
          if (footstepClock <= 0) {
            const surface =
              current.chapter === "hospital"
                ? "tile"
                : current.chapter === "survival"
                  ? "gravel"
                  : "asphalt";
            current.onSound("footstep", {
              running,
              surface,
              intensity: running ? 1 : 0.82,
              pan: (Math.random() - 0.5) * 0.16,
            });
            footstepClock = running ? 0.27 : 0.43;
          }
        } else {
          footstepClock = 0;
        }
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
                  ? running
                    ? "run"
                    : "walk"
                  : "idle";
          updateAnimatedCharacter(hero, delta, heroState);
          setCharacterHitFlash(hero, heroHitTimer > 0 ? heroHitTimer : 0);
          hero.root.rotation.x =
            gunRecoil > 0 ? -Math.sin(gunRecoil * 20) * 0.055 : 0;
        }

        if (attack < 0.65 && attack > 0.18 && !attackHit) {
          attackHit = true;
          const heroForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            playerRoot.quaternion,
          );
          for (const enemy of enemies) {
            if (enemy.dying) continue;
            const toEnemy = enemy.root.position
              .clone()
              .sub(playerRoot.position);
            const distance = toEnemy.length();
            const direction = toEnemy.clone().normalize();
            if (distance < 2.85 && heroForward.dot(direction) > -0.05) {
              damageEnemy(
                enemy,
                current.inventory.axe ? 58 : 25,
                direction,
                current.inventory.axe ? 24 : 13,
                0.38,
              );
            }
          }
        }

        for (const enemy of [...enemies]) {
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
          const offset = playerRoot.position.clone().sub(enemy.root.position);
          const distance = offset.length();
          offset.y = 0;
          if (offset.lengthSq() > 0) offset.normalize();
          const canChase = distance < 28;
          if (
            canChase &&
            distance > 1.18 &&
            enemy.hitTimer <= 0.08 &&
            enemy.attackAnimation <= 0.08
          ) {
            enemy.root.position.addScaledVector(offset, enemy.speed * delta);
            const targetRotation = Math.atan2(-offset.x, -offset.z);
            enemy.root.rotation.y = dampAngle(
              enemy.root.rotation.y,
              targetRotation,
              Math.min(1, delta * 7),
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
            const attackDirection = playerRoot.position
              .clone()
              .sub(enemy.root.position)
              .normalize();
            spawnBlood(
              playerRoot.position
                .clone()
                .add(new THREE.Vector3(0, 1.14, 0)),
              attackDirection,
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
              pan: THREE.MathUtils.clamp(
                (enemy.root.position.x - playerRoot.position.x) / 7,
                -0.9,
                0.9,
              ),
            });
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
            setCharacterHitFlash(
              enemy.character,
              enemy.hitTimer > 0 ? enemy.hitTimer : 0,
            );
          }

          enemy.healthBar.group.position
            .copy(enemy.root.position)
            .add(new THREE.Vector3(0, 2.36, 0));
          enemy.healthBar.group.quaternion.copy(camera.quaternion);
          enemy.healthBar.group.visible =
            distance < 25 || enemy.hp < enemy.maxHp;
        }

        const livingEnemies = enemies.filter((enemy) => !enemy.dying);
        const scareKey =
          current.chapter === "hospital" &&
          current.step >= 3 &&
          playerRoot.position.z < -48
            ? "hospital-curtain"
            : current.chapter === "hospital" &&
                current.step >= 1 &&
                playerRoot.position.z < -22
              ? "hospital-blackout"
              : current.chapter === "street" &&
                  current.step >= 1 &&
                  playerRoot.position.z < -36
                ? "street-radio"
                : current.chapter === "station" &&
                    current.step >= 1 &&
                    playerRoot.position.z < -46
                  ? "station-pumps"
                  : current.chapter === "depot" &&
                      current.step >= 1 &&
                      playerRoot.position.z < -42
                    ? "depot-pit"
                    : "";
        if (scareKey && !scareFlags.has(scareKey)) {
          scareFlags.add(scareKey);
          horrorPulse = scareKey === "hospital-curtain" ? 5.2 : 3.8;
          cameraShake = scareKey === "hospital-curtain" ? 0.3 : 0.14;
          current.onSound(
            scareKey === "street-radio"
              ? "radio-static"
              : scareKey === "depot-pit"
                ? "metal-slam"
                : "horror-sting",
            { intensity: scareKey === "hospital-curtain" ? 1.15 : 0.88 },
          );
          if (scareKey === "hospital-curtain") {
            spawnEnemy(
              "runner",
              playerRoot.position.x > 0 ? -5.8 : 5.8,
              Math.max(world.bounds.minZ + 5, playerRoot.position.z - 8),
            );
            encounterWasActive = true;
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
        const chapterDread =
          current.chapter === "hospital"
            ? 16
            : current.chapter === "depot"
              ? 19
              : current.chapter === "checkpoint"
                ? 13
                : current.chapter === "survival"
                  ? 20
                  : 8;
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
        for (let index = 0; index < flickerLights.length; index += 1) {
          const light = flickerLights[index];
          const baseIntensity = Number(light.userData.baseIntensity ?? 1);
          const failure =
            horrorPulse > 0 &&
            Math.sin(time * 28 + index * 2.17) + Math.sin(time * 9.2) > 0.48;
          const unstable =
            (current.chapter === "hospital" || current.chapter === "depot") &&
            Math.sin(time * 1.7 + index * 4.9) > 0.985;
          light.intensity = failure ? baseIntensity * 0.04 : unstable ? baseIntensity * 0.38 : baseIntensity;
        }

        zombieVoiceClock -= delta;
        if (livingEnemies.length > 0 && zombieVoiceClock <= 0) {
          let nearest = livingEnemies[0];
          let nearestDistance = nearest.root.position.distanceTo(
            playerRoot.position,
          );
          for (const enemy of livingEnemies.slice(1)) {
            const distance = enemy.root.position.distanceTo(
              playerRoot.position,
            );
            if (distance < nearestDistance) {
              nearest = enemy;
              nearestDistance = distance;
            }
          }
          current.onSound("zombie-alert", {
            intensity: THREE.MathUtils.clamp(
              1.05 - nearestDistance / 30,
              0.16,
              0.9,
            ),
            pan: THREE.MathUtils.clamp(
              (nearest.root.position.x - playerRoot.position.x) / 16,
              -0.9,
              0.9,
            ),
          });
          zombieVoiceClock = 3.2 + Math.random() * 4.4;
        }
        if (encounterWasActive && livingEnemies.length === 0) {
          encounterWasActive = false;
          current.onEncounterCleared();
        }

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
                const along = -69 + Math.random() * 68;
                const x =
                  edge === 0
                    ? -19
                    : edge === 1
                      ? 19
                      : -17 + Math.random() * 34;
                const z =
                  edge === 2
                    ? -74
                    : edge === 3
                      ? 2
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

        if (current.chapter === "station" && current.step === 1) {
          fuelProgress = Math.min(1, fuelProgress + delta / 24);
          stationWaveClock += delta;
          if (stationWaveClock > 7 && fuelProgress < 0.86) {
            stationWaveClock = 0;
            const side = Math.random() > 0.5 ? 1 : -1;
            spawnEnemy(
              Math.random() > 0.68 ? "runner" : "walker",
              side * (11 + Math.random() * 3),
              -45 - Math.random() * 20,
            );
            encounterWasActive = true;
          }
          current.onFuelProgress(fuelProgress);
        }

        if (current.chapter === "escape") {
          const progress = THREE.MathUtils.clamp(
            (world.start.z - playerRoot.position.z) /
              (world.start.z - world.bounds.minZ),
            0,
            1,
          );
          current.onEscapeProgress(progress);
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
          const followOffset = new THREE.Vector3(
            1.05,
            0,
            1.55,
          ).applyAxisAngle(UP, playerRoot.rotation.y);
          const target = playerRoot.position.clone().add(followOffset);
          const offset = target.sub(maya.root.position);
          const distance = offset.length();
          let companionSpeed = 0;
          if (distance > 0.42) {
            offset.normalize();
            companionSpeed = Math.min(
              running ? 6.2 : 3.35,
              distance * 3.2,
            );
            maya.root.position.addScaledVector(
              offset,
              companionSpeed * delta,
            );
            const targetRotation = Math.atan2(-offset.x, -offset.z);
            maya.root.rotation.y = dampAngle(
              maya.root.rotation.y,
              targetRotation,
              Math.min(1, delta * 10),
            );
          }
          if (maya.character) {
            updateAnimatedCharacter(
              maya.character,
              delta,
              companionSpeed > 4
                ? "run"
                : companionSpeed > 0.1
                  ? "walk"
                  : "idle",
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
      cameraTarget
        .copy(playerRoot.position)
        .add(new THREE.Vector3(0, 1.28, 0));
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
          new THREE.Vector3(
            (Math.random() - 0.5) * cameraShake,
            (Math.random() - 0.5) * cameraShake * 0.62,
            (Math.random() - 0.5) * cameraShake,
          ),
        );
      }
      const targetFov = 58 + fear * 0.018;
      if (Math.abs(camera.fov - targetFov) > 0.02) {
        camera.fov = THREE.MathUtils.lerp(
          camera.fov,
          targetFov,
          1 - Math.exp(-delta * 3.2),
        );
        camera.updateProjectionMatrix();
      }
      camera.position.lerp(
        desiredCamera,
        1 - Math.exp(-delta * 9),
      );
      const lookAhead = forward.clone().multiplyScalar(2.5);
      camera.lookAt(cameraTarget.add(lookAhead));
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
