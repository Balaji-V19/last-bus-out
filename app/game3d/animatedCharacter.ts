import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

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

type CharacterRig = {
  pelvis: THREE.Group;
  torso: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftWrist: THREE.Group;
  rightWrist: THREE.Group;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightAnkle: THREE.Group;
};

export type AnimatedCharacter = {
  root: THREE.Group;
  model: THREE.Group;
  style: AnimatedStyle;
  height: number;
  weaponNodes: THREE.Object3D[];
  rig: CharacterRig;
  elapsed: number;
  stateTime: number;
  state: AnimationState;
  flashMaterials: THREE.MeshStandardMaterial[];
};

type CharacterMaterials = {
  skin: THREE.MeshStandardMaterial;
  skinDark: THREE.MeshStandardMaterial;
  uniform: THREE.MeshStandardMaterial;
  uniformSecondary: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial;
  webbing: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
  eyeDark: THREE.MeshStandardMaterial;
  blood: THREE.MeshStandardMaterial;
  wound: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  teeth: THREE.MeshStandardMaterial;
  fabricLight: THREE.MeshStandardMaterial;
};

const textureCache = new Map<string, THREE.CanvasTexture>();

function seededNoise(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function weatheredTexture(
  key: string,
  base: string,
  fleck: string,
  seed: number,
  blood = false,
) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const random = seededNoise(seed);
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 4300; index += 1) {
    const opacity = 0.018 + random() * 0.12;
    context.fillStyle = `${fleck}${Math.floor(opacity * 255)
      .toString(16)
      .padStart(2, "0")}`;
    const size = 0.35 + random() * 2.6;
    context.fillRect(random() * 256, random() * 256, size, size);
  }
  for (let index = 0; index < 24; index += 1) {
    context.strokeStyle = `rgba(19,14,11,${0.025 + random() * 0.11})`;
    context.lineWidth = 0.5 + random() * 2.4;
    context.beginPath();
    context.moveTo(random() * 256, random() * 256);
    context.lineTo(random() * 256, random() * 256);
    context.stroke();
  }
  if (blood) {
    for (let index = 0; index < 18; index += 1) {
      const x = random() * 256;
      const y = random() * 256;
      const radius = 2 + random() * 14;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(78,8,5,${0.18 + random() * 0.28})`);
      gradient.addColorStop(1, "rgba(78,8,5,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.8, 2.6);
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function standardMaterial(
  color: number,
  roughness: number,
  map?: THREE.Texture,
  metalness = 0,
  emissive = 0x000000,
  emissiveIntensity = 0,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    map,
    emissive,
    emissiveIntensity,
  });
  material.userData.baseEmissive = emissive;
  material.userData.baseEmissiveIntensity = emissiveIntensity;
  return material;
}

function createMaterials(style: AnimatedStyle): CharacterMaterials {
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const isMaya = style === "maya";
  const skinBase = infected
    ? style === "runner"
      ? "#776a5d"
      : style === "heavy"
        ? "#69705d"
        : "#707866"
    : isMaya
      ? "#8c5f46"
      : "#8a624a";
  const uniformBase = infected
    ? style === "runner"
      ? "#47342f"
      : style === "heavy"
        ? "#343b32"
        : "#3b4640"
    : isMaya
      ? "#354137"
      : "#202a29";
  const skinTexture = weatheredTexture(
    `skin-${style}`,
    skinBase,
    infected ? "#b4b69a" : "#d0a187",
    900 + style.length * 17,
    infected,
  );
  const uniformTexture = weatheredTexture(
    `uniform-${style}`,
    uniformBase,
    infected ? "#856157" : "#68736d",
    1200 + style.length * 31,
    infected,
  );
  const vestTexture = weatheredTexture(
    `vest-${style}`,
    isMaya ? "#4b5548" : infected ? "#3b332e" : "#722c27",
    infected ? "#76504b" : "#b06a55",
    1600 + style.length * 23,
    infected,
  );
  return {
    skin: standardMaterial(0xffffff, infected ? 0.96 : 0.82, skinTexture),
    skinDark: standardMaterial(infected ? 0x3e4639 : 0x694532, 0.92),
    uniform: standardMaterial(0xffffff, 0.94, uniformTexture),
    uniformSecondary: standardMaterial(
      infected ? 0x2e312d : isMaya ? 0x28342e : 0x151d1d,
      0.96,
    ),
    vest: standardMaterial(0xffffff, 0.9, vestTexture),
    webbing: standardMaterial(0x171b19, 0.92),
    rubber: standardMaterial(0x0d1110, 0.86),
    metal: standardMaterial(0x727b76, 0.36, undefined, 0.78),
    hair: standardMaterial(isMaya ? 0x1d1714 : infected ? 0x292a24 : 0x181817, 0.98),
    eye: standardMaterial(
      infected ? 0xb8c5a2 : 0xece8df,
      0.42,
      undefined,
      0,
      infected ? 0x52623d : 0x000000,
      infected ? 0.68 : 0,
    ),
    eyeDark: standardMaterial(infected ? 0xddd6ad : 0x2c251f, 0.38),
    blood: standardMaterial(0x5b0b08, 0.48, undefined, 0.02),
    wound: standardMaterial(0x2a0706, 0.72, undefined, 0.01),
    bone: standardMaterial(0xd1c5a6, 0.78),
    teeth: standardMaterial(infected ? 0xb4a889 : 0xe2d9c7, 0.78),
    fabricLight: standardMaterial(isMaya ? 0xd9d9c7 : 0xaaa99c, 0.92),
  };
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function capsule(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
) {
  return addMesh(
    parent,
    new THREE.CapsuleGeometry(radius, length, 8, 18),
    material,
    position,
    rotation,
    scale,
  );
}

function tapered(
  parent: THREE.Object3D,
  topRadius: number,
  bottomRadius: number,
  length: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  return addMesh(
    parent,
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 18, 4),
    material,
    position,
    rotation,
  );
}

function rounded(
  parent: THREE.Object3D,
  size: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  radius = 0.04,
  rotation: [number, number, number] = [0, 0, 0],
) {
  return addMesh(
    parent,
    new RoundedBoxGeometry(
      size[0],
      size[1],
      size[2],
      4,
      Math.min(radius, Math.min(...size) * 0.42),
    ),
    material,
    position,
    rotation,
  );
}

function joint(
  parent: THREE.Object3D,
  name: string,
  position: [number, number, number],
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function labelTexture(text: string, background: string, foreground: string) {
  const key = `label-${text}-${background}-${foreground}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d")!;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(230,225,207,.42)";
  context.lineWidth = 8;
  context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  context.fillStyle = foreground;
  context.font = "800 78px Arial Narrow, Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

function addLabel(
  parent: THREE.Object3D,
  text: string,
  position: [number, number, number],
  scale: [number, number],
  background = "#5d211e",
) {
  const material = new THREE.MeshStandardMaterial({
    map: labelTexture(text, background, "#d8d1bd"),
    roughness: 0.88,
    transparent: true,
  });
  const patch = addMesh(
    parent,
    new THREE.PlaneGeometry(scale[0], scale[1]),
    material,
    position,
  );
  patch.castShadow = false;
  return patch;
}

function addMedicalCross(
  parent: THREE.Object3D,
  material: THREE.Material,
  position: [number, number, number],
  scale = 1,
) {
  const cross = new THREE.Group();
  cross.position.set(...position);
  rounded(cross, [0.06 * scale, 0.24 * scale, 0.025], material, [0, 0, 0], 0.015);
  rounded(cross, [0.24 * scale, 0.06 * scale, 0.025], material, [0, 0, 0.002], 0.015);
  parent.add(cross);
  return cross;
}

function addStrap(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  material: THREE.Material,
  radius = 0.018,
) {
  const curve = new THREE.CatmullRomCurve3(points);
  return addMesh(
    parent,
    new THREE.TubeGeometry(curve, 18, radius, 7, false),
    material,
  );
}

function createAxe(materials: CharacterMaterials) {
  const axe = new THREE.Group();
  axe.name = "Axe";
  tapered(axe, 0.026, 0.034, 0.92, materials.webbing, [0, -0.37, 0], [0, 0, 0.06]);
  rounded(axe, [0.42, 0.16, 0.075], materials.metal, [-0.1, 0.08, 0], 0.025, [0, 0, -0.07]);
  const blade = addMesh(
    axe,
    new THREE.ConeGeometry(0.2, 0.32, 3),
    materials.metal,
    [-0.31, 0.07, 0],
    [0, 0, -Math.PI / 2],
    [0.38, 1, 0.35],
  );
  blade.rotation.y = Math.PI / 2;
  axe.position.set(0, -0.04, -0.02);
  axe.rotation.set(0.08, 0.08, -0.08);
  axe.visible = false;
  return axe;
}

function createPistol(materials: CharacterMaterials) {
  const pistol = new THREE.Group();
  pistol.name = "Pistol";
  rounded(pistol, [0.14, 0.18, 0.48], materials.metal, [0, -0.02, -0.2], 0.025);
  rounded(pistol, [0.13, 0.32, 0.16], materials.rubber, [0, -0.2, -0.02], 0.035, [-0.18, 0, 0]);
  addMesh(
    pistol,
    new THREE.TorusGeometry(0.065, 0.015, 7, 14, Math.PI * 1.4),
    materials.metal,
    [0, -0.14, -0.14],
    [0, Math.PI / 2, 0],
  );
  pistol.position.set(0, -0.08, -0.12);
  pistol.visible = false;
  return pistol;
}

function addHumanHead(
  headJoint: THREE.Group,
  jaw: THREE.Group,
  materials: CharacterMaterials,
  style: AnimatedStyle,
) {
  const isMaya = style === "maya";
  const infected = style === "walker" || style === "runner" || style === "heavy";
  capsule(
    headJoint,
    infected ? 0.142 : 0.15,
    infected ? 0.11 : 0.13,
    materials.skin,
    [0, 0.16, 0],
    [infected ? 0.9 : 0.94, 1.06, 0.91],
  );
  capsule(
    jaw,
    infected ? 0.09 : 0.105,
    infected ? 0.055 : 0.07,
    infected ? materials.skinDark : materials.skin,
    [0, -0.015, -0.025],
    [0.96, 0.88, 0.9],
  );
  const nose = addMesh(
    headJoint,
    new THREE.ConeGeometry(0.035, 0.1, 9),
    materials.skinDark,
    [0, 0.17, -0.155],
    [Math.PI / 2, 0, 0],
    [0.76, 1, 0.72],
  );
  nose.castShadow = false;
  for (const side of [-1, 1]) {
    capsule(
      headJoint,
      0.021,
      0.015,
      materials.eye,
      [side * 0.057, 0.207, -0.143],
      [1, 0.62, 0.5],
      [Math.PI / 2, 0, 0],
    ).castShadow = false;
    capsule(
      headJoint,
      infected ? 0.011 : 0.009,
      0.004,
      materials.eyeDark,
      [side * 0.057, 0.207, -0.156],
      [1, 0.72, 0.45],
      [Math.PI / 2, 0, 0],
    ).castShadow = false;
    capsule(
      headJoint,
      0.032,
      0.025,
      materials.skin,
      [side * 0.145, 0.16, 0],
      [0.45, 0.82, 0.34],
    );
  }

  if (infected) {
    rounded(jaw, [0.17, 0.035, 0.02], materials.wound, [0, -0.06, -0.103], 0.008);
    for (const side of [-1, 1]) {
      for (let tooth = 0; tooth < 3; tooth += 1) {
        addMesh(
          jaw,
          new THREE.ConeGeometry(0.009, 0.03, 7),
          materials.teeth,
          [side * (0.025 + tooth * 0.021), -0.048, -0.117],
          [Math.PI, 0, 0],
        );
      }
    }
    capsule(
      headJoint,
      0.045,
      0.04,
      materials.wound,
      [style === "runner" ? -0.09 : 0.08, 0.27, -0.115],
      [1.2, 0.55, 0.25],
      [0.6, 0.2, 0.1],
    );
    if (style !== "heavy") {
      for (let tuft = 0; tuft < 5; tuft += 1) {
        addMesh(
          headJoint,
          new THREE.ConeGeometry(0.035 + tuft * 0.003, 0.13, 7),
          materials.hair,
          [-0.09 + tuft * 0.045, 0.34 + (tuft % 2) * 0.025, 0.015],
          [0, 0, (tuft - 2) * 0.11],
        );
      }
    }
    return;
  }

  if (isMaya) {
    capsule(headJoint, 0.158, 0.08, materials.hair, [0, 0.27, 0.025], [1.02, 0.56, 1.02]);
    capsule(headJoint, 0.09, 0.18, materials.hair, [0, 0.18, 0.145], [0.72, 1, 0.72], [0.35, 0, 0]);
    const ponytail = new THREE.Group();
    ponytail.position.set(0, 0.24, 0.13);
    capsule(ponytail, 0.055, 0.28, materials.hair, [0, -0.14, 0.05], [0.85, 1, 0.85], [0.48, 0, 0]);
    headJoint.add(ponytail);
  } else {
    for (let tuft = 0; tuft < 9; tuft += 1) {
      const angle = ((tuft - 4) / 9) * Math.PI;
      addMesh(
        headJoint,
        new THREE.ConeGeometry(0.045, 0.13 + (tuft % 3) * 0.025, 7),
        materials.hair,
        [Math.sin(angle) * 0.12, 0.34 + Math.cos(angle) * 0.025, 0.025 + Math.cos(angle) * 0.08],
        [0.08, 0, -Math.sin(angle) * 0.5],
      );
    }
    capsule(headJoint, 0.118, 0.055, materials.hair, [0, 0.07, -0.075], [1.05, 0.58, 0.52]);
  }
}

function addArm(
  torso: THREE.Group,
  side: -1 | 1,
  materials: CharacterMaterials,
  style: AnimatedStyle,
  shoulderWidth: number,
  armScale: number,
) {
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const shoulder = joint(
    torso,
    side < 0 ? "LeftShoulder" : "RightShoulder",
    [side * shoulderWidth, 0.52, 0],
  );
  const upperLength = (style === "heavy" ? 0.42 : 0.39) * armScale;
  const forearmLength = (style === "runner" ? 0.43 : 0.38) * armScale;
  tapered(
    shoulder,
    (style === "heavy" ? 0.14 : 0.105) * armScale,
    (style === "heavy" ? 0.125 : 0.09) * armScale,
    upperLength,
    infected && ((style === "runner" && side === 1) || (style === "walker" && side === -1))
      ? materials.skin
      : materials.uniform,
    [0, -upperLength / 2, 0],
  );
  const elbow = joint(
    shoulder,
    side < 0 ? "LeftElbow" : "RightElbow",
    [0, -upperLength, 0],
  );
  capsule(
    elbow,
    0.085 * armScale,
    0.018,
    infected ? materials.skinDark : materials.uniform,
    [0, 0, 0],
  );
  tapered(
    elbow,
    (style === "heavy" ? 0.12 : 0.085) * armScale,
    (style === "heavy" ? 0.095 : 0.07) * armScale,
    forearmLength,
    infected && (style !== "heavy" || side === 1) ? materials.skin : materials.uniform,
    [0, -forearmLength / 2, 0],
  );
  const wrist = joint(
    elbow,
    side < 0 ? "LeftWrist" : "RightWrist",
    [0, -forearmLength, 0],
  );
  capsule(
    wrist,
    0.072 * armScale,
    0.09 * armScale,
    infected ? materials.skin : materials.rubber,
    [0, -0.07 * armScale, -0.01],
    [0.86, 1, 0.65],
  );

  if (infected) {
    capsule(
      shoulder,
      0.048,
      0.07,
      materials.wound,
      [side * 0.02, -upperLength * 0.42, -0.09],
      [1.3, 0.62, 0.24],
      [0.28, 0.2, side * 0.3],
    );
    for (let nail = 0; nail < 3; nail += 1) {
      addMesh(
        wrist,
        new THREE.ConeGeometry(0.009, 0.055, 6),
        materials.bone,
        [(nail - 1) * 0.03, -0.14, -0.025],
        [Math.PI, 0, 0],
      );
    }
  }
  return { shoulder, elbow, wrist };
}

function addLeg(
  pelvis: THREE.Group,
  side: -1 | 1,
  materials: CharacterMaterials,
  style: AnimatedStyle,
  hipWidth: number,
  legScale: number,
) {
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const hip = joint(
    pelvis,
    side < 0 ? "LeftHip" : "RightHip",
    [side * hipWidth, -0.06, 0],
  );
  const thighLength = (style === "heavy" ? 0.48 : 0.46) * legScale;
  const calfLength = (style === "runner" ? 0.48 : 0.43) * legScale;
  tapered(
    hip,
    (style === "heavy" ? 0.18 : 0.135) * legScale,
    (style === "heavy" ? 0.145 : 0.105) * legScale,
    thighLength,
    materials.uniform,
    [0, -thighLength / 2, 0],
  );
  const knee = joint(
    hip,
    side < 0 ? "LeftKnee" : "RightKnee",
    [0, -thighLength, 0],
  );
  capsule(
    knee,
    (style === "heavy" ? 0.13 : 0.095) * legScale,
    0.02,
    infected ? materials.skinDark : materials.uniformSecondary,
    [0, 0, 0],
  );
  tapered(
    knee,
    (style === "heavy" ? 0.14 : 0.105) * legScale,
    (style === "heavy" ? 0.1 : 0.075) * legScale,
    calfLength,
    materials.uniformSecondary,
    [0, -calfLength / 2, 0],
  );
  const ankle = joint(
    knee,
    side < 0 ? "LeftAnkle" : "RightAnkle",
    [0, -calfLength, 0],
  );
  rounded(
    ankle,
    [
      (style === "heavy" ? 0.28 : 0.22) * legScale,
      0.19 * legScale,
      (style === "heavy" ? 0.42 : 0.36) * legScale,
    ],
    materials.rubber,
    [0, -0.075 * legScale, -0.07 * legScale],
    0.055,
  );
  if (infected) {
    capsule(
      knee,
      0.045,
      0.08,
      materials.blood,
      [side * 0.05, -calfLength * 0.22, -0.1],
      [1.4, 0.75, 0.2],
      [0.35, 0, side * 0.2],
    );
    const tornCuff = addMesh(
      knee,
      new THREE.TorusGeometry(0.09 * legScale, 0.022, 7, 18),
      materials.uniform,
      [0, -0.045, 0],
      [Math.PI / 2, 0, 0],
      [1.15, 1, 1],
    );
    tornCuff.castShadow = true;
  }
  return { hip, knee, ankle };
}

function addSurvivorGear(
  torso: THREE.Group,
  pelvis: THREE.Group,
  materials: CharacterMaterials,
  style: "hero" | "maya",
) {
  const isMaya = style === "maya";
  capsule(
    torso,
    isMaya ? 0.235 : 0.27,
    0.34,
    materials.vest,
    [0, 0.31, -0.004],
    [isMaya ? 1.02 : 1.12, 1, 0.68],
  );
  const backpack = new THREE.Group();
  backpack.position.set(0, 0.3, 0.19);
  rounded(
    backpack,
    [isMaya ? 0.38 : 0.44, isMaya ? 0.49 : 0.56, 0.21],
    isMaya ? materials.vest : materials.uniformSecondary,
    [0, 0, 0.06],
    0.09,
  );
  for (const side of [-1, 1]) {
    rounded(
      backpack,
      [0.095, 0.28, 0.14],
      materials.webbing,
      [side * (isMaya ? 0.2 : 0.235), -0.04, 0.05],
      0.035,
    );
    addStrap(
      torso,
      [
        new THREE.Vector3(side * 0.2, 0.55, 0.03),
        new THREE.Vector3(side * 0.28, 0.3, -0.2),
        new THREE.Vector3(side * 0.18, 0.03, -0.12),
      ],
      materials.webbing,
      0.014,
    );
  }
  torso.add(backpack);
  addLabel(
    backpack,
    isMaya ? "PARAMEDIC" : "RESCUE",
    [0, 0.12, 0.173],
    [isMaya ? 0.31 : 0.34, 0.105],
    isMaya ? "#39443b" : "#65241f",
  );
  if (isMaya) {
    addMedicalCross(backpack, materials.fabricLight, [0, -0.075, 0.18], 0.7);
  }

  const belt = addMesh(
    pelvis,
    new THREE.TorusGeometry(isMaya ? 0.22 : 0.25, 0.027, 8, 24),
    materials.webbing,
    [0, 0.035, 0],
    [Math.PI / 2, 0, 0],
    [1.05, 0.72, 1],
  );
  belt.castShadow = true;
  for (const side of [-1, 1]) {
    rounded(
      pelvis,
      [0.14, 0.19, 0.11],
      side === 1 && isMaya ? materials.vest : materials.webbing,
      [side * (isMaya ? 0.25 : 0.28), -0.08, -0.12],
      0.04,
      [0, side * 0.1, 0],
    );
  }
  rounded(pelvis, [0.12, 0.17, 0.08], materials.webbing, [0, -0.07, 0.18], 0.035);
  if (isMaya) {
    const medicalBag = new THREE.Group();
    medicalBag.position.set(0.31, -0.17, 0.03);
    rounded(medicalBag, [0.34, 0.29, 0.17], materials.vest, [0, 0, 0], 0.055);
    addMedicalCross(medicalBag, materials.fabricLight, [0, 0, -0.09], 0.72);
    pelvis.add(medicalBag);
  } else {
    rounded(torso, [0.11, 0.27, 0.1], materials.webbing, [-0.3, 0.24, -0.13], 0.035);
    capsule(torso, 0.035, 0.18, materials.metal, [-0.3, 0.25, -0.2], [1, 1, 0.72]);
  }
}

function addInfectedDetails(
  torso: THREE.Group,
  chest: THREE.Group,
  pelvis: THREE.Group,
  materials: CharacterMaterials,
  style: "walker" | "runner" | "heavy",
) {
  capsule(
    torso,
    style === "heavy" ? 0.34 : 0.25,
    style === "heavy" ? 0.4 : 0.32,
    materials.vest,
    [0, 0.3, 0],
    [style === "heavy" ? 1.24 : 1.06, 1, 0.68],
  );
  const chestWound = capsule(
    chest,
    style === "heavy" ? 0.12 : 0.085,
    style === "heavy" ? 0.18 : 0.12,
    materials.wound,
    [style === "runner" ? -0.13 : 0.13, 0.07, -0.205],
    [1.1, 1, 0.2],
    [0.15, 0, style === "runner" ? -0.28 : 0.24],
  );
  chestWound.castShadow = false;
  if (style === "heavy") {
    for (let rib = 0; rib < 4; rib += 1) {
      const bone = addMesh(
        chest,
        new THREE.TorusGeometry(0.16 - rib * 0.012, 0.012, 7, 18, Math.PI * 1.1),
        materials.bone,
        [0.08, 0.18 - rib * 0.07, -0.247],
        [0, 0, Math.PI * 0.94],
        [1, 0.66, 0.6],
      );
      bone.castShadow = true;
    }
    capsule(torso, 0.07, 0.22, materials.blood, [-0.17, 0.27, -0.22], [1, 1, 0.18], [0.2, 0, -0.16]);
  } else {
    for (let tear = 0; tear < 4; tear += 1) {
      rounded(
        torso,
        [0.09 + tear * 0.018, 0.025, 0.03],
        tear % 2 === 0 ? materials.blood : materials.skinDark,
        [-0.11 + tear * 0.07, 0.13 + (tear % 2) * 0.08, -0.242],
        0.008,
        [0, 0, (tear - 2) * 0.13],
      );
    }
  }
  rounded(
    pelvis,
    [style === "heavy" ? 0.52 : 0.4, 0.13, 0.25],
    materials.webbing,
    [0, 0.01, 0],
    0.05,
  );
}

function createOriginalCharacter(style: AnimatedStyle): AnimatedCharacter {
  const materials = createMaterials(style);
  const model = new THREE.Group();
  model.name = `Original_${style}`;
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const isMaya = style === "maya";
  const height =
    style === "hero"
      ? 2.02
      : isMaya
        ? 1.9
        : style === "runner"
          ? 1.96
          : style === "heavy"
            ? 2.19
            : 2.03;
  const bodyScale = height / 2.02;
  const shoulderWidth =
    (style === "heavy" ? 0.39 : isMaya ? 0.275 : style === "runner" ? 0.29 : 0.325) *
    bodyScale;
  const hipWidth =
    (style === "heavy" ? 0.23 : isMaya ? 0.17 : 0.19) * bodyScale;
  const pelvis = joint(model, "Pelvis", [0, 1.01 * bodyScale, 0]);
  capsule(
    pelvis,
    style === "heavy" ? 0.25 : isMaya ? 0.19 : 0.21,
    style === "heavy" ? 0.18 : 0.14,
    materials.uniformSecondary,
    [0, 0.02, 0],
    [1.12, 0.82, 0.72],
  );
  const torso = joint(pelvis, "Torso", [0, 0.1 * bodyScale, 0]);
  const chest = joint(torso, "Chest", [0, 0.22 * bodyScale, 0]);
  capsule(
    torso,
    style === "heavy" ? 0.35 : isMaya ? 0.245 : 0.28,
    style === "heavy" ? 0.42 : 0.38,
    materials.uniform,
    [0, 0.3 * bodyScale, 0],
    [
      style === "heavy" ? 1.16 : isMaya ? 1 : 1.08,
      1,
      style === "heavy" ? 0.74 : 0.67,
    ],
  );
  const neck = joint(torso, "Neck", [0, 0.67 * bodyScale, 0]);
  capsule(
    neck,
    style === "heavy" ? 0.105 : 0.078,
    0.08,
    materials.skinDark,
    [0, 0.03, 0],
    [1, 1, 0.92],
  );
  const head = joint(neck, "Head", [0, 0.06 * bodyScale, 0]);
  const jaw = joint(head, "Jaw", [0, 0.07, -0.02]);
  addHumanHead(head, jaw, materials, style);

  const leftArm = addArm(torso, -1, materials, style, shoulderWidth, bodyScale);
  const rightArm = addArm(torso, 1, materials, style, shoulderWidth, bodyScale);
  const leftLeg = addLeg(pelvis, -1, materials, style, hipWidth, bodyScale);
  const rightLeg = addLeg(pelvis, 1, materials, style, hipWidth, bodyScale);

  if (style === "hero" || style === "maya") {
    addSurvivorGear(torso, pelvis, materials, style);
  } else {
    addInfectedDetails(torso, chest, pelvis, materials, style);
  }

  const axe = createAxe(materials);
  const pistol = createPistol(materials);
  rightArm.wrist.add(axe, pistol);
  const weaponNodes: THREE.Object3D[] = [axe, pistol];

  if (style === "hero") {
    rounded(
      leftArm.shoulder,
      [0.12, 0.14, 0.04],
      materials.vest,
      [-0.02, -0.12, -0.09],
      0.025,
    );
  }
  if (style === "maya") {
    addMedicalCross(
      leftArm.shoulder,
      materials.fabricLight,
      [0, -0.13, -0.095],
      0.38,
    );
  }

  if (infected) {
    torso.rotation.x = style === "runner" ? 0.26 : style === "heavy" ? 0.11 : 0.17;
    head.rotation.z = style === "walker" ? -0.12 : 0.06;
    jaw.rotation.x = style === "runner" ? 0.28 : 0.18;
    leftArm.shoulder.rotation.z = style === "walker" ? -0.24 : -0.08;
    rightArm.shoulder.rotation.z = style === "walker" ? 0.16 : 0.08;
  }

  const root = new THREE.Group();
  root.add(model);
  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (
        material instanceof THREE.MeshStandardMaterial &&
        material !== materials.eye
      ) {
        flashMaterials.push(material);
      }
    }
  });

  return {
    root,
    model,
    style,
    height,
    weaponNodes,
    rig: {
      pelvis,
      torso,
      chest,
      neck,
      head,
      jaw,
      leftShoulder: leftArm.shoulder,
      rightShoulder: rightArm.shoulder,
      leftElbow: leftArm.elbow,
      rightElbow: rightArm.elbow,
      leftWrist: leftArm.wrist,
      rightWrist: rightArm.wrist,
      leftHip: leftLeg.hip,
      rightHip: rightLeg.hip,
      leftKnee: leftLeg.knee,
      rightKnee: rightLeg.knee,
      leftAnkle: leftLeg.ankle,
      rightAnkle: rightLeg.ankle,
    },
    elapsed: Math.random() * 5,
    stateTime: 0,
    state: "idle",
    flashMaterials,
  };
}

