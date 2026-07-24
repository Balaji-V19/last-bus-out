import * as THREE from "three";
import { createEquipmentModel, type EquipmentKind } from "./scene";

export type CharacterStyle = "hero" | "maya" | "walker" | "runner";

export type CharacterRig = {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  equipment: Partial<Record<EquipmentKind, THREE.Group>>;
  phaseOffset: number;
  style: CharacterStyle;
};

type Palette = {
  skin: number;
  shirt: number;
  trousers: number;
  boots: number;
  hair: number;
  accent: number;
};

const PALETTES: Record<CharacterStyle, Palette> = {
  hero: {
    skin: 0xa96e50,
    shirt: 0x394840,
    trousers: 0x262e2a,
    boots: 0x171a18,
    hair: 0x201914,
    accent: 0x7c4e31,
  },
  maya: {
    skin: 0xb97a5c,
    shirt: 0x294b43,
    trousers: 0x252c2a,
    boots: 0x171a18,
    hair: 0x231711,
    accent: 0xd5d7c8,
  },
  walker: {
    skin: 0x778276,
    shirt: 0x4a5148,
    trousers: 0x343733,
    boots: 0x1b1d1a,
    hair: 0x2b2925,
    accent: 0x633a31,
  },
  runner: {
    skin: 0x8d6c5c,
    shirt: 0x5b3129,
    trousers: 0x292b29,
    boots: 0x151715,
    hair: 0x261c18,
    accent: 0x8a4033,
  },
};

function standard(color: number, roughness = 0.82, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function capsule(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function createLimb(
  parent: THREE.Group,
  material: THREE.Material,
  radius: number,
  upperLength: number,
  lowerLength: number,
  handMaterial: THREE.Material,
) {
  capsule(parent, radius, upperLength - radius * 2, material, [0, -upperLength / 2, 0]);
  const lower = new THREE.Group();
  lower.position.y = -upperLength;
  parent.add(lower);
  capsule(lower, radius * 0.86, lowerLength - radius * 1.7, material, [0, -lowerLength / 2, 0]);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.02, 12, 10), handMaterial);
  hand.scale.set(0.92, 1.2, 0.82);
  hand.position.y = -lowerLength;
  hand.castShadow = true;
  lower.add(hand);
  return lower;
}

function createLeg(
  parent: THREE.Group,
  trouser: THREE.Material,
  boot: THREE.Material,
  radius: number,
) {
  capsule(parent, radius, 0.38, trouser, [0, -0.27, 0], [1, 1.06, 1]);
  const lower = new THREE.Group();
  lower.position.y = -0.61;
  parent.add(lower);
  capsule(lower, radius * 0.86, 0.38, trouser, [0, -0.28, 0]);
  box(lower, [radius * 1.8, 0.24, radius * 2.65], [0, -0.62, -radius * 0.42], boot);
  return lower;
}

function addFace(head: THREE.Group, style: CharacterStyle, skin: THREE.Material) {
  const dark = standard(style === "walker" ? 0x181b19 : 0x241c18, 0.72);
  const eyeWhite = standard(style === "walker" ? 0xb9c4ad : 0xded9ca, 0.4);
  const iris = standard(style === "runner" ? 0x9f2d24 : 0x26342f, 0.35);
  for (const x of [-0.085, 0.085]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeWhite);
    eye.position.set(x, 0.06, -0.222);
    eye.scale.z = 0.4;
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 8), iris);
    pupil.position.set(x, 0.06, -0.245);
    pupil.scale.z = 0.35;
    head.add(pupil);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.11, 8), skin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.01, -0.235);
  head.add(nose);
  box(head, [0.12, 0.018, 0.018], [0, -0.12, -0.246], dark, [0.04, 0, style === "walker" ? 0.16 : 0]);
}

function addBackpack(rig: CharacterRig, accent: THREE.Material) {
  const backpack = new THREE.Group();
  backpack.name = "backpack";
  box(backpack, [0.52, 0.72, 0.24], [0, 0, 0], accent);
  box(backpack, [0.45, 0.24, 0.08], [0, -0.13, 0.16], standard(0x222a25, 0.9));
  const straps = standard(0x1f2522, 0.9);
  for (const x of [-0.19, 0.19]) {
    box(backpack, [0.055, 0.78, 0.045], [x, 0, -0.13], straps, [0, 0, x * 0.35]);
  }
  backpack.position.set(0, 1.47, 0.31);
  rig.body.add(backpack);
}

