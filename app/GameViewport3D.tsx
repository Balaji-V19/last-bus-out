"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import {
  animateCharacter,
  createCharacter,
  disposeCharacter,
  setEquipmentVisible,
  type CharacterRig,
} from "./game3d/character";
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
  inventory: Inventory;
  resetToken: number;
  onInteraction: (id: string) => void;
  onPromptChange: (prompt: { id: string; label: string } | null) => void;
  onStaminaChange: (value: number) => void;
  onDamage: (amount: number) => void;
  onKill: () => void;
  onEncounterCleared: () => void;
  onFuelProgress: (value: number) => void;
  onEscapeProgress: (value: number) => void;
};

export type GameViewportHandle = {
  attack: () => void;
  dodge: () => void;
  interact: () => void;
  setMove: (key: "w" | "a" | "s" | "d" | "shift", active: boolean) => void;
};

type EnemyActor = {
  id: number;
  hp: number;
  speed: number;
  attackClock: number;
  rig: CharacterRig;
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
  return false;
}

function playerCanOccupy(
  x: number,
  z: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  collisions: Array<{ x: number; z: number; radius: number }>,
) {
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
  return !collisions.some((collision) => Math.hypot(x - collision.x, z - collision.z) < collision.radius + 0.48);
}

export const GameViewport3D = forwardRef<GameViewportHandle, GameViewportProps>(
  function GameViewport3D(props, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const propsRef = useRef(props);
    const actionsRef = useRef<GameViewportHandle>({
      attack: () => undefined,
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
        dodge: () => actionsRef.current.dodge(),
        interact: () => actionsRef.current.interact(),
        setMove: (key, active) => actionsRef.current.setMove(key, active),
      }),
      [],
    );

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(
        props.chapter === "hospital"
          ? 0x151d1a
          : props.chapter === "street"
            ? 0x4e4b40
            : 0x4b2c24,
      );
      scene.fog = new THREE.FogExp2(
        props.chapter === "hospital" ? 0x384640 : 0x756252,
        props.chapter === "hospital" ? 0.022 : 0.012,
      );

      const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 210);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = props.chapter === "hospital" ? 1.05 : 1.18;
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

      const hero = createCharacter("hero");
      hero.root.position.copy(world.start);
      setEquipmentVisible(hero, propsRef.current.inventory);
      scene.add(hero.root);

      let maya: CharacterRig | null = null;
      const enemies: EnemyActor[] = [];
      const keys: Record<string, boolean> = {};
      const movement = new THREE.Vector3();
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      const cameraTarget = new THREE.Vector3();
      const desiredCamera = new THREE.Vector3();
      const lastPlayerPosition = hero.root.position.clone();
      let animationFrame = 0;
      let cameraYaw = 0;
      let cameraPitch = 0.2;
      let cameraDistance = props.chapter === "hospital" ? 4.6 : 5.6;
      let dragPointer: { id: number; x: number; y: number } | null = null;
      let attack = 0;
      let attackHit = false;
      let dodge = 0;
      let stamina = 100;
      let currentPrompt: string | null = null;
      let currentPromptLabel = "";
      let encounterKey = "";
      let encounterWasActive = false;
      let fuelProgress = 0;
      let stationWaveClock = 0;
      let statsClock = 0;
      let nextEnemyId = 1;
      let elapsedTime = 0;
      let lastFrameTime = performance.now();

      const resize = () => {
        const rect = mount.getBoundingClientRect();
        renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
        camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
        camera.updateProjectionMatrix();
      };
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      const spawnEnemy = (
        style: "walker" | "runner",
        x: number,
        z: number,
        phase: number,
      ) => {
        const rig = createCharacter(style, phase);
        rig.root.position.set(x, 0, z);
        rig.root.rotation.y = Math.PI;
        scene.add(rig.root);
        enemies.push({
          id: nextEnemyId++,
          hp: style === "runner" ? 50 : 74,
          speed: style === "runner" ? 2.5 : 1.25,
          attackClock: Math.random() * 0.5,
          rig,
        });
      };

      const removeEnemy = (enemy: EnemyActor) => {
        const index = enemies.indexOf(enemy);
        if (index >= 0) enemies.splice(index, 1);
        scene.remove(enemy.rig.root);
        disposeCharacter(enemy.rig);
        propsRef.current.onKill();
      };

      const performAttack = () => {
        if (propsRef.current.mode !== "playing" || attack > 0 || stamina < 10) return;
        attack = 1;
        attackHit = false;
        stamina = Math.max(0, stamina - 11);
        propsRef.current.onStaminaChange(stamina);
      };

      const performDodge = () => {
        if (propsRef.current.mode !== "playing" || dodge > 0 || stamina < 22) return;
        dodge = 1;
        stamina = Math.max(0, stamina - 22);
        propsRef.current.onStaminaChange(stamina);
      };

      const performInteract = () => {
        if (propsRef.current.mode !== "playing" || !currentPrompt) return;
        propsRef.current.onInteraction(currentPrompt);
      };

      actionsRef.current = {
        attack: performAttack,
        dodge: performDodge,
        interact: performInteract,
        setMove: (key, active) => {
          keys[key] = active;
        },
      };

      const keyDown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (["w", "a", "s", "d", "shift", "e", "f", " ", "q", "r"].includes(key)) {
          event.preventDefault();
        }
        keys[key] = true;
        if (key === "f") performAttack();
        if (key === " ") performDodge();
        if (key === "e") performInteract();
      };
      const keyUp = (event: KeyboardEvent) => {
        keys[event.key.toLowerCase()] = false;
      };
      window.addEventListener("keydown", keyDown, { passive: false });
      window.addEventListener("keyup", keyUp);

      const pointerDown = (event: PointerEvent) => {
        dragPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        renderer.domElement.setPointerCapture(event.pointerId);
        renderer.domElement.classList.add("looking");
      };
      const pointerMove = (event: PointerEvent) => {
        if (!dragPointer || dragPointer.id !== event.pointerId) return;
        const dx = event.clientX - dragPointer.x;
        const dy = event.clientY - dragPointer.y;
        cameraYaw -= dx * 0.0042;
        cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * 0.003, -0.08, 0.58);
        dragPointer.x = event.clientX;
        dragPointer.y = event.clientY;
      };
      const pointerUp = () => {
        dragPointer = null;
        renderer.domElement.classList.remove("looking");
      };
      const wheel = (event: WheelEvent) => {
        cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.004, 3.3, 7.4);
      };
      renderer.domElement.addEventListener("pointerdown", pointerDown);
      renderer.domElement.addEventListener("pointermove", pointerMove);
      renderer.domElement.addEventListener("pointerup", pointerUp);
      renderer.domElement.addEventListener("pointercancel", pointerUp);
      renderer.domElement.addEventListener("wheel", wheel, { passive: true });

      const syncWorldState = (time: number) => {
        const current = propsRef.current;
        setEquipmentVisible(hero, current.inventory);

        if (current.rescued && !maya) {
          maya = createCharacter("maya", 1.7);
          maya.root.position.copy(hero.root.position).add(new THREE.Vector3(1.1, 0, 1.6));
          scene.add(maya.root);
        }
        if (!current.rescued && maya) {
          scene.remove(maya.root);
          disposeCharacter(maya);
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
          if (visible) {
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
        }

        const spawnKey = `${current.chapter}:${current.step}`;
        if (spawnKey !== encounterKey) {
          encounterKey = spawnKey;
          encounterWasActive = false;
          if (current.chapter === "hospital" && current.step === 3) {
            spawnEnemy("walker", 0.4, -59, 0.2);
            spawnEnemy("walker", -3.8, -69, 2.4);
            encounterWasActive = true;
          } else if (current.chapter === "street" && current.step === 1) {
            spawnEnemy("walker", -2.7, -55, 0.7);
            spawnEnemy("runner", 4.7, -63, 2.1);
            spawnEnemy("walker", 1.6, -78, 4.4);
            encounterWasActive = true;
          } else if (current.chapter === "station" && current.step === 1) {
            spawnEnemy("walker", -12, -48, 0.4);
            spawnEnemy("runner", 13, -52, 2.2);
            spawnEnemy("walker", 4, -71, 4.7);
            encounterWasActive = true;
            stationWaveClock = 0;
          }
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
          const distance = hero.root.position.distanceTo(interaction.position);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestId = interaction.id;
            nearestLabel = interaction.label;
          }
        }
        if (nearestId !== currentPrompt || nearestLabel !== currentPromptLabel) {
          currentPrompt = nearestId;
          currentPromptLabel = nearestLabel;
          propsRef.current.onPromptChange(
            nearestId ? { id: nearestId, label: nearestLabel } : null,
          );
        }
      };

      const animate = (timestamp = performance.now()) => {
        animationFrame = requestAnimationFrame(animate);
        const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.034);
        lastFrameTime = timestamp;
        elapsedTime += dt;
        const time = elapsedTime;
        const current = propsRef.current;
        syncWorldState(time);

        if (current.mode === "playing") {
          if (keys.q) cameraYaw += dt * 1.4;
          if (keys.r) cameraYaw -= dt * 1.4;

          forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize();
          right.crossVectors(forward, UP).normalize();
          movement.set(0, 0, 0);
          if (keys.w) movement.add(forward);
          if (keys.s) movement.sub(forward);
          if (keys.d) movement.add(right);
          if (keys.a) movement.sub(right);
          if (movement.lengthSq() > 0) movement.normalize();

          const moving = movement.lengthSq() > 0;
          const running = Boolean(keys.shift && stamina > 1);
          let speed = running ? 6.1 : 3.25;
          if (dodge > 0) speed *= 2.35;
          const travel = speed * dt;

          if (moving) {
            const nextX = hero.root.position.x + movement.x * travel;
            const nextZ = hero.root.position.z + movement.z * travel;
            if (playerCanOccupy(nextX, hero.root.position.z, world.bounds, world.collisions)) {
              hero.root.position.x = nextX;
            }
            if (playerCanOccupy(hero.root.position.x, nextZ, world.bounds, world.collisions)) {
              hero.root.position.z = nextZ;
            }
            const targetRotation = Math.atan2(-movement.x, -movement.z);
            hero.root.rotation.y = dampAngle(hero.root.rotation.y, targetRotation, Math.min(1, dt * 12));
          }

          if (running && moving) stamina = Math.max(0, stamina - dt * 17);
          else stamina = Math.min(100, stamina + dt * (moving ? 8 : 15));

          attack = Math.max(0, attack - dt * 2.45);
          dodge = Math.max(0, dodge - dt * 2.9);
          const actualSpeed = hero.root.position.distanceTo(lastPlayerPosition) / Math.max(dt, 0.001);
          const turnAmount = THREE.MathUtils.clamp(movement.x, -1, 1);
          animateCharacter(hero, time, actualSpeed, running, attack, turnAmount);
          lastPlayerPosition.copy(hero.root.position);

          if (attack > 0.42 && !attackHit) {
            attackHit = true;
            const heroForward = new THREE.Vector3(0, 0, -1).applyQuaternion(hero.root.quaternion);
            for (const enemy of [...enemies]) {
              const toEnemy = enemy.rig.root.position.clone().sub(hero.root.position);
              const distance = toEnemy.length();
              toEnemy.normalize();
              if (distance < 2.75 && heroForward.dot(toEnemy) > 0.14) {
                enemy.hp -= current.inventory.axe ? 52 : 24;
                enemy.rig.root.position.add(toEnemy.multiplyScalar(0.52));
                if (enemy.hp <= 0) removeEnemy(enemy);
              }
            }
          }

          for (const enemy of enemies) {
            const delta = hero.root.position.clone().sub(enemy.rig.root.position);
            const distance = delta.length();
            delta.y = 0;
            if (delta.lengthSq() > 0) delta.normalize();
            const canChase = distance < 26;
            if (canChase && distance > 1.15) {
              enemy.rig.root.position.addScaledVector(delta, enemy.speed * dt);
              const targetRotation = Math.atan2(-delta.x, -delta.z);
              enemy.rig.root.rotation.y = dampAngle(
                enemy.rig.root.rotation.y,
                targetRotation,
                Math.min(1, dt * 7),
              );
            }
            enemy.attackClock -= dt;
            if (distance < 1.35 && enemy.attackClock <= 0) {
              enemy.attackClock = enemy.rig.style === "runner" ? 0.7 : 1.12;
              propsRef.current.onDamage(enemy.rig.style === "runner" ? 11 : 7);
            }
            animateCharacter(
              enemy.rig,
              time,
              canChase ? enemy.speed : 0,
              enemy.rig.style === "runner",
              0,
            );
          }

          if (encounterWasActive && enemies.length === 0) {
            encounterWasActive = false;
            propsRef.current.onEncounterCleared();
          }

          if (current.chapter === "station" && current.step === 1) {
            fuelProgress = Math.min(1, fuelProgress + dt / 24);
            stationWaveClock += dt;
            if (stationWaveClock > 7 && fuelProgress < 0.86) {
              stationWaveClock = 0;
              const side = Math.random() > 0.5 ? 1 : -1;
              spawnEnemy(
                Math.random() > 0.68 ? "runner" : "walker",
                side * (11 + Math.random() * 3),
                -45 - Math.random() * 20,
                Math.random() * Math.PI * 2,
              );
              encounterWasActive = true;
            }
            propsRef.current.onFuelProgress(fuelProgress);
          }

          if (current.chapter === "escape") {
            const progress = THREE.MathUtils.clamp(
              (world.start.z - hero.root.position.z) / (world.start.z - world.bounds.minZ),
              0,
              1,
            );
            propsRef.current.onEscapeProgress(progress);
          }

          if (maya) {
            const followOffset = new THREE.Vector3(1.05, 0, 1.55).applyAxisAngle(UP, hero.root.rotation.y);
            const target = hero.root.position.clone().add(followOffset);
            const delta = target.sub(maya.root.position);
            const distance = delta.length();
            let mayaSpeed = 0;
            if (distance > 0.42) {
              delta.normalize();
              mayaSpeed = Math.min(running ? 6.4 : 3.5, distance * 3.2);
              maya.root.position.addScaledVector(delta, mayaSpeed * dt);
              const targetRotation = Math.atan2(-delta.x, -delta.z);
              maya.root.rotation.y = dampAngle(maya.root.rotation.y, targetRotation, Math.min(1, dt * 10));
            }
            animateCharacter(maya, time, mayaSpeed, running && distance > 1, 0);
          }

          updateInteractions();
          statsClock += dt;
          if (statsClock > 0.12) {
            statsClock = 0;
            current.onStaminaChange(stamina);
          }
        } else {
          animateCharacter(hero, time, 0, false, 0);
          if (maya) animateCharacter(maya, time, 0, false, 0);
          for (const enemy of enemies) animateCharacter(enemy.rig, time, 0, false, 0);
        }

        cameraTarget.copy(hero.root.position).add(new THREE.Vector3(0, 1.25, 0));
        const horizontalDistance = cameraDistance * Math.cos(cameraPitch);
        desiredCamera.set(
          hero.root.position.x + Math.sin(cameraYaw) * horizontalDistance,
          hero.root.position.y + 2.05 + Math.sin(cameraPitch) * cameraDistance,
          hero.root.position.z + Math.cos(cameraYaw) * horizontalDistance,
        );
        camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 9));
        const lookAhead = forward.clone().multiplyScalar(2.6);
        camera.lookAt(cameraTarget.add(lookAhead));

        world.backdrop.position.set(
          camera.position.x * 0.14,
          props.chapter === "hospital" ? 18 : 20,
          hero.root.position.z - 104,
        );
        world.backdrop.lookAt(camera.position.x * 0.14, 18, camera.position.z);

        renderer.render(scene, camera);
      };
      animate();

      return () => {
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
        for (const enemy of enemies) disposeCharacter(enemy.rig);
        if (maya) disposeCharacter(maya);
        disposeCharacter(hero);
        disposeWorld(world);
        renderer.dispose();
        renderer.forceContextLoss();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    }, [props.chapter, props.resetToken]);

    return <div ref={mountRef} className="game-canvas game-viewport-3d" />;
  },
);