export async function createAnimatedCharacter(
  style: AnimatedStyle,
): Promise<AnimatedCharacter> {
  return createOriginalCharacter(style);
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
  if (selectedName) {
    const selected = character.model.getObjectByName(selectedName);
    if (selected) selected.visible = true;
  }
}

function damp(current: number, target: number, delta: number, speed = 12) {
  return THREE.MathUtils.lerp(
    current,
    target,
    1 - Math.exp(-delta * speed),
  );
}

function rotateTo(
  object: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  delta: number,
  speed = 12,
) {
  object.rotation.x = damp(object.rotation.x, x, delta, speed);
  object.rotation.y = damp(object.rotation.y, y, delta, speed);
  object.rotation.z = damp(object.rotation.z, z, delta, speed);
}

function movementPose(
  character: AnimatedCharacter,
  delta: number,
  running: boolean,
  attacking: boolean,
) {
  const { rig, style } = character;
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const speed = running ? (style === "heavy" ? 6.2 : 10.6) : infected ? 5.2 : 6.8;
  const stride = running
    ? style === "heavy"
      ? 0.58
      : 0.82
    : infected
      ? style === "runner"
        ? 0.62
        : 0.48
      : 0.52;
  const gait = Math.sin(character.elapsed * speed);
  const opposite = Math.sin(character.elapsed * speed + Math.PI);
  const liftLeft = Math.max(0, Math.sin(character.elapsed * speed - 0.25));
  const liftRight = Math.max(0, Math.sin(character.elapsed * speed + Math.PI - 0.25));
  const hunch = infected
    ? style === "runner"
      ? 0.34
      : style === "heavy"
        ? 0.15
        : 0.22
    : running
      ? 0.12
      : 0.035;

  rotateTo(rig.pelvis, 0, gait * 0.055, -gait * 0.035, delta);
  rotateTo(rig.torso, hunch, -gait * 0.075, gait * 0.025, delta);
  rotateTo(
    rig.head,
    infected ? -hunch * 0.42 + Math.sin(character.elapsed * 2.1) * 0.035 : -hunch * 0.58,
    infected ? Math.sin(character.elapsed * 1.37) * 0.1 : gait * 0.025,
    infected && style === "walker" ? -0.12 + Math.sin(character.elapsed * 3.3) * 0.035 : 0,
    delta,
    9,
  );
  rotateTo(rig.leftHip, gait * stride, 0, 0.025, delta);
  rotateTo(rig.rightHip, opposite * stride, 0, -0.025, delta);
  rotateTo(rig.leftKnee, liftLeft * (running ? 0.95 : 0.58), 0, 0, delta);
  rotateTo(rig.rightKnee, liftRight * (running ? 0.95 : 0.58), 0, 0, delta);
  rotateTo(rig.leftAnkle, -gait * 0.18, 0, 0, delta);
  rotateTo(rig.rightAnkle, -opposite * 0.18, 0, 0, delta);

  if (!attacking) {
    const armStride = infected
      ? style === "walker"
        ? 0.22
        : stride * 0.66
      : stride * 0.76;
    const zombieReach = infected && style === "walker" ? -0.68 : 0;
    rotateTo(
      rig.leftShoulder,
      opposite * armStride + zombieReach,
      0,
      infected ? -0.16 : -0.055,
      delta,
    );
    rotateTo(
      rig.rightShoulder,
      gait * armStride + zombieReach,
      0,
      infected ? 0.12 : 0.055,
      delta,
    );
    rotateTo(rig.leftElbow, infected ? -0.28 : Math.max(0, gait) * -0.25, 0, 0, delta);
    rotateTo(rig.rightElbow, infected ? -0.2 : Math.max(0, opposite) * -0.25, 0, 0, delta);
  }
  character.model.position.y = damp(
    character.model.position.y,
    Math.abs(Math.sin(character.elapsed * speed)) * (running ? 0.035 : 0.018),
    delta,
    16,
  );
}