function addHeroEquipment(rig: CharacterRig) {
  const axe = createEquipmentModel("axe", 0.55);
  axe.rotation.set(0.12, 0, 0.38);
  axe.position.set(-0.28, 1.45, 0.48);
  rig.body.add(axe);
  rig.equipment.axe = axe;

  const radio = createEquipmentModel("radio", 0.32);
  radio.rotation.y = Math.PI;
  radio.position.set(0.42, 1.42, -0.04);
  rig.body.add(radio);
  rig.equipment.radio = radio;

  const torch = createEquipmentModel("torch", 0.38);
  torch.rotation.z = Math.PI / 2;
  torch.position.set(-0.34, 0.82, -0.03);
  rig.body.add(torch);
  rig.equipment.torch = torch;

  const pistol = createEquipmentModel("pistol", 0.44);
  pistol.rotation.set(0, Math.PI, 0.08);
  pistol.position.set(0.34, 0.62, 0.02);
  rig.body.add(pistol);
  rig.equipment.pistol = pistol;

  const medkit = createEquipmentModel("medkit", 0.34);
  medkit.rotation.y = Math.PI;
  medkit.position.set(0, 1.3, 0.49);
  rig.body.add(medkit);
  rig.equipment.medkit = medkit;
}

export function createCharacter(style: CharacterStyle, phaseOffset = 0): CharacterRig {
  const palette = PALETTES[style];
  const skin = standard(palette.skin, style === "walker" ? 0.98 : 0.78);
  const shirt = standard(palette.shirt, 0.94);
  const trousers = standard(palette.trousers, 0.96);
  const boots = standard(palette.boots, 0.76);
  const hair = standard(palette.hair, 0.98);
  const accent = standard(palette.accent, 0.9);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 1.31;
  body.add(torso);
  capsule(torso, 0.31, 0.48, shirt, [0, 0, 0], [style === "maya" ? 0.84 : 1, 1, 0.68]);
  box(torso, [0.56, 0.15, 0.28], [0, -0.42, 0], trousers);

  const neck = cylinder(body, 0.095, 0.2, [0, 1.83, 0], skin);
  neck.castShadow = true;

  const head = new THREE.Group();
  head.position.set(0, 2.04, 0);
  body.add(head);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skin);
  headMesh.scale.set(style === "runner" ? 0.92 : 1, 1.12, 0.94);
  headMesh.castShadow = true;
  head.add(headMesh);
  addFace(head, style, skin);

  if (style === "maya") {
    const ponytail = capsule(head, 0.105, 0.25, hair, [0.14, -0.05, 0.18], [0.8, 1.3, 0.8]);
    ponytail.rotation.z = -0.32;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
    hairCap.rotation.x = -0.08;
    hairCap.castShadow = true;
    head.add(hairCap);
  } else {
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.247, 14, 8, 0, Math.PI * 2, 0, Math.PI * (style === "hero" ? 0.46 : 0.58)),
      hair,
    );
    hairCap.rotation.x = style === "walker" ? 0.18 : 0;
    head.add(hairCap);
  }

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-0.39, 1.67, 0);
  rightArm.position.set(0.39, 1.67, 0);
  body.add(leftArm, rightArm);
  const leftForearm = createLimb(leftArm, shirt, 0.105, 0.48, 0.43, skin);
  const rightForearm = createLimb(rightArm, shirt, 0.105, 0.48, 0.43, skin);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.17, 0.91, 0);
  rightLeg.position.set(0.17, 0.91, 0);
  body.add(leftLeg, rightLeg);
  const leftShin = createLeg(leftLeg, trousers, boots, 0.13);
  const rightShin = createLeg(rightLeg, trousers, boots, 0.13);

  const belt = new THREE.Group();
  belt.position.set(0, 0.9, 0);
  body.add(belt);
  box(belt, [0.66, 0.11, 0.31], [0, 0, 0], standard(0x1f2421, 0.75));
  box(belt, [0.1, 0.1, 0.045], [0, 0, -0.18], standard(0x8d7746, 0.38, 0.68));

  const rig: CharacterRig = {
    root,
    body,
    torso,
    head,
    leftArm,
    rightArm,
    leftForearm,
    rightForearm,
    leftLeg,
    rightLeg,
    leftShin,
    rightShin,
    equipment: {},
    phaseOffset,
    style,
  };

  if (style === "hero") {
    addBackpack(rig, accent);
    addHeroEquipment(rig);
  } else if (style === "maya") {
    addBackpack(rig, accent);
    const medkit = createEquipmentModel("medkit", 0.3);
    medkit.position.set(0, 1.3, 0.46);
    medkit.rotation.y = Math.PI;
    body.add(medkit);
    rig.equipment.medkit = medkit;
    const crossMat = standard(0xd9ddcf, 0.74);
    box(torso, [0.08, 0.3, 0.025], [0, 0.03, -0.235], crossMat);
    box(torso, [0.26, 0.08, 0.025], [0, 0.03, -0.236], crossMat);
  } else {
    body.rotation.z = style === "walker" ? 0.08 : -0.045;
    torso.rotation.x = style === "runner" ? 0.34 : 0.18;
    leftArm.rotation.z = 0.18;
    rightArm.rotation.z = -0.15;
    const tear = standard(palette.accent, 1);
    box(torso, [0.2, 0.24, 0.04], [0.18, -0.12, -0.24], tear, [0, 0, 0.3]);
  }

  root.scale.setScalar(style === "runner" ? 0.92 : style === "maya" ? 0.91 : 1);
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return rig;
}

