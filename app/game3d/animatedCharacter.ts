import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

export type AnimatedStyle = "hero" | "maya" | "walker" | "runner" | "heavy";
export type AnimationState =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "attackRun"
  | "shoot"
  | "hit"
  | "death";

export type AnimatedCharacter = {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAction: string;
  style: AnimatedStyle;
  height: number;
  weaponNodes: THREE.Object3D[];
};

type LoadedModel = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

const MODEL_PATHS: Record<AnimatedStyle, string> = {
  hero: "/models/survivor-matt.gltf",
  maya: "/models/survivor-lis.gltf",
  walker: "/models/zombie-basic.gltf",
  runner: "/models/zombie-arm.gltf",
  heavy: "/models/zombie-chubby.gltf",
};

const modelCache = new Map<string, Promise<LoadedModel>>();
const WEAPON_NAMES = [
  "Axe",
  "Guitar",
  "Knife",
  "Pistol",
  "Rifle",
  "Shotgun",
  "SMG",
  "Spear",
  "WoodenBat_Barbed",
  "WoodenBat_Saw",
];

function loadModel(path: string) {
  const cached = modelCache.get(path);
  if (cached) return cached;
  const promise = new GLTFLoader().loadAsync(path).then((gltf) => ({
    scene: gltf.scene,
    animations: gltf.animations,
  }));
  modelCache.set(path, promise);
  return promise;
}

function chooseClip(style: AnimatedStyle, state: AnimationState) {
  if (state === "idle") return style === "walker" ? "Idle_Attack" : "Idle";
  if (state === "walk") return "Walk";
  if (state === "run") return style === "walker" ? "Run_Arms" : "Run";
  if (state === "attackRun") {
    if (style === "hero") return "Run_Slash";
    if (style === "runner") return "Run_Attack";
    return "Punch";
  }
  if (state === "attack") {
    if (style === "hero") return "Slash";
    if (style === "runner") return "Run_Attack";
    return "Punch";
  }
  if (state === "shoot") return style === "hero" ? "Idle_Gun" : "Punch";
  if (state === "hit") return "HitReact";
  return "Death";
}

function cloneMaterials(root: THREE.Object3D, style: AnimatedStyle) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const cloned = materials.map((material) => {
      const next = material.clone();
      if (next instanceof THREE.MeshStandardMaterial) {
        next.roughness = Math.max(next.roughness, 0.68);
        next.envMapIntensity = 0.68;
        if (style === "walker" || style === "heavy") {
          next.color.multiply(new THREE.Color(0x76806c));
          next.color.offsetHSL(0, -0.16, -0.08);
          next.roughness = 0.9;
          next.metalness *= 0.2;
          next.envMapIntensity = 0.36;
          next.emissive.setHex(0x180503);
          next.emissiveIntensity = 0.08;
        } else if (style === "runner") {
          next.color.multiply(new THREE.Color(0x80645d));
          next.color.offsetHSL(0, -0.14, -0.09);
          next.roughness = 0.88;
          next.metalness *= 0.2;
          next.envMapIntensity = 0.38;
          next.emissive.setHex(0x210604);
          next.emissiveIntensity = 0.1;
        }
      }
      return next;
    });
    object.material = Array.isArray(object.material) ? cloned : cloned[0];
  });
}

export async function createAnimatedCharacter(
  style: AnimatedStyle,
): Promise<AnimatedCharacter> {
  const modelPath = MODEL_PATHS[style];
  const loaded = await loadModel(modelPath);
  const model = cloneSkeleton(loaded.scene);
  cloneMaterials(model, style);

  if (style === "walker" || style === "runner" || style === "heavy") {
    const head = model.getObjectByName("Head");
    head?.scale.multiply(new THREE.Vector3(0.84, 0.92, 0.86));
  }

  const bounds = new THREE.Box3().setFromObject(model);
  const rawHeight = Math.max(0.01, bounds.max.y - bounds.min.y);
  const targetHeight =
    style === "hero"
      ? 2.02
      : style === "maya"
        ? 1.9
        : style === "runner"
          ? 1.93
          : style === "heavy"
            ? 2.18
            : 2;
  const scale = targetHeight / rawHeight;
  const bodyWidth =
    style === "heavy"
      ? 1.08
      : style === "walker" || style === "runner"
        ? 0.92
        : 1;
  model.scale.set(scale * bodyWidth, scale, scale * bodyWidth);
  model.rotation.y = Math.PI;

  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.y = -scaledBounds.min.y;

  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of loaded.animations) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(1);
    actions.set(clip.name, action);
  }

  const weaponNodes = WEAPON_NAMES.map((name) => model.getObjectByName(name)).filter(
    (object): object is THREE.Object3D => Boolean(object),
  );
  for (const weapon of weaponNodes) weapon.visible = false;

  const idleName = chooseClip(style, "idle");
  actions.get(idleName)?.play();

  return {
    root,
    model,
    mixer,
    actions,
    currentAction: idleName,
    style,
    height: targetHeight,
    weaponNodes,
  };
}

export async function createDetailedStaticModel(
  path: string,
  targetLongestDimension: number,
) {
  const loaded = await loadModel(path);
  const model = cloneSkeleton(loaded.scene);
  cloneMaterials(model, "hero");
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const longestDimension = Math.max(0.001, size.x, size.y, size.z);
  model.scale.setScalar(targetLongestDimension / longestDimension);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.y = -scaledBounds.min.y;
  const root = new THREE.Group();
  root.add(model);
  return root;
}

export function setAnimatedEquipment(
  character: AnimatedCharacter,
  inventory: { axe?: boolean; pistol?: boolean },
  activeWeapon?: "axe" | "pistol",
) {
  for (const weapon of character.weaponNodes) weapon.visible = false;
  const selectedName =
    activeWeapon === "pistol" && inventory.pistol
      ? "Pistol"
      : activeWeapon === "axe" && inventory.axe
        ? "Axe"
        : inventory.axe
          ? "Axe"
          : inventory.pistol
            ? "Pistol"
            : null;
  const selected = selectedName
    ? character.model.getObjectByName(selectedName)
    : null;
  if (selected) selected.visible = true;
}

export function updateAnimatedCharacter(
  character: AnimatedCharacter,
  delta: number,
  state: AnimationState,
) {
  const nextName = chooseClip(character.style, state);
  if (nextName !== character.currentAction) {
    const previous = character.actions.get(character.currentAction);
    const next = character.actions.get(nextName);
    if (next) {
      const oneShot =
        state === "attack" ||
        state === "attackRun" ||
        state === "hit" ||
        state === "death";
      next.reset();
      next.setEffectiveTimeScale(
        state === "attack" || state === "attackRun"
          ? character.style === "hero"
            ? 1.34
            : 1.12
          : state === "run"
            ? 1.08
            : 1,
      );
      if (oneShot) {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = false;
      }
      if (previous) next.crossFadeFrom(previous, state === "hit" ? 0.07 : 0.16, true);
      next.play();
      character.currentAction = nextName;
    }
  }
  character.mixer.update(delta);
}

export function setCharacterHitFlash(
  character: AnimatedCharacter,
  strength: number,
) {
  character.model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.emissive.setHex(0x8d0b05);
      material.emissiveIntensity = strength * 2.4;
    }
  });
}

export function disposeAnimatedCharacter(character: AnimatedCharacter) {
  character.mixer.stopAllAction();
  character.model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
}