function idlePose(character: AnimatedCharacter, delta: number) {
  const { rig, style } = character;
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const breath = Math.sin(character.elapsed * (infected ? 2.2 : 1.45));
  const twitch =
    infected && Math.sin(character.elapsed * 5.7 + style.length) > 0.82
      ? Math.sin(character.elapsed * 23) * 0.08
      : 0;
  const hunch =
    style === "runner" ? 0.3 : style === "walker" ? 0.19 : style === "heavy" ? 0.13 : 0;
  rotateTo(rig.pelvis, 0, 0, breath * 0.012, delta, 7);
  rotateTo(rig.torso, hunch + breath * 0.012, 0, breath * 0.009, delta, 7);
  rotateTo(
    rig.head,
    infected ? -hunch * 0.38 + twitch : 0,
    infected ? Math.sin(character.elapsed * 0.83) * 0.12 : 0,
    style === "walker" ? -0.12 + twitch : twitch,
    delta,
    infected ? 8 : 6,
  );
  rotateTo(rig.leftHip, 0, 0, 0.01, delta);
  rotateTo(rig.rightHip, 0, 0, -0.01, delta);
  rotateTo(rig.leftKnee, 0.04, 0, 0, delta);
  rotateTo(rig.rightKnee, 0.03, 0, 0, delta);
  rotateTo(
    rig.leftShoulder,
    infected ? -0.48 + breath * 0.08 : breath * 0.025,
    0,
    infected ? -0.18 : -0.045,
    delta,
  );
  rotateTo(
    rig.rightShoulder,
    infected ? -0.42 - breath * 0.06 : -breath * 0.025,
    0,
    infected ? 0.14 : 0.045,
    delta,
  );
  rotateTo(rig.leftElbow, infected ? -0.34 : -0.07, 0, 0, delta);
  rotateTo(rig.rightElbow, infected ? -0.27 : -0.07, 0, 0, delta);
  character.model.position.y = damp(
    character.model.position.y,
    Math.max(0, breath) * 0.006,
    delta,
    7,
  );
}

