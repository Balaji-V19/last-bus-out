import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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

type CharacterRig = {
  pelvis: THREE.Object3D;
  torso: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  leftShoulder: THREE.Object3D;
  rightShoulder: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  leftWrist: THREE.Object3D;
  rightWrist: THREE.Object3D;
  leftHip: THREE.Object3D;
  rightHip: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  leftAnkle: THREE.Object3D;
  rightAnkle: THREE.Object3D;
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
  detailNodes: THREE.Object3D[];
  detailsVisible: boolean;
  shadowNodes?: THREE.Mesh[];
  assetAnimation?: {
    mixer: THREE.AnimationMixer;
    actions: Record<AnimationState, THREE.AnimationAction>;
    activeAction: THREE.AnimationAction;
    accumulator: number;
    gripBones: THREE.Object3D[];
    thumbBones: THREE.Object3D[];
    nativeClips: boolean;
  };
  sharedGeometry?: boolean;
  equippedWeapon?: "axe" | "pistol" | null;
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
  texture.anisotropy = 2;
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
  const parameters: THREE.MeshStandardMaterialParameters = {
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  };
  if (map) parameters.map = map;
  const material = new THREE.MeshStandardMaterial(parameters);
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
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

type AnatomicalRing = {
  y: number;
  width: number;
  depth: number;
  offsetZ?: number;
};

function anatomicalGeometry(
  rings: AnatomicalRing[],
  radialSegments = 14,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lastRing = Math.max(1, rings.length - 1);

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * ring.width,
        ring.y,
        (ring.offsetZ ?? 0) + Math.sin(angle) * ring.depth,
      );
      uvs.push(segment / radialSegments, ringIndex / lastRing);
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const nextSegment = (segment + 1) % radialSegments;
      const lower = ringIndex * radialSegments + segment;
      const lowerNext = ringIndex * radialSegments + nextSegment;
      const upper = (ringIndex + 1) * radialSegments + segment;
      const upperNext = (ringIndex + 1) * radialSegments + nextSegment;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, rings[0].y, rings[0].offsetZ ?? 0);
  uvs.push(0.5, 0);
  const topCenter = positions.length / 3;
  const topRing = rings[rings.length - 1];
  positions.push(0, topRing.y, topRing.offsetZ ?? 0);
  uvs.push(0.5, 1);

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const nextSegment = (segment + 1) % radialSegments;
    indices.push(bottomCenter, nextSegment, segment);
    const topOffset = (rings.length - 1) * radialSegments;
    indices.push(topCenter, topOffset + segment, topOffset + nextSegment);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function anatomical(
  parent: THREE.Object3D,
  rings: AnatomicalRing[],
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  radialSegments = 14,
) {
  return addMesh(
    parent,
    anatomicalGeometry(rings, radialSegments),
    material,
    position,
    rotation,
  );
}

function ellipsoid(
  parent: THREE.Object3D,
  radii: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  widthSegments = 14,
  heightSegments = 9,
) {
  return addMesh(
    parent,
    new THREE.SphereGeometry(1, widthSegments, heightSegments),
    material,
    position,
    rotation,
    radii,
  );
}