export function setEquipmentVisible(
  rig: CharacterRig,
  inventory: Partial<Record<EquipmentKind, boolean>>,
) {
  for (const [kind, object] of Object.entries(rig.equipment)) {
    object.visible = Boolean(inventory[kind as EquipmentKind]);
  }
}

export function animateCharacter(
  rig: CharacterRig,
  time: number,
  speed: number,
  running: boolean,
  attack: number,
  turnAmount = 0,
) {
  const active = speed > 0.08;
  const pace = running ? 11.2 : rig.style === "walker" ? 3.4 : 7.2;
  const phase = time * pace + rig.phaseOffset;
  const gait = active ? Math.sin(phase) : 0;
  const opposite = active ? Math.sin(phase + Math.PI) : 0;
  const stride =
    rig.style === "runner" ? 0.92 : running ? 0.82 : rig.style === "walker" ? 0.48 : 0.52;
  const armStride = rig.style === "walker" ? 0.24 : stride * 0.72;

  rig.leftLeg.rotation.x = gait * stride;
  rig.rightLeg.rotation.x = opposite * stride;
  rig.leftShin.rotation.x = active ? Math.max(0, -gait) * 0.72 : 0;
  rig.rightShin.rotation.x = active ? Math.max(0, -opposite) * 0.72 : 0;
  rig.leftArm.rotation.x = opposite * armStride + (rig.style === "walker" ? -0.52 : 0);
  rig.rightArm.rotation.x = gait * armStride + (rig.style === "walker" ? -0.42 : 0);
  rig.leftForearm.rotation.x = active ? -0.12 - Math.max(0, gait) * 0.42 : -0.08;
  rig.rightForearm.rotation.x = active ? -0.12 - Math.max(0, opposite) * 0.42 : -0.08;

  const bob = active ? Math.abs(Math.sin(phase * 2)) * (running ? 0.075 : 0.038) : Math.sin(time * 1.7) * 0.008;
  rig.body.position.y = bob;
  rig.body.rotation.z = THREE.MathUtils.lerp(rig.body.rotation.z, -turnAmount * 0.11, 0.16);
  rig.torso.rotation.y = active ? Math.sin(phase) * 0.055 : Math.sin(time * 0.8) * 0.012;
  rig.head.rotation.y = active ? -Math.sin(phase) * 0.025 : Math.sin(time * 0.38) * 0.06;

  if (rig.style === "walker") {
    rig.head.rotation.z = 0.16 + Math.sin(time * 1.1 + rig.phaseOffset) * 0.08;
    rig.torso.rotation.x = 0.2 + Math.abs(Math.sin(phase)) * 0.08;
  } else if (rig.style === "runner") {
    rig.torso.rotation.x = active ? 0.38 : 0.22;
  } else {
    rig.torso.rotation.x = running ? 0.12 : 0.02;
  }

  if (attack > 0 && rig.style === "hero") {
    const strike = Math.sin((1 - attack) * Math.PI);
    rig.rightArm.rotation.x = -1.7 + strike * 2.3;
    rig.rightArm.rotation.z = -0.48;
    rig.torso.rotation.y = strike * -0.46;
  } else {
    rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, 0, 0.18);
  }
}

export function disposeCharacter(rig: CharacterRig) {
  rig.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