function attackPose(character: AnimatedCharacter, delta: number) {
  const { rig, style } = character;
  const infected = style === "walker" || style === "runner" || style === "heavy";
  const duration = infected ? (style === "heavy" ? 0.78 : 0.58) : 0.62;
  const phase = THREE.MathUtils.clamp(character.stateTime / duration, 0, 1);
  const strike = Math.sin(phase * Math.PI);
  const follow = Math.sin(Math.min(1, phase * 1.3) * Math.PI);

  if (!infected) {
    rotateTo(rig.torso, 0.08, -0.58 + phase * 1.1, -0.16 * strike, delta, 18);
    rotateTo(rig.rightShoulder, -1.72 + phase * 2.8, -0.22, 0.62 - phase * 1.1, delta, 21);
    rotateTo(rig.rightElbow, -0.72 + phase * 0.46, 0, -0.18, delta, 20);
    rotateTo(rig.leftShoulder, -0.84 + phase * 0.62, 0.18, -0.42, delta, 18);
    rotateTo(rig.leftElbow, -0.9, 0, 0.12, delta, 18);
    rotateTo(rig.head, -0.08, 0.28 - phase * 0.48, 0, delta, 14);
    rotateTo(rig.leftHip, -follow * 0.18, 0, 0, delta);
    rotateTo(rig.rightHip, follow * 0.18, 0, 0, delta);
    return;
  }

  if (style === "heavy") {
    rotateTo(rig.torso, 0.18 + strike * 0.35, 0, 0, delta, 15);
    rotateTo(rig.leftShoulder, -1.42 + phase * 2.2, 0, -0.22, delta, 17);
    rotateTo(rig.rightShoulder, -1.42 + phase * 2.2, 0, 0.22, delta, 17);
    rotateTo(rig.leftElbow, -0.48, 0, 0, delta);
    rotateTo(rig.rightElbow, -0.48, 0, 0, delta);
  } else {
    rotateTo(rig.torso, 0.32 - strike * 0.16, phase * 0.25, 0, delta, 17);
    rotateTo(rig.leftShoulder, -0.78 - strike * 0.9, 0, -0.16, delta, 18);
    rotateTo(rig.rightShoulder, -0.82 - strike * 0.95, 0, 0.16, delta, 18);
    rotateTo(rig.leftElbow, -0.18 - strike * 0.34, 0, 0, delta);
    rotateTo(rig.rightElbow, -0.2 - strike * 0.3, 0, 0, delta);
  }
  rotateTo(rig.head, -0.06, Math.sin(phase * Math.PI) * 0.18, 0, delta, 16);
  character.rig.jaw.rotation.x = damp(
    character.rig.jaw.rotation.x,
    0.22 + strike * 0.28,
    delta,
    18,
  );
}