function characterDetail<T extends THREE.Object3D>(object: T) {
  object.userData.characterDetail = true;
  if (object instanceof THREE.Mesh) {
    object.castShadow = false;
    object.receiveShadow = false;
  }
  return object;
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
    new THREE.CapsuleGeometry(radius, length, 6, 12),
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
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 14, 2),
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
      3,
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
  // The group origin is the lower-hand grip socket. Keeping all geometry
  // forward of that socket prevents the axe head from pivoting through the
  // wrist during native attack clips.
  tapered(axe, 0.021, 0.029, 0.62, materials.webbing, [0, 0.17, 0], [0, 0, 0.045]);
  rounded(axe, [0.12, 0.08, 0.055], materials.metal, [0.025, 0.48, 0], 0.015, [0, 0, -0.035]);
  const blade = addMesh(
    axe,
    new THREE.ConeGeometry(0.17, 0.27, 3),
    materials.metal,
    [-0.19, 0.475, 0],
    [0, 0, -Math.PI / 2],
    [0.42, 1, 0.24],
  );
  blade.rotation.y = Math.PI / 2;
  axe.position.set(0, 0.06, 0);
  axe.rotation.set(Math.PI / 2, 0.06, -0.04);
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
  const headWidth =
    style === "heavy" ? 0.152 : isMaya ? 0.128 : infected ? 0.137 : 0.142;
  const headDepth =
    style === "heavy" ? 0.128 : isMaya ? 0.112 : infected ? 0.119 : 0.122;
  const faceOffset = infected ? -0.008 : -0.014;

  anatomical(
    headJoint,
    [
      { y: 0.005, width: headWidth * 0.78, depth: headDepth * 0.82, offsetZ: faceOffset },
      { y: 0.055, width: headWidth * 0.98, depth: headDepth, offsetZ: faceOffset },
      { y: 0.135, width: headWidth, depth: headDepth * 1.03 },
      { y: 0.205, width: headWidth * 0.9, depth: headDepth * 0.96, offsetZ: 0.008 },
      { y: 0.245, width: headWidth * 0.58, depth: headDepth * 0.64, offsetZ: 0.012 },
    ],
    materials.skin,
    [0, 0, 0],
    [infected ? 0.025 : 0, 0, 0],
    18,
  );

  anatomical(
    jaw,
    [
      { y: -0.075, width: headWidth * 0.42, depth: headDepth * 0.56, offsetZ: -0.018 },
      { y: -0.045, width: headWidth * 0.7, depth: headDepth * 0.76, offsetZ: -0.02 },
      { y: 0.01, width: headWidth * 0.82, depth: headDepth * 0.88, offsetZ: -0.015 },
      { y: 0.045, width: headWidth * 0.9, depth: headDepth * 0.92, offsetZ: -0.006 },
    ],
    infected ? materials.skinDark : materials.skin,
    [0, 0, 0],
    [infected ? 0.04 : 0, 0, 0],
    16,
  );

  for (const side of [-1, 1]) {
    ellipsoid(
      headJoint,
      [0.027, 0.043, 0.018],
      materials.skinDark,
      [side * headWidth * 0.98, 0.105, 0.004],
      [0, 0, side * 0.08],
      10,
      7,
    );
  }

  characterDetail(
    capsule(
      headJoint,
      0.018,
      0.065,
      materials.skinDark,
      [0, 0.103, -headDepth * 0.9],
      [0.78, 1, 0.7],
      [0, 0, 0],
    ),
  );
  characterDetail(
    ellipsoid(
      headJoint,
      [0.029, 0.023, 0.034],
      materials.skin,
      [0, 0.064, -headDepth * 1.08],
      [0.08, 0, 0],
      12,
      8,
    ),
  );
  for (const side of [-1, 1]) {
    characterDetail(
      ellipsoid(
        headJoint,
        [0.007, 0.004, 0.004],
        materials.skinDark,
        [side * 0.011, 0.056, -headDepth * 1.25],
        [0, 0, 0],
        8,
        5,
      ),
    );
  }

  for (const side of [-1, 1]) {
    characterDetail(
      ellipsoid(
        headJoint,
        [0.026, 0.013, 0.008],
        materials.eye,
        [side * headWidth * 0.39, 0.12, -headDepth * 0.96],
        [0.03, 0, side * 0.02],
        12,
        7,
      ),
    );
    characterDetail(
      ellipsoid(
        headJoint,
        [infected ? 0.009 : 0.007, infected ? 0.009 : 0.007, 0.005],
        materials.eyeDark,
        [side * headWidth * 0.39, 0.119, -headDepth * 1.025],
        [0, 0, 0],
        9,
        6,
      ),
    );
    characterDetail(
      capsule(
        headJoint,
        0.007,
        0.044,
        infected ? materials.wound : materials.hair,
        [side * headWidth * 0.39, 0.155, -headDepth * 0.93],
        [1, 0.75, 0.55],
        [0, 0, Math.PI / 2 + side * 0.1],
      ),
    );
  }

  const upperLip = characterDetail(
    capsule(
      jaw,
      0.007,
      0.055,
      infected ? materials.wound : materials.skinDark,
      [0, -0.005, -headDepth * 0.9],
      [1, 0.72, 0.55],
      [0, 0, Math.PI / 2],
    ),
  );
  upperLip.rotation.x = 0.08;
  characterDetail(
    capsule(
      jaw,
      0.006,
      0.047,
      infected ? materials.blood : materials.skinDark,
      [0, -0.021, -headDepth * 0.895],
      [1, 0.62, 0.5],
      [0, 0, Math.PI / 2],
    ),
  );

  if (infected) {
    characterDetail(
      rounded(
        jaw,
        [headWidth * 1.18, 0.026, 0.018],
        materials.wound,
        [0, -0.032, -headDepth * 0.91],
        0.007,
      ),
    );
    for (const side of [-1, 1]) {
      for (let tooth = 0; tooth < 2; tooth += 1) {
        characterDetail(
          addMesh(
            jaw,
            new THREE.ConeGeometry(0.006, 0.021, 6),
            materials.teeth,
            [side * (0.018 + tooth * 0.018), -0.038, -headDepth * 1.02],
            [Math.PI, 0, 0],
          ),
        );
      }
    }
    characterDetail(
      ellipsoid(
        headJoint,
        [0.046, 0.026, 0.012],
        materials.wound,
        [style === "runner" ? -0.072 : 0.064, 0.165, -headDepth * 0.96],
        [0.2, 0.18, style === "runner" ? -0.18 : 0.16],
        10,
        6,
      ),
    );
    if (style !== "heavy") {
      anatomical(
        headJoint,
        [
          { y: 0.145, width: headWidth * 0.94, depth: headDepth * 0.93, offsetZ: 0.013 },
          { y: 0.212, width: headWidth * 0.84, depth: headDepth * 0.88, offsetZ: 0.018 },
          { y: 0.252, width: headWidth * 0.48, depth: headDepth * 0.5, offsetZ: 0.018 },
        ],
        materials.hair,
        [0, 0, 0],
        [0, 0, style === "runner" ? -0.06 : 0.04],
        14,
      );
    }
    return;
  }

  anatomical(
    headJoint,
    [
      { y: 0.13, width: headWidth * 0.99, depth: headDepth * 0.98, offsetZ: 0.012 },
      { y: 0.205, width: headWidth * 0.91, depth: headDepth * 0.93, offsetZ: 0.017 },
      { y: 0.254, width: headWidth * 0.48, depth: headDepth * 0.52, offsetZ: 0.018 },
    ],
    materials.hair,
    [0, 0, 0],
    [0, 0, 0],
    16,
  );

  if (isMaya) {
    const ponytail = new THREE.Group();
    ponytail.position.set(0, 0.17, headDepth * 0.82);
    ellipsoid(
      ponytail,
      [0.058, 0.075, 0.052],
      materials.hair,
      [0, 0, 0.018],
      [0.25, 0, 0],
      12,
      8,
    );
    anatomical(
      ponytail,
      [
        { y: -0.23, width: 0.025, depth: 0.028, offsetZ: 0.045 },
        { y: -0.14, width: 0.045, depth: 0.043, offsetZ: 0.035 },
        { y: -0.035, width: 0.055, depth: 0.05, offsetZ: 0.02 },
        { y: 0.025, width: 0.035, depth: 0.035 },
      ],
      materials.hair,
      [0, 0, 0],
      [0.28, 0, 0],
      10,
    );
    headJoint.add(ponytail);
  } else {
    characterDetail(
      anatomical(
        jaw,
        [
          { y: -0.071, width: headWidth * 0.4, depth: headDepth * 0.57, offsetZ: -0.022 },
          { y: -0.042, width: headWidth * 0.67, depth: headDepth * 0.79, offsetZ: -0.026 },
          { y: 0.008, width: headWidth * 0.8, depth: headDepth * 0.89, offsetZ: -0.02 },
        ],
        materials.hair,
        [0, 0.001, 0.006],
        [0, 0, 0],
        14,
      ),
    );
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
    [side * shoulderWidth, 0.47 * armScale, 0],
  );
  const upperLength = (style === "heavy" ? 0.37 : 0.34) * armScale;
  const forearmLength = (style === "runner" ? 0.34 : 0.32) * armScale;
  const armMaterial =
    infected &&
    ((style === "runner" && side === 1) ||
      (style === "walker" && side === -1))
      ? materials.skin
      : materials.uniform;
  anatomical(
    shoulder,
    [
      {
        y: 0,
        width: (style === "heavy" ? 0.145 : 0.105) * armScale,
        depth: (style === "heavy" ? 0.13 : 0.095) * armScale,
      },
      {
        y: -upperLength * 0.38,
        width: (style === "heavy" ? 0.13 : 0.095) * armScale,
        depth: (style === "heavy" ? 0.12 : 0.085) * armScale,
      },
      {
        y: -upperLength,
        width: (style === "heavy" ? 0.095 : 0.072) * armScale,
        depth: (style === "heavy" ? 0.09 : 0.068) * armScale,
      },
    ],
    armMaterial,
  );
  const elbow = joint(
    shoulder,
    side < 0 ? "LeftElbow" : "RightElbow",
    [0, -upperLength, 0],
  );
  ellipsoid(
    elbow,
    [
      (style === "heavy" ? 0.098 : 0.074) * armScale,
      (style === "heavy" ? 0.086 : 0.066) * armScale,
      (style === "heavy" ? 0.09 : 0.07) * armScale,
    ],
    infected ? materials.skinDark : materials.uniform,
    [0, 0, 0],
    [0, 0, 0],
    12,
    8,
  );
  anatomical(
    elbow,
    [
      {
        y: -0.006,
        width: (style === "heavy" ? 0.096 : 0.073) * armScale,
        depth: (style === "heavy" ? 0.092 : 0.069) * armScale,
      },
      {
        y: -forearmLength * 0.44,
        width: (style === "heavy" ? 0.112 : 0.083) * armScale,
        depth: (style === "heavy" ? 0.102 : 0.075) * armScale,
      },
      {
        y: -forearmLength,
        width: (style === "heavy" ? 0.07 : 0.052) * armScale,
        depth: (style === "heavy" ? 0.066 : 0.05) * armScale,
      },
    ],
    infected && (style !== "heavy" || side === 1) ? materials.skin : materials.uniform,
  );
  const wrist = joint(
    elbow,
    side < 0 ? "LeftWrist" : "RightWrist",
    [0, -forearmLength, 0],
  );

  const handMaterial = infected ? materials.skin : materials.rubber;
  anatomical(
    wrist,
    [
      {
        y: 0,
        width: 0.053 * armScale,
        depth: 0.045 * armScale,
      },
      {
        y: -0.07 * armScale,
        width: 0.071 * armScale,
        depth: 0.038 * armScale,
        offsetZ: -0.012,
      },
      {
        y: -0.14 * armScale,
        width: 0.052 * armScale,
        depth: 0.031 * armScale,
        offsetZ: -0.017,
      },
    ],
    handMaterial,
    [0, 0, 0],
    [0.08, 0, 0],
    12,
  );
  characterDetail(
    capsule(
      wrist,
      0.018 * armScale,
      0.065 * armScale,
      handMaterial,
      [side * 0.065 * armScale, -0.075 * armScale, -0.004],
      [0.88, 1, 0.8],
      [0.15, 0, side * 0.62],
    ),
  );

  if (infected) {
    characterDetail(
      ellipsoid(
        shoulder,
        [0.052, 0.075, 0.014],
        materials.wound,
        [side * 0.02, -upperLength * 0.42, -0.087],
        [0.28, 0.2, side * 0.3],
        10,
        6,
      ),
    );
    for (let finger = 0; finger < 4; finger += 1) {
      const x = (finger - 1.5) * 0.025 * armScale;
      characterDetail(
        capsule(
          wrist,
          0.011 * armScale,
          (0.065 - Math.abs(finger - 1.5) * 0.006) * armScale,
          materials.skinDark,
          [x, -0.165 * armScale, -0.02],
          [0.88, 1, 0.76],
          [0.08 + finger * 0.018, 0, (finger - 1.5) * -0.03],
        ),
      );
      characterDetail(
        addMesh(
          wrist,
          new THREE.ConeGeometry(0.006, 0.026, 5),
          materials.bone,
          [x, -0.222 * armScale, -0.021],
          [Math.PI, 0, 0],
        ),
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
    [side * hipWidth, -0.055 * legScale, 0],
  );
  const thighLength = (style === "heavy" ? 0.45 : 0.43) * legScale;
  const calfLength = (style === "runner" ? 0.45 : 0.42) * legScale;
  anatomical(
    hip,
    [
      {
        y: 0,
        width: (style === "heavy" ? 0.175 : 0.132) * legScale,
        depth: (style === "heavy" ? 0.16 : 0.125) * legScale,
      },
      {
        y: -thighLength * 0.48,
        width: (style === "heavy" ? 0.155 : 0.12) * legScale,
        depth: (style === "heavy" ? 0.145 : 0.112) * legScale,
        offsetZ: 0.006,
      },
      {
        y: -thighLength,
        width: (style === "heavy" ? 0.105 : 0.082) * legScale,
        depth: (style === "heavy" ? 0.1 : 0.079) * legScale,
      },
    ],
    materials.uniform,
  );
  const knee = joint(
    hip,
    side < 0 ? "LeftKnee" : "RightKnee",
    [0, -thighLength, 0],
  );
  ellipsoid(
    knee,
    [
      (style === "heavy" ? 0.115 : 0.087) * legScale,
      (style === "heavy" ? 0.105 : 0.079) * legScale,
      (style === "heavy" ? 0.105 : 0.083) * legScale,
    ],
    infected ? materials.skinDark : materials.uniformSecondary,
    [0, 0, 0],
    [0, 0, 0],
    12,
    8,
  );
  anatomical(
    knee,
    [
      {
        y: -0.008,
        width: (style === "heavy" ? 0.108 : 0.083) * legScale,
        depth: (style === "heavy" ? 0.102 : 0.08) * legScale,
      },
      {
        y: -calfLength * 0.42,
        width: (style === "heavy" ? 0.135 : 0.101) * legScale,
        depth: (style === "heavy" ? 0.125 : 0.09) * legScale,
        offsetZ: 0.012,
      },
      {
        y: -calfLength,
        width: (style === "heavy" ? 0.082 : 0.061) * legScale,
        depth: (style === "heavy" ? 0.078 : 0.059) * legScale,
      },
    ],
    materials.uniformSecondary,
  );
  const ankle = joint(
    knee,
    side < 0 ? "LeftAnkle" : "RightAnkle",
    [0, -calfLength, 0],
  );
  ellipsoid(
    ankle,
    [
      (style === "heavy" ? 0.135 : 0.105) * legScale,
      (style === "heavy" ? 0.105 : 0.082) * legScale,
      (style === "heavy" ? 0.235 : 0.205) * legScale,
    ],
    materials.rubber,
    [0, -0.062 * legScale, -0.105 * legScale],
    [-0.08, 0, 0],
    14,
    8,
  );
  rounded(
    ankle,
    [
      (style === "heavy" ? 0.245 : 0.19) * legScale,
      0.035 * legScale,
      (style === "heavy" ? 0.42 : 0.355) * legScale,
    ],
    materials.webbing,
    [0, -0.127 * legScale, -0.095 * legScale],
    0.016,
  );
  if (infected) {
    characterDetail(
      ellipsoid(
        knee,
        [0.052, 0.075, 0.015],
        materials.blood,
        [side * 0.045, -calfLength * 0.22, -0.083],
        [0.35, 0, side * 0.2],
        10,
        6,
      ),
    );
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
  anatomical(
    torso,
    [
      {
        y: 0.12,
        width: isMaya ? 0.205 : 0.235,
        depth: isMaya ? 0.135 : 0.15,
        offsetZ: -0.004,
      },
      {
        y: 0.3,
        width: isMaya ? 0.235 : 0.275,
        depth: isMaya ? 0.15 : 0.17,
        offsetZ: -0.009,
      },
      {
        y: 0.49,
        width: isMaya ? 0.247 : 0.29,
        depth: isMaya ? 0.145 : 0.165,
        offsetZ: -0.004,
      },
      {
        y: 0.535,
        width: isMaya ? 0.19 : 0.22,
        depth: isMaya ? 0.12 : 0.135,
      },
    ],
    materials.vest,
    [0, 0, 0],
    [0, 0, 0],
    14,
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
  anatomical(
    torso,
    [
      {
        y: 0.11,
        width: style === "heavy" ? 0.31 : 0.205,
        depth: style === "heavy" ? 0.2 : 0.135,
      },
      {
        y: 0.3,
        width: style === "heavy" ? 0.375 : 0.255,
        depth: style === "heavy" ? 0.225 : 0.155,
        offsetZ: -0.01,
      },
      {
        y: 0.5,
        width: style === "heavy" ? 0.39 : 0.28,
        depth: style === "heavy" ? 0.21 : 0.15,
      },
      {
        y: 0.54,
        width: style === "heavy" ? 0.28 : 0.19,
        depth: style === "heavy" ? 0.16 : 0.115,
      },
    ],
    materials.vest,
    [0, 0, 0],
    [0, 0, 0],
    14,
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
      ? 1.86
      : isMaya
        ? 1.73
        : style === "runner"
          ? 1.82
          : style === "heavy"
            ? 2.02
            : 1.84;
  const bodyScale = height / 1.86;
  const shoulderWidth =
    (style === "heavy" ? 0.395 : isMaya ? 0.278 : style === "runner" ? 0.305 : 0.34) *
    bodyScale;
  const hipWidth =
    (style === "heavy" ? 0.235 : isMaya ? 0.18 : 0.195) * bodyScale;
  const pelvis = joint(model, "Pelvis", [0, 0.94 * bodyScale, 0]);
  anatomical(
    pelvis,
    [
      {
        y: -0.11 * bodyScale,
        width: (style === "heavy" ? 0.21 : isMaya ? 0.165 : 0.18) * bodyScale,
        depth: (style === "heavy" ? 0.15 : 0.125) * bodyScale,
      },
      {
        y: -0.015 * bodyScale,
        width: (style === "heavy" ? 0.265 : isMaya ? 0.21 : 0.225) * bodyScale,
        depth: (style === "heavy" ? 0.18 : 0.145) * bodyScale,
      },
      {
        y: 0.12 * bodyScale,
        width: (style === "heavy" ? 0.235 : isMaya ? 0.19 : 0.205) * bodyScale,
        depth: (style === "heavy" ? 0.17 : 0.135) * bodyScale,
      },
    ],
    materials.uniformSecondary,
    [0, 0, 0],
    [0, 0, 0],
    14,
  );
  const torso = joint(pelvis, "Torso", [0, 0.065 * bodyScale, 0]);
  const chest = joint(torso, "Chest", [0, 0.27 * bodyScale, 0]);
  anatomical(
    torso,
    [
      {
        y: 0.035 * bodyScale,
        width: (style === "heavy" ? 0.24 : isMaya ? 0.175 : 0.2) * bodyScale,
        depth: (style === "heavy" ? 0.17 : 0.125) * bodyScale,
      },
      {
        y: 0.18 * bodyScale,
        width: (style === "heavy" ? 0.285 : isMaya ? 0.205 : 0.235) * bodyScale,
        depth: (style === "heavy" ? 0.195 : isMaya ? 0.142 : 0.155) * bodyScale,
        offsetZ: -0.004,
      },
      {
        y: 0.39 * bodyScale,
        width: (style === "heavy" ? 0.365 : isMaya ? 0.255 : 0.305) * bodyScale,
        depth: (style === "heavy" ? 0.22 : isMaya ? 0.16 : 0.185) * bodyScale,
        offsetZ: -0.01,
      },
      {
        y: 0.51 * bodyScale,
        width: (style === "heavy" ? 0.39 : isMaya ? 0.278 : 0.335) * bodyScale,
        depth: (style === "heavy" ? 0.21 : isMaya ? 0.15 : 0.175) * bodyScale,
      },
      {
        y: 0.56 * bodyScale,
        width: (style === "heavy" ? 0.27 : isMaya ? 0.18 : 0.21) * bodyScale,
        depth: (style === "heavy" ? 0.16 : 0.115) * bodyScale,
      },
    ],
    materials.uniform,
    [0, 0, 0],
    [0, 0, 0],
    16,
  );
  const neck = joint(torso, "Neck", [0, 0.565 * bodyScale, 0]);
  anatomical(
    neck,
    [
      {
        y: -0.015 * bodyScale,
        width: (style === "heavy" ? 0.115 : 0.075) * bodyScale,
        depth: (style === "heavy" ? 0.1 : 0.067) * bodyScale,
      },
      {
        y: 0.105 * bodyScale,
        width: (style === "heavy" ? 0.105 : 0.069) * bodyScale,
        depth: (style === "heavy" ? 0.095 : 0.064) * bodyScale,
      },
    ],
    materials.skinDark,
    [0, 0, 0],
    [0.05, 0, 0],
    12,
  );
  const head = joint(neck, "Head", [0, 0.095 * bodyScale, 0]);
  const jaw = joint(head, "Jaw", [0, 0, 0]);
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
  const flashMaterialSet = new Set<THREE.MeshStandardMaterial>();
  const detailNodes: THREE.Object3D[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.receiveShadow = false;
    if (object.userData.characterDetail) {
      object.castShadow = false;
      detailNodes.push(object);
    }
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (
        material instanceof THREE.MeshStandardMaterial &&
        material !== materials.eye
      ) {
        flashMaterialSet.add(material);
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
    flashMaterials: [...flashMaterialSet],
    detailNodes,
    detailsVisible: true,
  };
}

const licensedCharacterLoader = new GLTFLoader();
const characterAssetRevision = "smooth-finger-rig-20260725";
type LicensedModelSource = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};
const licensedModelCache = new Map<string, Promise<LicensedModelSource>>();
const compatibleClipCache = new Map<string, THREE.AnimationClip>();
let licensedAnimationCache: Promise<THREE.AnimationClip[]> | null = null;

function localAssetUrl(path: string) {
  return new URL(path, document.baseURI).toString();
}

function loadLicensedModel(name: "hero" | "maya" | "infected") {
  const cached = licensedModelCache.get(name);
  if (cached) return cached;
  const loading = licensedCharacterLoader
    .loadAsync(
      `${localAssetUrl(`models/characters/${name}.glb`)}?v=${characterAssetRevision}`,
    )
    .then((gltf) => ({
      scene: gltf.scene,
      animations: gltf.animations,
    }));
  licensedModelCache.set(name, loading);
  return loading;
}

function loadLicensedAnimations() {
  licensedAnimationCache ??= Promise.all([
    licensedCharacterLoader.loadAsync(
      localAssetUrl("models/characters/human-animations.glb"),
    ),
    licensedCharacterLoader.loadAsync(
      localAssetUrl("models/characters/human-addon-animations.glb"),
    ),
  ]).then(([base, addon]) => [...base.animations, ...addon.animations]);
  return licensedAnimationCache;
}

function compatibleClip(
  modelName: string,
  clip: THREE.AnimationClip,
  model: THREE.Object3D,
) {
  const cacheKey = `${modelName}:${clip.name}`;
  const cached = compatibleClipCache.get(cacheKey);
  if (cached) return cached;
  const nodeNames = new Set<string>();
  model.traverse((object) => {
    if (object.name) nodeNames.add(object.name);
  });
  const tracks = clip.tracks.filter((track) => {
    const propertySeparator = track.name.lastIndexOf(".");
    const nodeName =
      propertySeparator >= 0
        ? track.name.slice(0, propertySeparator)
        : track.name;
    return nodeNames.has(nodeName);
  });
  const compatible = new THREE.AnimationClip(
    clip.name,
    clip.duration,
    tracks,
    clip.blendMode,
  );
  compatibleClipCache.set(cacheKey, compatible);
  return compatible;
}

function clipNamesForStyle(
  style: AnimatedStyle,
): Record<AnimationState, string> {
  if (style === "hero") {
    return {
      idle: "Idle_Subtle",
      walk: "Walk",
      run: "Jog",
      attack: "Sword_Regular_A",
      attackRun: "Sword_Regular_B",
      shoot: "Pistol_Shoot",
      hit: "Hit_Chest",
      death: "Death_D",
    };
  }
  if (style === "maya") {
    return {
      idle: "Idle_Subtle",
      walk: "Walk_Female",
      run: "Run_Female",
      attack: "Fighting Right Jab",
      attackRun: "Fighting Left Jab",
      shoot: "Pistol_Shoot",
      hit: "Hit_Chest",
      death: "Death_B",
    };
  }
  if (style === "runner") {
    return {
      idle: "Zombie_Idle_Crouch",
      walk: "Zombie_Walk",
      run: "Zombie_Walk_2",
      attack: "Zombie_Scratch",
      attackRun: "Zombie Yell",
      shoot: "Zombie Yell",
      hit: "Hit_Chest",
      death: "Death_A",
    };
  }
  if (style === "heavy") {
    return {
      idle: "Tired Hunched",
      walk: "Zombie_Walk_2",
      run: "Zombie_Walk_2",
      attack: "Attack_Ground_Pound",
      attackRun: "Zombie_Scratch",
      shoot: "Zombie Yell",
      hit: "Hit_Knockback",
      death: "Death_C",
    };
  }
  return {
    idle: "Zombie_Idle",
    walk: "Zombie_Walk_2",
    run: "Zombie_Walk",
    attack: "Zombie_Scratch",
    attackRun: "Zombie Yell",
    shoot: "Zombie Yell",
    hit: "Hit_Chest",
    death: "Death_B",
  };
}

function nativeClipNames(): Record<AnimationState, string> {
  return {
    idle: "Native_Idle",
    walk: "Native_Walk",
    run: "Native_Run",
    attack: "Native_Attack",
    attackRun: "Native_AttackRun",
    shoot: "Native_Shoot",
    hit: "Native_Hit",
    death: "Native_Death",
  };
}

function assetRig(model: THREE.Object3D): CharacterRig {
  const node = (...names: string[]) => {
    for (const name of names) {
      const match = model.getObjectByName(name);
      if (match) return match;
    }
    return model;
  };
  return {
    pelvis: node("pelvis"),
    torso: node("spine_01", "pelvis"),
    chest: node("spine_03", "spine_02"),
    neck: node("neck_01", "spine_03"),
    head: node("head"),
    jaw: node("jaw", "head"),
    leftShoulder: node("upperarm_l", "clavicle_l"),
    rightShoulder: node("upperarm_r", "clavicle_r"),
    leftElbow: node("lowerarm_l"),
    rightElbow: node("lowerarm_r"),
    leftWrist: node("hand_l"),
    rightWrist: node("hand_r"),
    leftHip: node("thigh_l"),
    rightHip: node("thigh_r"),
    leftKnee: node("calf_l"),
    rightKnee: node("calf_r"),
    leftAnkle: node("foot_l"),
    rightAnkle: node("foot_r"),
  };
}

async function createLicensedCharacter(
  style: AnimatedStyle,
): Promise<AnimatedCharacter> {
  const modelName =
    style === "hero" ? "hero" : style === "maya" ? "maya" : "infected";
  const sourceModel = await loadLicensedModel(modelName);
  const hasNativeClips = sourceModel.animations.some(
    (clip) => clip.name === "Native_Idle",
  );
  const clips = hasNativeClips
    ? sourceModel.animations
    : await loadLicensedAnimations();
  const assetScene = cloneSkeleton(sourceModel.scene) as THREE.Group;
  assetScene.name = `Realistic_${style}`;

  const height =
    style === "hero"
      ? 1.86
      : style === "maya"
        ? 1.76
        : style === "runner"
          ? 1.82
          : style === "heavy"
            ? 2.02
            : 1.84;
  const initialBounds = new THREE.Box3().setFromObject(assetScene);
  const naturalHeight = Math.max(
    initialBounds.getSize(new THREE.Vector3()).y,
    0.01,
  );
  assetScene.scale.setScalar(height / naturalHeight);
  const scaledBounds = new THREE.Box3().setFromObject(assetScene);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  assetScene.position.set(-center.x, -scaledBounds.min.y, -center.z);
  assetScene.rotation.y = Math.PI;

  if (style === "runner") {
    assetScene.scale.x *= 0.94;
    assetScene.scale.z *= 0.94;
  } else if (style === "heavy") {
    assetScene.scale.x *= 1.14;
    assetScene.scale.z *= 1.1;
  }

  const flashMaterialSet = new Set<THREE.MeshStandardMaterial>();
  const shadowNodes: THREE.Mesh[] = [];
  assetScene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = true;
    shadowNodes.push(object);
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const clonedMaterials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        material.userData.baseEmissive = material.emissive.getHex();
        material.userData.baseEmissiveIntensity = material.emissiveIntensity;
        if (!material.name.toLowerCase().includes("eye")) {
          flashMaterialSet.add(material);
        }
      }
      return material;
    });
    object.material = Array.isArray(object.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });

  const rig = assetRig(assetScene);
  const weaponNodes: THREE.Object3D[] = [];
  if (style === "hero" || style === "maya") {
    const equipmentMaterials = createMaterials(style);
    const axe = createAxe(equipmentMaterials);
    const pistol = createPistol(equipmentMaterials);
    axe.scale.setScalar(0.7);
    axe.position.set(
      0.006,
      style === "hero" ? 0.006 : 0.004,
      0,
    );
    axe.rotation.set(Math.PI / 2, 0.06, -0.04);
    pistol.scale.setScalar(0.72);
    pistol.position.set(0.025, 0.045, -0.06);
    pistol.rotation.set(-0.08, Math.PI / 2, -0.06);
    rig.rightWrist.add(axe, pistol);
    weaponNodes.push(axe, pistol);
  }

  const mixer = new THREE.AnimationMixer(assetScene);
  const names = hasNativeClips ? nativeClipNames() : clipNamesForStyle(style);
  const actions = {} as Record<AnimationState, THREE.AnimationAction>;
  for (const state of Object.keys(names) as AnimationState[]) {
    const clip =
      THREE.AnimationClip.findByName(clips, names[state]) ??
      THREE.AnimationClip.findByName(clips, "Idle_A") ??
      clips[0];
    if (!clip) throw new Error("The licensed animation library is empty.");
    const action = mixer.clipAction(
      compatibleClip(modelName, clip, assetScene),
      assetScene,
    );
    const isOneShot =
      state === "attack" ||
      state === "attackRun" ||
      state === "shoot" ||
      state === "hit" ||
      state === "death";
    action.setLoop(isOneShot ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = isOneShot;
    actions[state] = action;
  }
  actions.idle.play();
  const gripBones: THREE.Object3D[] = [];
  const thumbBones: THREE.Object3D[] = [];
  assetScene.traverse((object) => {
    if (/^(index|middle|ring|pinky)_0[12]_r$/.test(object.name)) {
      gripBones.push(object);
    } else if (/^thumb_0[12]_r$/.test(object.name)) {
      thumbBones.push(object);
    }
  });

  const root = new THREE.Group();
  root.add(assetScene);
  return {
    root,
    model: assetScene,
    style,
    height,
    weaponNodes,
    rig,
    elapsed: Math.random() * 5,
    stateTime: 0,
    state: "idle",
    flashMaterials: [...flashMaterialSet],
    detailNodes: [],
    detailsVisible: true,
    shadowNodes,
    assetAnimation: {
      mixer,
      actions,
      activeAction: actions.idle,
      accumulator: 0,
      gripBones,
      thumbBones,
      nativeClips: hasNativeClips,
    },
    sharedGeometry: true,
    equippedWeapon: null,
  };
}

export async function createAnimatedCharacter(
  style: AnimatedStyle,
): Promise<AnimatedCharacter> {
  try {
    return await createLicensedCharacter(style);
  } catch (error) {
    console.warn(
      `Realistic ${style} character could not be loaded; using the local procedural fallback.`,
      error,
    );
    return createOriginalCharacter(style);
  }
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
  character.equippedWeapon =
    selectedName === "Axe"
      ? "axe"
      : selectedName === "Pistol"
        ? "pistol"
        : null;
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
    rig.chest,
    running ? -0.035 : 0,
    gait * (infected ? 0.055 : 0.105),
    -gait * 0.018,
    delta,
    10,
  );
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
  rotateTo(
    rig.leftKnee,
    0.04 + liftLeft * (running ? 1.02 : 0.62),
    0,
    0,
    delta,
  );
  rotateTo(
    rig.rightKnee,
    0.04 + liftRight * (running ? 1.02 : 0.62),
    0,
    0,
    delta,
  );
  rotateTo(
    rig.leftAnkle,
    -gait * (running ? 0.28 : 0.2) - liftLeft * 0.12,
    0,
    0,
    delta,
  );
  rotateTo(
    rig.rightAnkle,
    -opposite * (running ? 0.28 : 0.2) - liftRight * 0.12,
    0,
    0,
    delta,
  );

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
    rotateTo(
      rig.leftElbow,
      infected ? -0.36 : -0.08 - Math.max(0, gait) * 0.3,
      0,
      0,
      delta,
    );
    rotateTo(
      rig.rightElbow,
      infected ? -0.28 : -0.08 - Math.max(0, opposite) * 0.3,
      0,
      0,
      delta,
    );
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
  rotateTo(rig.chest, breath * 0.012, 0, -breath * 0.006, delta, 6);
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
    const swing = phase * phase * (3 - 2 * phase);
    rotateTo(rig.pelvis, 0, 0.22 - swing * 0.38, 0, delta, 16);
    rotateTo(rig.torso, 0.1 - strike * 0.08, -0.72 + swing * 1.36, -0.18 * strike, delta, 19);
    rotateTo(rig.chest, -0.05, -0.18 + swing * 0.34, -0.11 * strike, delta, 19);
    rotateTo(rig.rightShoulder, -2.08 + swing * 3.25, -0.26, 0.66 - swing * 1.18, delta, 23);
    rotateTo(rig.rightElbow, -0.78 + swing * 0.34, 0, -0.16, delta, 22);
    rotateTo(rig.leftShoulder, -1.66 + swing * 2.55, 0.22, -0.48 + swing * 0.72, delta, 21);
    rotateTo(rig.leftElbow, -1.02 + swing * 0.3, 0, 0.14, delta, 21);
    rotateTo(rig.head, -0.07, 0.32 - swing * 0.58, 0, delta, 15);
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
    rotateTo(rig.torso, 0.38 - strike * 0.26, phase * 0.22, 0, delta, 18);
    rotateTo(rig.chest, -strike * 0.12, phase * 0.1, 0, delta, 18);
    rotateTo(rig.leftShoulder, -0.72 - strike * 1.12, 0.12, -0.2, delta, 20);
    rotateTo(rig.rightShoulder, -0.78 - strike * 1.18, -0.12, 0.2, delta, 20);
    rotateTo(rig.leftElbow, -0.52 + strike * 0.34, 0, 0, delta, 20);
    rotateTo(rig.rightElbow, -0.5 + strike * 0.3, 0, 0, delta, 20);
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
  rotateTo(rig.chest, -0.025, -0.08, 0, delta, 18);
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
  rotateTo(rig.chest, -0.12 * impact, -0.16 * impact, 0.14 * impact, delta, 24);
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
  rotateTo(rig.chest, 0.2 * eased, -0.12 * side, 0.2 * side * eased, delta, 9);
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

function applyAssetSecondaryPose(
  character: AnimatedCharacter,
  state: AnimationState,
) {
  const animation = character.assetAnimation;
  if (!animation) return;
  const infected =
    character.style === "walker" ||
    character.style === "runner" ||
    character.style === "heavy";
  if (infected) {
    const pace =
      character.style === "runner"
        ? 4.1
        : character.style === "heavy"
          ? 1.35
          : 2.05;
    const lurch = Math.sin(character.elapsed * pace + character.elapsed * 0.17);
    const twitch = Math.sin(character.elapsed * 7.7 + character.style.length);
    character.rig.head.rotateZ(lurch * (character.style === "heavy" ? 0.035 : 0.065));
    character.rig.head.rotateY(twitch > 0.82 ? twitch * 0.045 : 0);
    character.rig.chest.rotateZ(
      lurch * (state === "walk" || state === "run" ? 0.045 : 0.018),
    );
    if (state === "walk" || state === "run") {
      character.rig.torso.rotateX(
        character.style === "runner" ? 0.08 : character.style === "walker" ? 0.045 : 0.025,
      );
    }
    return;
  }

  const grippingAxe = character.equippedWeapon === "axe";
  const nativeClips = animation.nativeClips;
  const nativeAttackGrip =
    nativeClips && (state === "attack" || state === "attackRun");
  const fingerCurl = grippingAxe
    ? nativeClips
      ? nativeAttackGrip
        ? 0
        : -0.75
      : 0.22
    : nativeClips
      ? 0
      : 0.055;
  for (const bone of animation.gripBones) {
    if (nativeClips) bone.rotateZ(fingerCurl);
    else bone.rotateX(fingerCurl);
  }
  for (const bone of animation.thumbBones) {
    const nativeThumbOffset = nativeAttackGrip ? 0 : 1;
    bone.rotateY(grippingAxe ? -0.22 * nativeThumbOffset : 0);
    bone.rotateZ(grippingAxe ? -0.42 * nativeThumbOffset : 0);
  }
}

export function updateAnimatedCharacter(
  character: AnimatedCharacter,
  delta: number,
  state: AnimationState,
  locomotionSpeed?: number,
) {
  character.elapsed += delta;
  const stateChanged = character.state !== state;
  if (stateChanged) {
    character.state = state;
    character.stateTime = 0;
  } else {
    character.stateTime += delta;
  }
  if (character.assetAnimation) {
    const animation = character.assetAnimation;
    if (stateChanged) {
      const nextAction = animation.actions[state];
      const previousAction = animation.activeAction;
      nextAction.enabled = true;
      nextAction.reset();
      nextAction.setEffectiveWeight(1);
      const infected =
        character.style === "walker" ||
        character.style === "runner" ||
        character.style === "heavy";
      const clipDuration = Math.max(nextAction.getClip().duration, 0.01);
      const targetOneShotDuration =
        state === "attack" || state === "attackRun"
          ? infected
            ? character.style === "heavy"
              ? 0.94
              : 0.7
            : 0.54
          : state === "shoot"
            ? 0.3
            : state === "hit"
              ? 0.38
              : state === "death"
                ? 1.52
                : null;
      const speed =
        targetOneShotDuration !== null
          ? clipDuration / targetOneShotDuration
          : character.style === "runner" && state === "run"
            ? 2.05
            : character.style === "heavy" && (state === "walk" || state === "run")
              ? 0.78
              : character.style === "walker" && state === "walk"
                ? 1.18
                : state === "run"
                  ? 1.25
                  : state === "walk"
                    ? 1.25
                    : 1;
      nextAction.setEffectiveTimeScale(speed);
      if (previousAction !== nextAction) {
        const fadeDuration =
          state === "death"
            ? 0.08
            : state === "attack" || state === "attackRun"
              ? 0.07
              : 0.16;
        previousAction.fadeOut(fadeDuration);
        nextAction.fadeIn(fadeDuration);
      }
      nextAction.play();
      animation.activeAction = nextAction;
    }
    if (
      animation.nativeClips &&
      locomotionSpeed !== undefined &&
      (state === "walk" || state === "run")
    ) {
      const referenceSpeed = state === "walk" ? 1.1 : 3.3;
      const authoredTimeScale =
        state === "walk"
          ? character.style === "maya"
            ? 1.47
            : 1.325
          : character.style === "maya"
            ? 1.375
            : 1.25;
      animation.activeAction.setEffectiveTimeScale(
        THREE.MathUtils.clamp(
          authoredTimeScale * (locomotionSpeed / referenceSpeed),
          0.65,
          2.1,
        ),
      );
    }
    animation.accumulator += delta;
    const updateInterval = character.detailsVisible ? 0 : 1 / 20;
    if (
      updateInterval === 0 ||
      animation.accumulator >= updateInterval
    ) {
      animation.mixer.update(animation.accumulator);
      animation.accumulator = 0;
      applyAssetSecondaryPose(character, state);
    }
    return;
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

export function setCharacterDetail(
  character: AnimatedCharacter,
  visible: boolean,
) {
  if (character.detailsVisible === visible) return;
  character.detailsVisible = visible;
  for (const object of character.detailNodes) object.visible = visible;
  for (const mesh of character.shadowNodes ?? []) mesh.castShadow = visible;
}

export function disposeAnimatedCharacter(character: AnimatedCharacter) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  character.model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!character.sharedGeometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });
  if (character.sharedGeometry) {
    for (const weapon of character.weaponNodes) {
      weapon.traverse((object) => {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
      });
    }
  }
  character.assetAnimation?.mixer.stopAllAction();
  if (character.assetAnimation) {
    character.assetAnimation.mixer.uncacheRoot(character.model);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