function shootPose(character: AnimatedCharacter, delta: number) {
  const { rig } = character;
  const recoil = Math.max(0, Math.sin(character.stateTime * 22)) *
    Math.exp(-character.stateTime * 5);
  rotateTo(rig.torso, 0.03, -0.12, 0, delta, 18);
  rotateTo(rig.rightShoulder, -1.46 + recoil * 0.16, -0.08, 0.12, delta, 20);
  rotateTo(rig.rightElbow, -0.22, 0, 0, delta, 20);
  rotateTo(rig.leftShoulder, -1.21, 0.28, -0.32, delta, 20);
  rotateTo(rig.leftElbow, -0.86, 0, 0.22, delta, 20);
  rotateTo(rig.head, -0.04, -0.06, 0, delta, 16);
}

function hitPose(character: AnimatedCharacter, delta: number) {
  const { rig } = character;
  const phase = THREE.MathUtils.clamp(character.stateTime / 0.38, 0, 1);
  const impact = Math.sin(phase * Math.PI);
  rotateTo(rig.torso, -0.18 * impact, 0.22 * impact, 0.2 * impact, delta, 24);
  rotateTo(rig.head, 0.22 * impact, -0.18 * impact, -0.14 * impact, delta, 24);
  rotateTo(rig.leftShoulder, 0.5 * impact, 0, -0.34, delta, 22);
  rotateTo(rig.rightShoulder, -0.42 * impact, 0, 0.28, delta, 22);
}

function deathPose(character: AnimatedCharacter, delta: number) {
  const { rig, style } = character;
  const phase = THREE.MathUtils.clamp(character.stateTime / 1.25, 0, 1);
  const eased = 1 - Math.pow(1 - phase, 3);
  const side = style === "runner" ? -1 : 1;
  rotateTo(rig.torso, 0.42 * eased, 0.18 * side, 0.55 * side * eased, delta, 10);
  rotateTo(rig.head, -0.18 * eased, 0, 0.35 * side * eased, delta, 9);
  rotateTo(rig.leftShoulder, 0.72 * eased, 0, -0.62, delta, 9);
  rotateTo(rig.rightShoulder, -0.6 * eased, 0, 0.66, delta, 9);
  rotateTo(rig.leftHip, -0.52 * eased, 0, -0.26, delta, 9);
  rotateTo(rig.rightHip, 0.38 * eased, 0, 0.22, delta, 9);
  rotateTo(rig.leftKnee, 0.92 * eased, 0, 0, delta, 9);
  rotateTo(rig.rightKnee, 0.7 * eased, 0, 0, delta, 9);
  character.model.rotation.z = damp(
    character.model.rotation.z,
    side * 1.44 * eased,
    delta,
    7,
  );
  character.model.position.y = damp(
    character.model.position.y,
    -0.72 * eased,
    delta,
    8,
  );
}

export function updateAnimatedCharacter(
  character: AnimatedCharacter,
  delta: number,
  state: AnimationState,
) {
  character.elapsed += delta;
  if (character.state !== state) {
    character.state = state;
    character.stateTime = 0;
  } else {
    character.stateTime += delta;
  }
  if (state !== "death") {
    character.model.rotation.z = damp(character.model.rotation.z, 0, delta, 14);
  }
  if (state === "walk") {
    movementPose(character, delta, false, false);
  } else if (state === "run") {
    movementPose(character, delta, true, false);
  } else if (state === "attackRun") {
    movementPose(character, delta, true, true);
    attackPose(character, delta);
  } else if (state === "attack") {
    attackPose(character, delta);
  } else if (state === "shoot") {
    shootPose(character, delta);
  } else if (state === "hit") {
    hitPose(character, delta);
  } else if (state === "death") {
    deathPose(character, delta);
  } else {
    idlePose(character, delta);
  }
}

export function setCharacterHitFlash(
  character: AnimatedCharacter,
  strength: number,
) {
  const normalized = THREE.MathUtils.clamp(strength * 2.5, 0, 1);
  for (const material of character.flashMaterials) {
    const baseEmissive = Number(material.userData.baseEmissive ?? 0);
    const baseIntensity = Number(material.userData.baseEmissiveIntensity ?? 0);
    material.emissive.setHex(
      normalized > 0 ? 0x8d0b05 : baseEmissive,
    );
    material.emissiveIntensity =
      normalized > 0 ? normalized * 2.2 : baseIntensity;
  }
}

export function disposeAnimatedCharacter(character: AnimatedCharacter) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  character.model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
