import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type GameChapter =
  | "hospital"
  | "street"
  | "station"
  | "checkpoint"
  | "depot"
  | "escape"
  | "survival";
export type EquipmentKind = "axe" | "radio" | "torch" | "medkit" | "pistol" | "fuel";

export type CollisionCircle = {
  x: number;
  z: number;
  radius: number;
};

export type InteractionPoint = {
  id: string;
  label: string;
  position: THREE.Vector3;
  object: THREE.Group;
};

export type BuiltWorld = {
  root: THREE.Group;
  collisions: CollisionCircle[];
  interactions: InteractionPoint[];
  start: THREE.Vector3;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

type MaterialSet = {
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  darkGreen: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  paintedMetal: THREE.MeshStandardMaterial;
};

function seededNoise(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function surfaceTexture(
  base: string,
  fleck: string,
  seed: number,
  grid = false,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  const random = seededNoise(seed);
  context.fillStyle = base;
  context.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 5800; i += 1) {
    const alpha = 0.025 + random() * 0.11;
    context.fillStyle = `${fleck}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
    const size = random() * 3 + 0.4;
    context.fillRect(random() * 512, random() * 512, size, size);
  }

  if (grid) {
    context.strokeStyle = "rgba(20,24,22,.42)";
    context.lineWidth = 3;
    for (let p = 0; p <= 512; p += 64) {
      context.beginPath();
      context.moveTo(p, 0);
      context.lineTo(p, 512);
      context.stroke();
      context.beginPath();
      context.moveTo(0, p);
      context.lineTo(512, p);
      context.stroke();
    }
  }

  for (let i = 0; i < 18; i += 1) {
    context.strokeStyle = `rgba(42,35,28,${0.04 + random() * 0.08})`;
    context.lineWidth = 2 + random() * 7;
    context.beginPath();
    context.moveTo(random() * 512, random() * 512);
    context.bezierCurveTo(
      random() * 512,
      random() * 512,
      random() * 512,
      random() * 512,
      random() * 512,
      random() * 512,
    );
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function brickTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  const random = seededNoise(288);
  context.fillStyle = "#363a36";
  context.fillRect(0, 0, 512, 512);
  const brickHeight = 42;
  const brickWidth = 92;
  for (let row = 0; row < 13; row += 1) {
    const offset = row % 2 === 0 ? -brickWidth / 2 : 0;
    for (let column = -1; column < 7; column += 1) {
      const x = column * brickWidth + offset + 3;
      const y = row * brickHeight + 3;
      const shade = Math.floor(58 + random() * 28);
      context.fillStyle = `rgb(${shade + 18},${shade + 3},${shade - 4})`;
      context.fillRect(x, y, brickWidth - 6, brickHeight - 6);
      context.fillStyle = `rgba(210,190,165,${0.02 + random() * 0.05})`;
      context.fillRect(x + 4, y + 4, brickWidth - 14, 3 + random() * 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 5);
  texture.anisotropy = 4;
  return texture;
}

function createMaterials(): MaterialSet {
  const concreteTexture = surfaceTexture("#625f56", "#d5d0bd", 42);
  concreteTexture.repeat.set(5, 18);
  const wallTexture = surfaceTexture("#7a796f", "#d7d2bd", 64);
  wallTexture.repeat.set(3, 12);
  const tileTexture = surfaceTexture("#6e746d", "#d9ddd4", 84, true);
  tileTexture.repeat.set(5, 24);
  const asphaltTexture = surfaceTexture("#292b28", "#b4b1a2", 105);
  asphaltTexture.repeat.set(5, 32);

  return {
    concrete: new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: 0xa5a093,
      roughness: 0.93,
      metalness: 0.02,
    }),
    concreteDark: new THREE.MeshStandardMaterial({
      color: 0x343833,
      roughness: 0.98,
    }),
    wall: new THREE.MeshStandardMaterial({
      map: wallTexture,
      color: 0xb9b6a9,
      roughness: 0.9,
    }),
    tile: new THREE.MeshStandardMaterial({
      map: tileTexture,
      color: 0xaab0a8,
      roughness: 0.82,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      map: asphaltTexture,
      color: 0x555650,
      roughness: 0.96,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x343c39,
      roughness: 0.48,
      metalness: 0.76,
    }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x77412e,
      roughness: 0.83,
      metalness: 0.42,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x8da5a2,
      roughness: 0.18,
      transmission: 0.25,
      transparent: true,
      opacity: 0.56,
      metalness: 0.08,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x101412,
      roughness: 0.88,
    }),
    white: new THREE.MeshStandardMaterial({
      color: 0xd9d6c8,
      roughness: 0.62,
    }),
    red: new THREE.MeshStandardMaterial({
      color: 0x8f3226,
      roughness: 0.67,
      metalness: 0.16,
    }),
    yellow: new THREE.MeshStandardMaterial({
      color: 0xd09a28,
      roughness: 0.62,
      emissive: 0x2e1700,
      emissiveIntensity: 0.18,
    }),
    darkGreen: new THREE.MeshStandardMaterial({
      color: 0x273d35,
      roughness: 0.84,
    }),
    fabric: new THREE.MeshStandardMaterial({
      color: 0x39413b,
      roughness: 1,
    }),
    brick: new THREE.MeshStandardMaterial({
      map: brickTexture(),
      color: 0x8d7a6e,
      roughness: 0.96,
    }),
    paintedMetal: new THREE.MeshStandardMaterial({
      color: 0x58625d,
      roughness: 0.55,
      metalness: 0.52,
    }),
  };
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
  radii: [number, number],
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
  segments = 14,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radii[0], radii[1], height, segments),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radius = 0.1,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const safeRadius = Math.min(radius, Math.min(...size) * 0.45);
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(size[0], size[1], size[2], 4, safeRadius),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function textPanel(
  text: string,
  foreground = "#e6dec8",
  background = "rgba(20,25,22,.92)",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext("2d")!;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,.16)";
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = foreground;
  context.font = "700 74px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), material);
}

function addFluorescent(
  parent: THREE.Object3D,
  x: number,
  z: number,
  intensity = 2.6,
) {
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.08, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x555b57, roughness: 0.5 }),
  );
  housing.position.set(x, 4.58, z);
  parent.add(housing);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.035, 0.27),
    new THREE.MeshStandardMaterial({
      color: 0xeef3df,
      emissive: 0xdde8cd,
      emissiveIntensity: 3.8,
    }),
  );
  panel.position.set(x, 4.53, z);
  parent.add(panel);
  const light = new THREE.PointLight(0xdcebd2, intensity, 13, 2);
  light.position.set(x, 4.2, z);
  light.castShadow = false;
  light.userData.baseIntensity = intensity;
  light.userData.flicker = true;
  parent.add(light);
}

function hospitalBed(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const bed = new THREE.Group();
  bed.position.set(x, 0, z);
  bed.rotation.y = rotation;
  box(bed, [2.1, 0.12, 0.88], [0, 0.72, 0], materials.metal);
  box(bed, [1.94, 0.16, 0.78], [0, 0.86, 0], materials.white);
  box(bed, [0.48, 0.18, 0.68], [-0.64, 1.02, 0], materials.fabric, [0, 0, -0.08]);
  box(bed, [0.08, 0.72, 0.9], [-1.04, 1.02, 0], materials.metal);
  box(bed, [0.08, 0.5, 0.9], [1.04, 0.94, 0], materials.metal);
  for (const px of [-0.88, 0.88]) {
    for (const pz of [-0.31, 0.31]) {
      cylinder(bed, [0.08, 0.08], 0.62, [px, 0.38, pz], materials.metal);
      const wheel = cylinder(
        bed,
        [0.12, 0.12],
        0.07,
        [px, 0.08, pz],
        materials.rubber,
        [Math.PI / 2, 0, 0],
      );
      wheel.castShadow = true;
    }
  }
  return bed;
}

function hospitalCart(materials: MaterialSet, x: number, z: number) {
  const cart = new THREE.Group();
  cart.position.set(x, 0, z);
  for (const y of [0.48, 0.9, 1.32]) {
    box(cart, [0.84, 0.09, 0.48], [0, y, 0], materials.metal);
  }
  for (const px of [-0.36, 0.36]) {
    for (const pz of [-0.19, 0.19]) {
      cylinder(cart, [0.035, 0.035], 1.2, [px, 0.7, pz], materials.metal);
    }
  }
  return cart;
}

function monitorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#06110f";
  context.fillRect(0, 0, 512, 256);
  context.strokeStyle = "rgba(34,255,161,.12)";
  context.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 256);
    context.stroke();
  }
  for (let y = 0; y < 256; y += 32) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(512, y);
    context.stroke();
  }
  context.strokeStyle = "#48ef9f";
  context.lineWidth = 7;
  context.shadowColor = "#2cff98";
  context.shadowBlur = 16;
  context.beginPath();
  context.moveTo(0, 145);
  context.lineTo(105, 145);
  context.lineTo(133, 136);
  context.lineTo(151, 48);
  context.lineTo(173, 207);
  context.lineTo(196, 115);
  context.lineTo(226, 145);
  context.lineTo(340, 145);
  context.lineTo(360, 120);
  context.lineTo(382, 169);
  context.lineTo(405, 145);
  context.lineTo(512, 145);
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "#d9ffe9";
  context.font = "700 42px monospace";
  context.fillText("72", 410, 62);
  context.fillStyle = "#80caa7";
  context.font = "20px monospace";
  context.fillText("BPM", 413, 88);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function patientMonitor(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const monitor = hospitalCart(materials, x, z);
  monitor.rotation.y = rotation;
  box(monitor, [0.88, 0.65, 0.34], [0, 1.74, 0], materials.white);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.67, 0.37),
    new THREE.MeshBasicMaterial({ map: monitorTexture(), toneMapped: false }),
  );
  screen.position.set(0, 1.78, -0.175);
  screen.rotation.y = Math.PI;
  monitor.add(screen);
  for (let i = 0; i < 5; i += 1) {
    cylinder(
      monitor,
      [0.028, 0.028],
      0.055,
      [-0.25 + i * 0.125, 1.49, -0.19],
      i === 0 ? materials.red : materials.metal,
      [Math.PI / 2, 0, 0],
    );
  }
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.35, 1.65, 0),
    new THREE.Vector3(0.62, 1.22, 0.12),
    new THREE.Vector3(0.55, 0.66, 0.25),
    new THREE.Vector3(0.85, 0.12, 0.35),
  ]);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 22, 0.018, 7, false),
    materials.rubber,
  );
  monitor.add(cable);
  return monitor;
}

function ivStand(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const stand = new THREE.Group();
  stand.position.set(x, 0, z);
  stand.rotation.y = rotation;
  cylinder(stand, [0.035, 0.035], 2.15, [0, 1.13, 0], materials.metal);
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    box(
      stand,
      [0.52, 0.035, 0.035],
      [Math.cos(angle) * 0.22, 0.08, Math.sin(angle) * 0.22],
      materials.metal,
      [0, -angle, 0],
    );
  }
  box(stand, [0.62, 0.025, 0.025], [0, 2.18, 0], materials.metal);
  for (const side of [-1, 1]) {
    const bagMaterial = new THREE.MeshPhysicalMaterial({
      color: side === 1 ? 0xcbe4dd : 0xe1d4bd,
      transparent: true,
      opacity: 0.62,
      roughness: 0.18,
      transmission: 0.42,
    });
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.26, 6, 10), bagMaterial);
    bag.scale.set(0.62, 1, 0.32);
    bag.position.set(side * 0.2, 1.88, 0);
    bag.castShadow = true;
    stand.add(bag);
    const tubeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.2, 1.72, 0),
      new THREE.Vector3(side * 0.31, 1.2, 0.08),
      new THREE.Vector3(side * 0.22, 0.62, 0.15),
      new THREE.Vector3(side * 0.43, 0.18, 0.26),
    ]);
    stand.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(tubeCurve, 18, 0.009, 6, false),
        new THREE.MeshPhysicalMaterial({
          color: 0xd6eee8,
          transparent: true,
          opacity: 0.58,
          roughness: 0.1,
        }),
      ),
    );
  }
  return stand;
}

function oxygenTank(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const tank = new THREE.Group();
  tank.position.set(x, 0, z);
  tank.rotation.y = rotation;
  const cylinderBody = cylinder(
    tank,
    [0.22, 0.22],
    1.12,
    [0, 0.68, 0],
    new THREE.MeshStandardMaterial({
      color: 0x4f8e80,
      roughness: 0.48,
      metalness: 0.62,
    }),
    [0, 0, 0],
    20,
  );
  cylinderBody.castShadow = true;
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.darkGreen,
  );
  top.position.y = 1.24;
  tank.add(top);
  cylinder(tank, [0.065, 0.065], 0.18, [0, 1.42, 0], materials.metal);
  const gauge = cylinder(
    tank,
    [0.1, 0.1],
    0.05,
    [0.14, 1.43, 0],
    materials.white,
    [0, 0, Math.PI / 2],
    18,
  );
  gauge.castShadow = true;
  return tank;
}

function wheelchair(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const chair = new THREE.Group();
  chair.position.set(x, 0, z);
  chair.rotation.y = rotation;
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.045, 8, 26),
      materials.rubber,
    );
    wheel.position.set(side * 0.44, 0.51, 0.06);
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    chair.add(wheel);
    const smallWheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.032, 7, 18),
      materials.rubber,
    );
    smallWheel.position.set(side * 0.39, 0.16, -0.62);
    smallWheel.rotation.y = Math.PI / 2;
    chair.add(smallWheel);
    cylinder(chair, [0.025, 0.025], 0.84, [side * 0.4, 0.72, -0.28], materials.metal);
  }
  box(chair, [0.78, 0.12, 0.72], [0, 0.68, -0.03], materials.fabric, [-0.12, 0, 0]);
  box(chair, [0.8, 0.92, 0.1], [0, 1.12, 0.31], materials.fabric, [0.1, 0, 0]);
  box(chair, [1.08, 0.055, 0.055], [0, 1.28, 0.45], materials.metal);
  return chair;
}

function medicalCabinet(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const cabinet = new THREE.Group();
  cabinet.position.set(x, 0, z);
  cabinet.rotation.y = rotation;
  box(cabinet, [1.35, 2.1, 0.48], [0, 1.05, 0], materials.white);
  for (const y of [0.42, 0.84, 1.26, 1.68]) {
    box(cabinet, [1.24, 0.035, 0.43], [0, y, -0.02], materials.metal);
  }
  const glassDoor = box(
    cabinet,
    [0.58, 1.9, 0.045],
    [-0.67, 1.08, 0.25],
    materials.glass,
    [0, -0.65, 0],
  );
  glassDoor.material.transparent = true;
  for (let shelf = 0; shelf < 4; shelf += 1) {
    for (let item = 0; item < 5; item += 1) {
      const color =
        item % 3 === 0
          ? materials.red
          : item % 3 === 1
            ? materials.darkGreen
            : materials.white;
      if ((shelf + item) % 4 === 0) continue;
      cylinder(
        cabinet,
        [0.045 + (item % 2) * 0.018, 0.045 + (item % 2) * 0.018],
        0.16 + (shelf % 2) * 0.08,
        [-0.46 + item * 0.22, 0.53 + shelf * 0.42, -0.27],
        color,
      );
    }
  }
  return cabinet;
}

function liquidPuddle(
  color: string,
  x: number,
  z: number,
  scale: number,
  rotation = 0,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, 256, 256);
  const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 118);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.56, color);
  gradient.addColorStop(0.78, `${color}bb`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.beginPath();
  for (let point = 0; point < 40; point += 1) {
    const angle = (point / 40) * Math.PI * 2;
    const radius = 77 + Math.sin(point * 4.7) * 21 + Math.cos(point * 2.1) * 13;
    const px = 128 + Math.cos(angle) * radius;
    const py = 128 + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const puddle = new THREE.Mesh(
    new THREE.PlaneGeometry(scale, scale * 0.72),
    new THREE.MeshPhysicalMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.24,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.rotation.z = rotation;
  puddle.position.set(x, 0.018, z);
  puddle.receiveShadow = true;
  return puddle;
}

function operatingLamp(materials: MaterialSet, x: number, z: number) {
  const lamp = new THREE.Group();
  lamp.position.set(x, 0, z);
  cylinder(lamp, [0.065, 0.065], 2.1, [0, 3.72, 0], materials.metal, [0, 0, Math.PI / 2]);
  cylinder(lamp, [0.055, 0.055], 1.4, [1.02, 3.72, 0], materials.metal, [0, 0, 0.75]);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.38, 0.18, 24),
    materials.white,
  );
  shade.position.set(1.5, 3.24, 0);
  shade.rotation.z = 0.55;
  lamp.add(shade);
  const bulb = new THREE.PointLight(0xe5f1dc, 2.4, 8, 2);
  bulb.position.set(1.36, 3.08, 0);
  lamp.add(bulb);
  return lamp;
}

function hospitalReception(materials: MaterialSet, x: number, z: number) {
  const desk = new THREE.Group();
  desk.position.set(x, 0, z);
  roundedBox(desk, [3.8, 1.05, 1.05], [0, 0.55, 0], materials.darkGreen, 0.14);
  roundedBox(desk, [4.05, 0.16, 1.28], [0, 1.08, 0], materials.white, 0.07);
  roundedBox(desk, [1.15, 0.68, 0.42], [-0.9, 1.5, -0.18], materials.metal, 0.08);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.48),
    new THREE.MeshBasicMaterial({
      map: monitorTexture(),
      toneMapped: false,
    }),
  );
  screen.position.set(-0.9, 1.52, -0.395);
  screen.rotation.y = Math.PI;
  desk.add(screen);
  for (let index = 0; index < 4; index += 1) {
    roundedBox(
      desk,
      [0.62, 0.18, 0.5],
      [0.65 + (index % 2) * 0.72, 0.28 + Math.floor(index / 2) * 0.3, 0.02],
      materials.paintedMetal,
      0.045,
    );
  }
  box(desk, [0.76, 0.025, 0.52], [0.52, 1.2, -0.08], materials.white, [0, 0.18, 0]);
  return desk;
}

function pharmacyShelf(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const shelf = new THREE.Group();
  shelf.position.set(x, 0, z);
  shelf.rotation.y = rotation;
  roundedBox(shelf, [2.5, 2.3, 0.52], [0, 1.15, 0], materials.paintedMetal, 0.06);
  box(shelf, [2.28, 2.05, 0.48], [0, 1.16, -0.04], materials.concreteDark);
  for (const y of [0.42, 0.86, 1.3, 1.74, 2.14]) {
    box(shelf, [2.32, 0.055, 0.58], [0, y, 0.02], materials.white);
  }
  const colors = [materials.white, materials.red, materials.darkGreen, materials.yellow];
  for (let row = 0; row < 4; row += 1) {
    for (let item = 0; item < 9; item += 1) {
      if ((row * 5 + item) % 7 === 0) continue;
      const width = 0.11 + ((item + row) % 3) * 0.035;
      const pack = roundedBox(
        shelf,
        [width, 0.2 + (item % 2) * 0.08, 0.16],
        [-0.98 + item * 0.245, 0.57 + row * 0.44, -0.31],
        colors[(item + row) % colors.length],
        0.018,
      );
      pack.rotation.z = ((item % 3) - 1) * 0.035;
    }
  }
  return shelf;
}

function fireExtinguisher(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const extinguisher = new THREE.Group();
  extinguisher.position.set(x, 0, z);
  extinguisher.rotation.y = rotation;
  cylinder(extinguisher, [0.14, 0.17], 0.62, [0, 0.45, 0], materials.red, [0, 0, 0], 20);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.red,
  );
  dome.position.y = 0.76;
  extinguisher.add(dome);
  cylinder(extinguisher, [0.035, 0.035], 0.15, [0, 0.87, 0], materials.metal);
  box(extinguisher, [0.28, 0.055, 0.06], [0.08, 0.96, 0], materials.metal, [0, 0, -0.2]);
  return extinguisher;
}

function makeBusShelter(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const shelter = new THREE.Group();
  shelter.position.set(x, 0, z);
  shelter.rotation.y = rotation;
  for (const side of [-1, 1]) {
    box(shelter, [0.08, 2.55, 1.8], [side * 1.62, 1.3, 0], materials.glass);
    cylinder(shelter, [0.045, 0.045], 2.7, [side * 1.7, 1.35, -0.95], materials.metal);
    cylinder(shelter, [0.045, 0.045], 2.7, [side * 1.7, 1.35, 0.95], materials.metal);
  }
  roundedBox(shelter, [3.75, 0.18, 2.25], [0, 2.65, 0], materials.paintedMetal, 0.08);
  roundedBox(shelter, [2.45, 0.16, 0.62], [0, 0.72, 0.42], materials.darkGreen, 0.06);
  box(shelter, [3.42, 2.35, 0.05], [0, 1.3, 0.93], materials.glass);
  return shelter;
}

function trafficSignal(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const signal = new THREE.Group();
  signal.position.set(x, 0, z);
  signal.rotation.y = rotation;
  cylinder(signal, [0.09, 0.13], 5.8, [0, 2.9, 0], materials.metal, [0, 0, 0], 12);
  cylinder(signal, [0.07, 0.07], 3.9, [1.8, 5.65, 0], materials.metal, [0, 0, Math.PI / 2], 10);
  roundedBox(signal, [0.65, 1.75, 0.5], [3.6, 5.1, 0], materials.rubber, 0.09);
  for (const [y, color, emissive] of [
    [5.62, 0x54110c, 0x160000],
    [5.1, 0x5b4b12, 0x241800],
    [4.58, 0x2e6535, 0x2cbe4e],
  ] as const) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 16, 10),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: y < 5 ? 2.6 : 0.1,
      }),
    );
    lamp.position.set(3.6, y, -0.26);
    signal.add(lamp);
  }
  return signal;
}

function roadCone(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const cone = new THREE.Group();
  cone.position.set(x, 0, z);
  cone.rotation.y = rotation;
  roundedBox(cone, [0.55, 0.08, 0.55], [0, 0.04, 0], materials.rubber, 0.04);
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.72, 18),
    materials.red,
  );
  body.position.y = 0.43;
  body.castShadow = true;
  cone.add(body);
  cylinder(cone, [0.17, 0.12], 0.14, [0, 0.43, 0], materials.white, [0, 0, 0], 18);
  return cone;
}

function utilityPole(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const pole = new THREE.Group();
  pole.position.set(x, 0, z);
  pole.rotation.y = rotation;
  cylinder(pole, [0.14, 0.2], 7.6, [0, 3.8, 0], materials.rust, [0, 0, 0], 12);
  cylinder(pole, [0.09, 0.09], 3.3, [0, 7.1, 0], materials.rust, [0, 0, Math.PI / 2], 10);
  for (const side of [-1, 1]) {
    const insulator = cylinder(
      pole,
      [0.11, 0.08],
      0.32,
      [side * 1.18, 7.3, 0],
      materials.glass,
      [0, 0, 0],
      12,
    );
    insulator.castShadow = false;
  }
  return pole;
}

function shippingCrate(materials: MaterialSet, x: number, z: number, rotation = 0, scale = 1) {
  const crate = new THREE.Group();
  crate.position.set(x, 0, z);
  crate.rotation.y = rotation;
  roundedBox(crate, [1.25 * scale, 0.92 * scale, 1.05 * scale], [0, 0.46 * scale, 0], materials.darkGreen, 0.055);
  for (const side of [-1, 1]) {
    box(crate, [0.09 * scale, 0.98 * scale, 1.12 * scale], [side * 0.5 * scale, 0.48 * scale, 0], materials.metal);
    box(crate, [1.31 * scale, 0.98 * scale, 0.09 * scale], [0, 0.48 * scale, side * 0.43 * scale], materials.metal);
  }
  return crate;
}

function makeCar(
  materials: MaterialSet,
  color: THREE.Material,
  x: number,
  z: number,
  rotation = 0,
) {
  const car = new THREE.Group();
  car.position.set(x, 0, z);
  car.rotation.y = rotation;
  roundedBox(car, [1.92, 0.5, 4.15], [0, 0.7, 0], color, 0.2);
  roundedBox(car, [1.72, 0.72, 2.05], [0, 1.18, -0.22], color, 0.18);
  roundedBox(car, [1.84, 0.22, 1.38], [0, 0.96, -1.35], color, 0.12);
  roundedBox(car, [1.82, 0.24, 0.92], [0, 0.88, 1.58], color, 0.1);
  box(car, [1.5, 0.47, 0.045], [0, 1.27, -1.27], materials.glass, [-0.2, 0, 0]);
  box(car, [1.5, 0.44, 0.045], [0, 1.25, 0.8], materials.glass, [0.18, 0, 0]);
  for (const side of [-1, 1]) {
    box(
      car,
      [0.035, 0.43, 0.8],
      [side * 0.865, 1.25, -0.34],
      materials.glass,
    );
    box(
      car,
      [0.035, 0.38, 0.62],
      [side * 0.865, 1.2, 0.53],
      materials.glass,
    );
    box(
      car,
      [0.055, 0.12, 0.24],
      [side * 0.98, 1.23, -0.88],
      materials.metal,
    );
    box(
      car,
      [0.035, 0.04, 1.52],
      [side * 0.975, 0.79, 0.06],
      materials.metal,
    );
  }
  box(car, [1.58, 0.16, 0.11], [0, 0.56, -2.1], materials.metal);
  box(car, [1.48, 0.18, 0.04], [0, 0.75, -2.13], materials.rubber);
  for (const px of [-0.62, 0.62]) {
    roundedBox(
      car,
      [0.42, 0.18, 0.06],
      [px, 0.87, -2.12],
      new THREE.MeshStandardMaterial({
        color: 0xe8d6a1,
        emissive: 0xd8a85b,
        emissiveIntensity: 0.5,
      }),
      0.06,
    );
    roundedBox(
      car,
      [0.34, 0.14, 0.055],
      [px, 0.78, 2.1],
      materials.red,
      0.05,
    );
  }
  for (const px of [-0.98, 0.98]) {
    for (const pz of [-1.36, 1.36]) {
      const tyre = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.12, 10, 24),
        materials.rubber,
      );
      tyre.position.set(px, 0.42, pz);
      tyre.rotation.y = Math.PI / 2;
      tyre.castShadow = true;
      car.add(tyre);
      cylinder(
        car,
        [0.14, 0.14],
        0.26,
        [px, 0.42, pz],
        materials.metal,
        [0, 0, Math.PI / 2],
        16,
      );
    }
  }
  return car;
}

function makeBus(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const bus = new THREE.Group();
  bus.position.set(x, 0, z);
  bus.rotation.y = rotation;
  roundedBox(bus, [2.62, 2.78, 8.75], [0, 1.64, 0], materials.rust, 0.22);
  roundedBox(bus, [2.5, 0.38, 8.3], [0, 0.56, 0], materials.paintedMetal, 0.13);
  box(bus, [2.18, 1.18, 0.055], [0, 2.12, -4.4], materials.glass, [-0.04, 0, 0]);
  box(bus, [2.08, 0.34, 0.08], [0, 0.76, -4.42], materials.rubber);
  for (const xPosition of [-0.78, -0.26, 0.26, 0.78]) {
    box(
      bus,
      [0.34, 0.13, 0.06],
      [xPosition, 0.95, -4.46],
      xPosition < 0 ? materials.white : materials.red,
    );
  }
  for (const side of [-1, 1]) {
    for (let p = -3.25; p <= 3.25; p += 1.3) {
      roundedBox(
        bus,
        [0.045, 0.74, 0.94],
        [side * 1.32, 2.12, p],
        materials.glass,
        0.03,
      );
      box(
        bus,
        [0.055, 0.08, 1.02],
        [side * 1.345, 1.69, p],
        materials.metal,
      );
    }
    box(bus, [0.055, 2.05, 0.95], [side * 1.34, 1.55, -3.37], materials.glass);
  }
  box(bus, [2.32, 0.12, 8.15], [0, 3.08, 0], materials.concreteDark);
  for (const zPosition of [-3.6, 3.58]) {
    box(bus, [2.86, 0.2, 0.18], [0, 0.44, zPosition], materials.metal);
  }
  for (const px of [-1.3, 1.3]) {
    for (const pz of [-2.75, 2.75]) {
      const tyre = new THREE.Mesh(
        new THREE.TorusGeometry(0.47, 0.16, 10, 26),
        materials.rubber,
      );
      tyre.position.set(px, 0.55, pz);
      tyre.rotation.y = Math.PI / 2;
      tyre.castShadow = true;
      bus.add(tyre);
      cylinder(
        bus,
        [0.2, 0.2],
        0.32,
        [px, 0.55, pz],
        materials.metal,
        [0, 0, Math.PI / 2],
        18,
      );
    }
  }
  return bus;
}

function streetLight(materials: MaterialSet, x: number, z: number, side = 1) {
  const light = new THREE.Group();
  light.position.set(x, 0, z);
  cylinder(light, [0.09, 0.14], 5.4, [0, 2.7, 0], materials.metal);
  box(light, [1.2, 0.09, 0.09], [side * 0.52, 5.28, 0], materials.metal);
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3d69a,
    emissive: 0xf0ad49,
    emissiveIntensity: 2.2,
  });
  box(light, [0.54, 0.16, 0.34], [side * 1.08, 5.18, 0], lampMaterial);
  const point = new THREE.PointLight(0xf3b96c, 2.2, 15, 2);
  point.position.set(side * 1.08, 4.88, 0);
  point.userData.baseIntensity = 2.2;
  point.userData.flicker = true;
  light.add(point);
  return light;
}

function addBuilding(
  parent: THREE.Object3D,
  materials: MaterialSet,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  side: -1 | 1,
) {
  const building = new THREE.Group();
  building.position.set(x, 0, z);
  const wallMaterial = height > 12 ? materials.concreteDark : materials.brick;
  box(building, [width, height, depth], [0, height / 2, 0], wallMaterial);
  box(
    building,
    [width + 0.22, 0.4, depth + 0.22],
    [0, height + 0.2, 0],
    materials.concreteDark,
  );
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x253332,
    emissive: 0x111d1d,
    emissiveIntensity: 0.45,
    roughness: 0.26,
    metalness: 0.3,
  });
  const faceX = side * (width / 2 + 0.015);
  for (let y = 2.2; y < height - 1; y += 2.2) {
    for (let p = -depth / 2 + 1.4; p < depth / 2 - 0.5; p += 2.2) {
      box(
        building,
        [0.06, 1.08, 1.36],
        [faceX + side * 0.025, y, p],
        materials.metal,
      );
      box(
        building,
        [0.075, 0.88, 1.14],
        [faceX + side * 0.06, y, p],
        windowMaterial,
      );
      box(
        building,
        [0.09, 0.05, 1.5],
        [faceX + side * 0.1, y - 0.58, p],
        materials.concrete,
      );
    }
  }
  const entranceZ = depth * 0.18;
  roundedBox(
    building,
    [0.1, 2.15, 1.15],
    [faceX + side * 0.09, 1.08, entranceZ],
    materials.glass,
    0.04,
  );
  box(
    building,
    [0.72, 0.14, 3.4],
    [faceX + side * 0.46, 2.45, entranceZ],
    materials.darkGreen,
    [0, 0, side * 0.05],
  );
  box(
    building,
    [0.14, 1.8, 2.9],
    [faceX + side * 0.16, 1.25, -depth * 0.28],
    materials.rust,
  );
  for (const y of [1.2, 2.5, 3.8]) {
    box(
      building,
      [0.5, 0.08, 3.1],
      [faceX + side * 0.38, y, -depth * 0.28],
      materials.metal,
    );
  }
  cylinder(
    building,
    [0.07, 0.07],
    Math.max(3.2, height - 1),
    [faceX + side * 0.18, height / 2, depth * 0.42],
    materials.rust,
  );
  parent.add(building);
  return building;
}

function makePump(materials: MaterialSet, x: number, z: number, number: string) {
  const pump = new THREE.Group();
  pump.position.set(x, 0, z);
  roundedBox(pump, [1.05, 1.95, 0.72], [0, 1, 0], materials.white, 0.13);
  roundedBox(pump, [0.82, 0.5, 0.055], [0, 1.45, 0.39], materials.glass, 0.05);
  roundedBox(pump, [0.76, 0.19, 0.055], [0, 1.05, 0.39], materials.red, 0.04);
  const label = textPanel(number, "#f4e9d2", "rgba(118,32,25,.95)");
  label.scale.setScalar(0.24);
  label.position.set(0, 1.83, 0.375);
  pump.add(label);
  const hose = new THREE.Mesh(
    new THREE.TorusGeometry(0.47, 0.035, 8, 22, Math.PI * 1.35),
    materials.rubber,
  );
  hose.position.set(0.48, 1, 0.42);
  hose.rotation.z = -0.6;
  pump.add(hose);
  roundedBox(pump, [0.13, 0.46, 0.1], [0.55, 0.94, 0.48], materials.metal, 0.035);
  box(pump, [1.18, 0.14, 0.88], [0, 0.12, 0], materials.concreteDark);
  return pump;
}

function makeMotorcycle(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const bike = new THREE.Group();
  bike.position.set(x, 0, z);
  bike.rotation.y = rotation;
  for (const wheelZ of [-0.85, 0.9]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.105, 10, 20),
      materials.rubber,
    );
    wheel.position.set(0, 0.48, wheelZ);
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    bike.add(wheel);
    cylinder(
      bike,
      [0.1, 0.1],
      0.18,
      [0, 0.48, wheelZ],
      materials.metal,
      [Math.PI / 2, 0, 0],
      18,
    );
  }
  const tank = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.48, 6, 16),
    materials.red,
  );
  tank.position.set(0, 1.02, -0.16);
  tank.rotation.x = Math.PI / 2;
  tank.scale.set(0.82, 1, 0.72);
  tank.castShadow = true;
  bike.add(tank);
  for (const side of [-1, 1]) {
    const frameCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.14, 0.55, -0.72),
      new THREE.Vector3(side * 0.19, 0.82, -0.12),
      new THREE.Vector3(side * 0.16, 0.68, 0.64),
    ]);
    bike.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(frameCurve, 18, 0.035, 8, false),
        materials.metal,
      ),
    );
    cylinder(
      bike,
      [0.035, 0.035],
      1.05,
      [side * 0.18, 0.82, 0.58],
      materials.metal,
      [0.62, 0, 0],
      10,
    );
  }
  cylinder(bike, [0.2, 0.2], 0.44, [0, 0.72, -0.12], materials.metal, [Math.PI / 2, 0, 0], 22);
  roundedBox(bike, [0.46, 0.16, 0.78], [0, 1.08, 0.35], materials.rubber, 0.08);
  cylinder(bike, [0.1, 0.1], 0.55, [0.32, 0.64, -0.16], materials.metal, [Math.PI / 2, 0, 0], 16);
  box(bike, [0.85, 0.06, 0.06], [0, 1.22, 0.98], materials.metal);
  const headlamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 10),
    new THREE.MeshStandardMaterial({
      color: 0xffe6b1,
      emissive: 0xffbd5c,
      emissiveIntensity: 1.1,
    }),
  );
  headlamp.position.set(0, 1.18, 0.92);
  bike.add(headlamp);
  return bike;
}

function makeBarrier(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const barrier = new THREE.Group();
  barrier.position.set(x, 0, z);
  barrier.rotation.y = rotation;
  box(barrier, [3.1, 0.34, 0.18], [0, 1.03, 0], materials.white);
  for (const stripeX of [-1.05, -0.35, 0.35, 1.05]) {
    box(barrier, [0.36, 0.36, 0.195], [stripeX, 1.03, 0], materials.red, [0, 0, -0.55]);
  }
  for (const legX of [-1.1, 1.1]) {
    box(barrier, [0.13, 1.28, 0.13], [legX, 0.57, 0], materials.metal);
    box(barrier, [0.72, 0.1, 0.42], [legX, 0.07, 0], materials.metal);
  }
  return barrier;
}

function makeTree(materials: MaterialSet, x: number, z: number, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  cylinder(tree, [0.16 * scale, 0.31 * scale], 4.2 * scale, [0, 2.1 * scale, 0], materials.rust, [0.05, 0, -0.04], 10);
  for (const [side, height, lean] of [
    [-1, 3.45, -0.62],
    [1, 3.72, 0.58],
    [-1, 4.2, -0.42],
  ] as const) {
    cylinder(
      tree,
      [0.07 * scale, 0.13 * scale],
      1.7 * scale,
      [side * 0.43 * scale, height * scale, 0],
      materials.rust,
      [0, 0, lean],
      8,
    );
  }
  const foliageMaterials = [0x1f3427, 0x2b4432, 0x334d37].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  for (const [ox, oy, oz, radius, materialIndex] of [
    [0, 4.3, 0, 1.4, 0],
    [-0.9, 4.05, 0.2, 0.98, 1],
    [0.8, 4.18, -0.25, 1.08, 2],
    [0.08, 5.15, 0, 0.92, 1],
    [-0.55, 4.82, -0.38, 0.75, 0],
  ] as const) {
    const crown = new THREE.Mesh(
      new THREE.DodecahedronGeometry(radius * scale, 1),
      foliageMaterials[materialIndex],
    );
    crown.position.set(ox * scale, oy * scale, oz * scale);
    crown.rotation.set(ox * 0.32, oy * 0.17, oz * 0.42);
    crown.scale.set(1.08, 0.82 + materialIndex * 0.05, 0.94);
    crown.castShadow = true;
    tree.add(crown);
  }
  return tree;
}

export function createEquipmentModel(kind: EquipmentKind, scale = 1) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0xaeb4af,
    metalness: 0.86,
    roughness: 0.27,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222825, roughness: 0.74 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111412, roughness: 0.62, metalness: 0.36 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9d3025, roughness: 0.64, metalness: 0.2 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x3c4b39, roughness: 0.88 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb58332, roughness: 0.45, metalness: 0.58 });

  if (kind === "axe") {
    cylinder(group, [0.045, 0.055], 1.36, [0, 0, 0], dark);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.11), steel);
    head.position.y = 0.68;
    head.rotation.z = -0.08;
    head.castShadow = true;
    group.add(head);
    box(group, [0.18, 0.38, 0.13], [-0.3, 0.65, 0], red, [0, 0, -0.22]);
  } else if (kind === "radio") {
    box(group, [0.54, 0.76, 0.22], [0, 0, 0], olive);
    box(group, [0.38, 0.18, 0.04], [0, 0.15, 0.13], black);
    for (let i = 0; i < 5; i += 1) {
      box(group, [0.34, 0.025, 0.025], [0, -0.05 - i * 0.06, 0.13], dark);
    }
    cylinder(group, [0.025, 0.025], 0.56, [0.18, 0.65, 0], black, [0, 0, -0.08]);
    cylinder(group, [0.06, 0.06], 0.08, [-0.15, 0.43, 0], brass);
  } else if (kind === "torch") {
    cylinder(group, [0.11, 0.08], 0.66, [0, 0, 0], black);
    cylinder(group, [0.19, 0.13], 0.22, [0, 0.38, 0], steel);
    const lens = cylinder(
      group,
      [0.17, 0.17],
      0.025,
      [0, 0.505, 0],
      new THREE.MeshStandardMaterial({
        color: 0xf3e7b6,
        emissive: 0xf2d879,
        emissiveIntensity: 2.2,
      }),
    );
    lens.rotation.x = 0;
  } else if (kind === "medkit") {
    box(group, [0.9, 0.66, 0.28], [0, 0, 0], olive);
    box(group, [0.2, 0.4, 0.035], [0, 0, 0.16], new THREE.MeshStandardMaterial({ color: 0xe8e3d3 }));
    box(group, [0.42, 0.16, 0.038], [0, 0, 0.165], new THREE.MeshStandardMaterial({ color: 0xe8e3d3 }));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16, Math.PI), dark);
    handle.position.y = 0.36;
    handle.rotation.z = Math.PI;
    group.add(handle);
  } else if (kind === "pistol") {
    box(group, [0.2, 0.34, 0.18], [0, -0.25, 0], black, [0, 0, -0.16]);
    box(group, [0.24, 0.24, 0.72], [0, 0.06, -0.22], steel);
    box(group, [0.3, 0.12, 0.5], [0, 0.19, -0.15], black);
  } else {
    box(group, [0.72, 0.94, 0.32], [0, 0, 0], red);
    box(group, [0.48, 0.52, 0.035], [0, 0, 0.18], red);
    cylinder(group, [0.1, 0.1], 0.32, [0.19, 0.57, 0], black, [0, 0, Math.PI / 2]);
    box(group, [0.16, 0.16, 0.16], [-0.22, 0.55, 0], black);
  }

  group.scale.setScalar(scale);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}

function interactionObject(
  root: THREE.Group,
  id: string,
  label: string,
  position: [number, number, number],
  object: THREE.Group,
) {
  const holder = new THREE.Group();
  holder.position.set(...position);
  holder.userData.interactionId = id;
  object.position.y = 0.72;
  holder.add(object);

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xd6a439,
    emissive: 0xc47e14,
    emissiveIntensity: 1.5,
    roughness: 0.4,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.025, 8, 32), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.07;
  ring.userData.marker = true;
  holder.add(ring);
  root.add(holder);
  return { id, label, position: holder.position.clone(), object: holder };
}

function baseScene(root: THREE.Group, chapter: GameChapter) {
  const hemiColors: Record<GameChapter, [number, number]> = {
    hospital: [0xc8d1c5, 0x17201d],
    street: [0xd6b882, 0x20231f],
    station: [0xf0a56b, 0x241b17],
    checkpoint: [0x8e9c91, 0x161b18],
    depot: [0x7d8b83, 0x101513],
    escape: [0xf0a17c, 0x211a1a],
    survival: [0x819da0, 0x101916],
  };
  const [sky, ground] = hemiColors[chapter];
  root.add(new THREE.HemisphereLight(sky, ground, chapter === "hospital" ? 1.45 : 2.1));
  const sun = new THREE.DirectionalLight(
    chapter === "hospital" ? 0xdde5d4 : 0xffc68b,
    chapter === "hospital" ? 1.2 : 3.4,
  );
  sun.position.set(-16, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.bias = -0.0005;
  root.add(sun);
}

function buildHospital(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "hospital");

  box(root, [17, 0.22, 100], [0, -0.11, -41], materials.tile);
  box(root, [0.34, 4.8, 100], [-8.35, 2.4, -41], materials.wall);
  box(root, [0.34, 4.8, 100], [8.35, 2.4, -41], materials.wall);
  box(root, [17, 0.18, 100], [0, 4.72, -41], materials.concreteDark);
  box(root, [17, 4.8, 0.35], [0, 2.4, -91], materials.wall);

  for (let z = 5; z >= -86; z -= 7.4) {
    addFluorescent(root, z % 14.8 === 5 ? -2.7 : 2.7, z, z < -62 ? 1.1 : 2.5);
  }

  for (const [label, z, color] of [
    ["TRIAGE", -8, "rgba(43,78,68,.96)"],
    ["PHARMACY", -31, "rgba(49,70,83,.96)"],
    ["SURGERY", -55, "rgba(76,45,42,.96)"],
    ["EMERGENCY", -76, "rgba(95,34,29,.96)"],
  ] as const) {
    const sign = textPanel(label, "#e8eee5", color);
    sign.position.set(0, 3.82, z);
    sign.scale.set(0.66, 0.66, 0.66);
    root.add(sign);
  }

  const reception = hospitalReception(materials, 7.05, -12);
  reception.rotation.y = Math.PI / 2;
  root.add(reception);
  collisions.push({ x: 7.05, z: -12, radius: 1.05 });
  const startBed = hospitalBed(materials, -5.4, 1.8, Math.PI / 2 - 0.08);
  root.add(startBed);
  collisions.push({ x: -5.4, z: 1.8, radius: 1.25 });
  root.add(
    pharmacyShelf(materials, -7.65, -34.5, Math.PI / 2),
    pharmacyShelf(materials, 7.65, -38.2, -Math.PI / 2),
    fireExtinguisher(materials, -7.88, -16.2, Math.PI / 2),
    fireExtinguisher(materials, 7.88, -60.5, -Math.PI / 2),
  );
  collisions.push(
    { x: -7.1, z: -34.5, radius: 0.65 },
    { x: 7.1, z: -38.2, radius: 0.65 },
  );

  for (const side of [-1, 1]) {
    for (let z = 2; z >= -84; z -= 8.5) {
      box(
        root,
        [0.12, 0.11, 7.1],
        [side * 7.93, 1.02, z - 3.5],
        materials.paintedMetal,
      );
    }
  }

  for (const side of [-1, 1] as const) {
    for (let z = -5; z >= -78; z -= 11) {
      const frameX = side * 8.12;
      box(root, [0.22, 2.8, 2.5], [frameX, 1.4, z], materials.metal);
      const door = box(
        root,
        [0.13, 2.55, 1.14],
        [side * 7.94, 1.27, z + 0.6],
        materials.darkGreen,
        [0, side * (0.22 + ((Math.abs(z) % 3) * 0.08)), 0],
      );
      door.castShadow = true;
      const roomFloor = box(root, [5.2, 0.1, 7.8], [side * 10.65, -0.04, z], materials.concrete);
      roomFloor.receiveShadow = true;
      box(root, [0.24, 4.4, 7.8], [side * 13.2, 2.2, z], materials.concreteDark);
    }
  }

  const bedA = hospitalBed(materials, -5.3, -29, Math.PI / 2 + 0.1);
  root.add(bedA);
  collisions.push({ x: -5.3, z: -29, radius: 1.25 });
  const bedB = hospitalBed(materials, 5.4, -52, -Math.PI / 2 - 0.2);
  root.add(bedB);
  collisions.push({ x: 5.4, z: -52, radius: 1.25 });
  const bedC = hospitalBed(materials, -4.8, -67, Math.PI / 2 - 0.32);
  root.add(bedC);
  collisions.push({ x: -4.8, z: -67, radius: 1.25 });
  root.add(hospitalCart(materials, 5.7, -17));
  collisions.push({ x: 5.7, z: -17, radius: 0.7 });

  const monitors = [
    patientMonitor(materials, -6.15, -21, -Math.PI / 2),
    patientMonitor(materials, 5.85, -39, Math.PI / 2),
    patientMonitor(materials, -5.9, -72, -Math.PI / 2),
  ];
  for (const monitor of monitors) {
    root.add(monitor);
    collisions.push({
      x: monitor.position.x,
      z: monitor.position.z,
      radius: 0.72,
    });
  }

  for (const [x, z, rotation] of [
    [-4.8, -30.8, 0.2],
    [5.1, -50.1, -0.3],
    [-5.6, -64.7, 0.4],
    [6.2, -77.2, -0.2],
    [5.7, -7.8, 0.1],
  ] as const) {
    root.add(ivStand(materials, x, z, rotation));
  }

  for (const [x, z, rotation] of [
    [-6.7, -12.5, 0],
    [6.55, -34.5, 0.3],
    [-6.5, -57.2, -0.3],
    [6.4, -83.2, 0.2],
  ] as const) {
    root.add(oxygenTank(materials, x, z, rotation));
    collisions.push({ x, z, radius: 0.42 });
  }

  const wheelchairs = [
    wheelchair(materials, 5.45, -27.4, -Math.PI / 2 + 0.18),
    wheelchair(materials, -5.2, -47.5, Math.PI / 2 - 0.36),
  ];
  for (const chair of wheelchairs) {
    root.add(chair);
    collisions.push({
      x: chair.position.x,
      z: chair.position.z,
      radius: 0.88,
    });
  }

  const cabinets = [
    medicalCabinet(materials, -7.72, -18, Math.PI / 2),
    medicalCabinet(materials, 7.72, -41, -Math.PI / 2),
  ];
  for (const cabinet of cabinets) root.add(cabinet);

  root.add(operatingLamp(materials, -1.4, -63));
  root.add(liquidPuddle("#355f55", 2.5, -14, 3.3, 0.28));
  root.add(liquidPuddle("#6a201b", -1.7, -35, 2.5, -0.42));
  root.add(liquidPuddle("#4b6256", 3.5, -61.5, 3.7, 0.12));
  root.add(liquidPuddle("#671b18", -2.7, -76, 2.1, 0.7));

  const curtainMaterial = new THREE.MeshStandardMaterial({
    color: 0x789a8d,
    roughness: 0.96,
    transparent: true,
    opacity: 0.74,
    side: THREE.DoubleSide,
  });
  for (const [x, z, rotation] of [
    [-5.8, -37, 0.12],
    [5.8, -68, -0.16],
  ] as const) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.025, 8, 30, Math.PI * 1.35),
      materials.metal,
    );
    rail.position.set(x, 2.65, z);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = rotation;
    root.add(rail);
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 1.85, 12, 4),
      curtainMaterial,
    );
    const positions = curtain.geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      positions.setZ(vertex, Math.sin(positions.getX(vertex) * 13) * 0.055);
    }
    positions.needsUpdate = true;
    curtain.position.set(x, 1.72, z);
    curtain.rotation.y = Math.PI / 2 + rotation;
    curtain.castShadow = true;
    root.add(curtain);
  }

  for (const side of [-1, 1]) {
    for (let z = 1; z >= -86; z -= 18) {
      const pipeMaterial = side === -1 ? materials.metal : materials.rust;
      cylinder(
        root,
        [0.07, 0.07],
        15.5,
        [side * 7.55, 4.25, z - 7.4],
        pipeMaterial,
        [Math.PI / 2, 0, 0],
      );
      for (let offset = 0; offset < 3; offset += 1) {
        cylinder(
          root,
          [0.085, 0.085],
          0.7,
          [side * 7.55, 3.9, z - offset * 5],
          pipeMaterial,
        );
      }
    }
  }

  for (let i = 0; i < 34; i += 1) {
    const random = seededNoise(380 + i);
    const x = -6.8 + random() * 13.6;
    const z = -6 - random() * 78;
    if (i % 3 === 0) {
      cylinder(
        root,
        [0.035 + random() * 0.025, 0.035 + random() * 0.025],
        0.14 + random() * 0.22,
        [x, 0.05, z],
        i % 2 === 0 ? materials.white : materials.darkGreen,
        [Math.PI / 2, random() * Math.PI, 0],
      );
    } else {
      box(
        root,
        [0.08 + random() * 0.18, 0.025, 0.08 + random() * 0.24],
        [x, 0.04, z],
        i % 4 === 0 ? materials.red : materials.white,
        [0, random() * Math.PI, 0],
      );
    }
  }

  for (let i = 0; i < 44; i += 1) {
    const random = seededNoise(90 + i);
    const debris = box(
      root,
      [0.12 + random() * 0.42, 0.025 + random() * 0.05, 0.12 + random() * 0.42],
      [-6.8 + random() * 13.6, 0.04, -3 - random() * 82],
      i % 4 === 0 ? materials.rust : materials.concreteDark,
      [random() * 0.2, random() * Math.PI, random() * 0.2],
    );
    debris.castShadow = false;
  }

  const exitSign = textPanel("AMBULANCE EXIT", "#d9eadb", "rgba(28,74,54,.96)");
  exitSign.position.set(0, 4.12, -90.5);
  exitSign.scale.set(1.15, 1.15, 1);
  root.add(exitSign);
  const exitDoorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c4d3e,
    roughness: 0.62,
    metalness: 0.22,
  });
  for (const side of [-1, 1]) {
    roundedBox(
      root,
      [1.52, 3.52, 0.18],
      [side * 0.8, 1.76, -90.74],
      exitDoorMaterial,
      0.08,
    );
    roundedBox(
      root,
      [0.78, 1.35, 0.04],
      [side * 0.8, 2.25, -90.62],
      materials.glass,
      0.05,
    );
    cylinder(
      root,
      [0.035, 0.035],
      0.42,
      [side * 0.28, 1.68, -90.48],
      materials.metal,
      [Math.PI / 2, 0, 0],
      10,
    );
  }
  box(root, [0.08, 3.6, 0.25], [0, 1.8, -90.6], materials.metal);

  interactions.push(
    interactionObject(root, "torch", "Take torch", [1.4, 0, -10], createEquipmentModel("torch", 1)),
    interactionObject(root, "radio", "Check emergency radio", [-4.6, 0, -26], createEquipmentModel("radio", 1)),
    interactionObject(root, "axe", "Take fire axe", [4.7, 0, -45], createEquipmentModel("axe", 1)),
    interactionObject(root, "exit", "Open ambulance entrance", [0, 0, -87], new THREE.Group()),
  );

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(0, 0, 7),
    bounds: { minX: -7.55, maxX: 7.55, minZ: -88, maxZ: 8 },
  };
}

function buildStreet(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "street");

  box(root, [20, 0.24, 166], [0, -0.12, -68], materials.asphalt);
  box(root, [5, 0.34, 166], [-12.5, 0.02, -68], materials.concrete);
  box(root, [5, 0.34, 166], [12.5, 0.02, -68], materials.concrete);
  for (let z = 8; z >= -144; z -= 10) {
    box(root, [0.16, 0.025, 4.4], [0, 0.02, z], materials.yellow);
  }

  for (let z = 0; z >= -126; z -= 18) {
    addBuilding(root, materials, -18.4, z, 7, 10 + (Math.abs(z) % 4), 15, 1);
    addBuilding(root, materials, 18.4, z - 7, 7, 13 + (Math.abs(z) % 5), 15, -1);
    root.add(streetLight(materials, -9.2, z - 4, 1));
    root.add(streetLight(materials, 9.2, z - 12, -1));
  }

  for (const x of [-7.2, -4.8, -2.4, 2.4, 4.8, 7.2]) {
    box(root, [1.35, 0.03, 0.42], [x, 0.03, -38], materials.white);
  }
  root.add(
    trafficSignal(materials, -9.6, -39, 0),
    makeBusShelter(materials, 12.45, -25, Math.PI / 2),
    utilityPole(materials, -11.2, -14),
    utilityPole(materials, 11.4, -86, Math.PI),
  );
  for (const [x, z, rotation] of [
    [-5.8, -63, 0.12],
    [-4.7, -64.4, -0.3],
    [5.4, -91, 0.2],
    [6.2, -92.2, -0.16],
  ] as const) {
    root.add(roadCone(materials, x, z, rotation));
  }
  root.add(
    liquidPuddle("#1b2525", 3.6, -18.5, 2.7, -0.3),
    liquidPuddle("#4e1714", -1.8, -76, 1.5, 0.4),
  );

  const carA = makeCar(materials, materials.darkGreen, -4.8, -24, 0.2);
  root.add(carA);
  collisions.push({ x: -4.8, z: -24, radius: 2.3 });
  const carB = makeCar(materials, materials.rust, 4.6, -54, -0.28);
  root.add(carB);
  collisions.push({ x: 4.6, z: -54, radius: 2.3 });
  const carC = makeCar(materials, materials.white, -4.2, -70, 0.48);
  roundedBox(carC, [0.92, 0.12, 0.28], [0, 1.68, -0.28], materials.metal, 0.04);
  roundedBox(
    carC,
    [0.36, 0.1, 0.22],
    [-0.25, 1.76, -0.28],
    new THREE.MeshStandardMaterial({
      color: 0x263e93,
      emissive: 0x183eaa,
      emissiveIntensity: 1.4,
    }),
    0.035,
  );
  roundedBox(
    carC,
    [0.36, 0.1, 0.22],
    [0.25, 1.76, -0.28],
    new THREE.MeshStandardMaterial({
      color: 0x9b231d,
      emissive: 0xb42a22,
      emissiveIntensity: 1.4,
    }),
    0.035,
  );
  root.add(carC);
  collisions.push({ x: -4.2, z: -70, radius: 2.3 });
  const bus = makeBus(materials, 4.8, -105, -0.12);
  root.add(bus);
  collisions.push({ x: 4.8, z: -105, radius: 4.7 });
  const barrier = makeBarrier(materials, -2, -67, 0.14);
  root.add(barrier);
  collisions.push({ x: -2, z: -67, radius: 1.8 });

  const policeSign = textPanel("MERCY DISTRICT POLICE", "#d6e3df", "rgba(24,43,51,.94)");
  policeSign.rotation.y = Math.PI / 2;
  policeSign.position.set(-14.92, 3.6, -48);
  root.add(policeSign);

  const overpass = new THREE.Group();
  overpass.position.set(0, 0, -139);
  for (const side of [-1, 1]) {
    box(overpass, [4.2, 5.6, 3.8], [side * 9.8, 2.8, 0], materials.concreteDark);
    box(overpass, [3.4, 1.2, 1.2], [side * 7.3, 4.8, 0], materials.concreteDark, [0, 0, side * 0.38]);
  }
  box(overpass, [15, 1.05, 3.8], [0, 5.15, 0], materials.concreteDark);
  const tunnelSign = textPanel("NORTHLINE  4 KM", "#e7e6d9", "rgba(31,52,43,.96)");
  tunnelSign.position.set(0, 4.25, 1.96);
  tunnelSign.scale.set(0.92, 0.92, 0.92);
  overpass.add(tunnelSign);
  const tunnelDark = new THREE.Mesh(
    new THREE.PlaneGeometry(14.2, 4.35),
    new THREE.MeshBasicMaterial({ color: 0x050807, side: THREE.DoubleSide }),
  );
  tunnelDark.position.set(0, 2.2, -2.05);
  overpass.add(tunnelDark);
  root.add(overpass);

  interactions.push(
    interactionObject(root, "signal", "Tune the radio signal", [0.8, 0, -18], createEquipmentModel("radio", 1)),
    interactionObject(root, "maya", "Help the trapped survivor", [6.8, 0, -44], createEquipmentModel("medkit", 0.9)),
    interactionObject(root, "pistol", "Search the police cruiser", [-4.2, 0, -70], createEquipmentModel("pistol", 1.1)),
  );
  const bike = makeMotorcycle(materials, 0, -116);
  root.add(bike);
  interactions.push(interactionObject(root, "bike", "Start motorcycle", [0, 0, -113], new THREE.Group()));

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(0, 0, 7),
    bounds: { minX: -9.2, maxX: 9.2, minZ: -120, maxZ: 8 },
  };
}

function buildStation(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "station");

  box(root, [38, 0.24, 112], [0, -0.12, -46], materials.asphalt);
  box(root, [25, 0.26, 20], [0, 0, -79], materials.concrete);
  box(root, [23, 0.24, 11], [0, 4.55, -83], materials.concreteDark);
  box(root, [23, 4.6, 0.34], [0, 2.3, -88.45], materials.brick);
  box(root, [0.34, 4.6, 11], [-11.45, 2.3, -83], materials.brick);
  box(root, [0.34, 4.6, 11], [11.45, 2.3, -83], materials.brick);
  for (const x of [-8.4, -5.6, -2.8, 2.8, 5.6, 8.4]) {
    box(root, [2.45, 3.1, 0.1], [x, 1.55, -77.48], materials.glass);
  }
  for (const x of [-1.12, 1.12]) {
    roundedBox(root, [2.1, 3.2, 0.14], [x, 1.6, -77.45], materials.glass, 0.06);
    cylinder(root, [0.035, 0.035], 0.55, [x + (x < 0 ? 0.72 : -0.72), 1.55, -77.28], materials.metal);
  }
  const stationSign = textPanel("NORTHLINE", "#f4d8af", "rgba(91,33,24,.96)");
  stationSign.position.set(0, 4.02, -77.32);
  stationSign.scale.set(1.6, 1.2, 1);
  root.add(stationSign);

  roundedBox(root, [26, 0.46, 12], [0, 5.15, -35], materials.white, 0.13);
  box(root, [26.2, 0.65, 0.28], [0, 4.92, -29.08], materials.red);
  box(root, [26.2, 0.65, 0.28], [0, 4.92, -40.92], materials.red);
  for (const x of [-10.5, 10.5]) {
    for (const z of [-39.2, -30.8]) {
      cylinder(root, [0.23, 0.23], 5.1, [x, 2.55, z], materials.metal);
    }
  }
  for (const x of [-6, 0, 6]) {
    const pump = makePump(materials, x, -35, String((x + 8) / 2).padStart(2, "0"));
    root.add(pump);
    collisions.push({ x, z: -35, radius: 0.95 });
    const canopyLight = new THREE.PointLight(0xffe0b7, 3.2, 14, 2);
    canopyLight.position.set(x, 4.78, -35);
    root.add(canopyLight);
  }

  for (const [x, z, rotation] of [
    [-7.5, -82.1, 0],
    [0, -84.9, Math.PI],
    [7.5, -82.1, 0],
  ] as const) {
    root.add(pharmacyShelf(materials, x, z, rotation));
    collisions.push({ x, z, radius: 1.35 });
  }
  const shopCounter = hospitalReception(materials, -7.8, -86.8);
  shopCounter.scale.set(0.78, 0.78, 0.78);
  root.add(shopCounter);
  collisions.push({ x: -7.8, z: -86.2, radius: 1.6 });
  for (const x of [4.8, 7.1, 9.4]) {
    roundedBox(root, [1.9, 2.7, 0.72], [x, 1.35, -87.9], materials.white, 0.08);
    roundedBox(root, [1.62, 2.2, 0.055], [x, 1.45, -87.5], materials.glass, 0.04);
  }
  root.add(
    roadCone(materials, -3.6, -42, 0.2),
    roadCone(materials, -2.8, -44, -0.18),
    liquidPuddle("#221d19", 7.8, -53, 3.1, 0.18),
    shippingCrate(materials, 7.4, -69, -0.14, 0.8),
  );
  collisions.push({ x: 7.4, z: -69, radius: 0.7 });

  const tanker = new THREE.Group();
  tanker.position.set(-12.5, 0, -64);
  tanker.rotation.y = 0.18;
  cylinder(tanker, [1.55, 1.55], 8.2, [0, 2.15, 0], materials.white, [Math.PI / 2, 0, 0], 24);
  box(tanker, [2.8, 2.6, 2.6], [0, 1.5, 5.1], materials.rust);
  for (const z of [-2.6, 2.4, 4.9]) {
    for (const x of [-1.55, 1.55]) {
      cylinder(tanker, [0.48, 0.48], 0.3, [x, 0.5, z], materials.rubber, [0, 0, Math.PI / 2], 20);
    }
  }
  root.add(tanker);
  collisions.push({ x: -12.5, z: -64, radius: 4.8 });

  const generator = new THREE.Group();
  generator.position.set(9, 0, -62);
  box(generator, [1.7, 1.1, 1.1], [0, 0.63, 0], materials.darkGreen);
  cylinder(generator, [0.28, 0.28], 1.2, [-0.72, 0.32, 0], materials.rubber, [Math.PI / 2, 0, 0]);
  box(generator, [1.1, 0.48, 0.05], [0.2, 0.68, 0.58], materials.metal);
  root.add(generator);
  collisions.push({ x: 9, z: -62, radius: 1.3 });

  for (const x of [-16.5, 16.5]) {
    root.add(streetLight(materials, x, -15, x < 0 ? 1 : -1));
    root.add(streetLight(materials, x, -57, x < 0 ? 1 : -1));
  }

  interactions.push(
    interactionObject(root, "generator", "Start backup generator", [9, 0, -59.5], createEquipmentModel("fuel", 0.8)),
    interactionObject(root, "meds", "Take medical supplies", [-7, 0, -72], createEquipmentModel("medkit", 0.9)),
  );
  const bike = makeMotorcycle(materials, 0, -7.5, Math.PI);
  root.add(bike);
  interactions.push(interactionObject(root, "bike", "Ride to Blackwood checkpoint", [0, 0, -9.8], new THREE.Group()));

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(1.7, 0, -6.4),
    bounds: { minX: -17.5, maxX: 17.5, minZ: -87.2, maxZ: 8 },
  };
}

function sandbagWall(
  materials: MaterialSet,
  x: number,
  z: number,
  rotation = 0,
  length = 5,
) {
  const wall = new THREE.Group();
  wall.position.set(x, 0, z);
  wall.rotation.y = rotation;
  const sand = new THREE.MeshStandardMaterial({
    color: 0x77725d,
    roughness: 1,
  });
  for (let row = 0; row < 3; row += 1) {
    const count = Math.max(2, length - row);
    for (let index = 0; index < count; index += 1) {
      const bag = roundedBox(
        wall,
        [0.92, 0.26, 0.46],
        [
          (index - (count - 1) / 2) * 0.86,
          0.14 + row * 0.24,
          (row % 2) * 0.08,
        ],
        sand,
        0.12,
      );
      bag.rotation.y = ((index + row) % 3 - 1) * 0.035;
    }
  }
  return wall;
}

function toolBench(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  roundedBox(bench, [2.5, 0.18, 0.85], [0, 1.02, 0], materials.metal, 0.06);
  for (const side of [-1, 1]) {
    cylinder(bench, [0.055, 0.055], 1.02, [side * 1.05, 0.52, -0.3], materials.metal);
    cylinder(bench, [0.055, 0.055], 1.02, [side * 1.05, 0.52, 0.3], materials.metal);
  }
  box(bench, [2.35, 1.55, 0.09], [0, 1.82, 0.34], materials.paintedMetal);
  for (let index = 0; index < 7; index += 1) {
    const tool = box(
      bench,
      [0.05, 0.48 - (index % 3) * 0.08, 0.05],
      [-0.88 + index * 0.29, 1.82, 0.4],
      index % 2 === 0 ? materials.yellow : materials.rust,
      [0, 0, (index % 2 === 0 ? 1 : -1) * 0.18],
    );
    tool.castShadow = false;
  }
  return bench;
}

function makeForklift(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const lift = new THREE.Group();
  lift.position.set(x, 0, z);
  lift.rotation.y = rotation;
  roundedBox(lift, [1.55, 0.72, 2.15], [0, 0.67, 0], materials.yellow, 0.16);
  roundedBox(lift, [1.15, 0.85, 0.9], [0, 1.35, 0.34], materials.darkGreen, 0.1);
  for (const side of [-1, 1]) {
    cylinder(lift, [0.31, 0.31], 0.22, [side * 0.77, 0.36, -0.62], materials.rubber, [0, 0, Math.PI / 2], 18);
    cylinder(lift, [0.24, 0.24], 0.22, [side * 0.77, 0.31, 0.69], materials.rubber, [0, 0, Math.PI / 2], 18);
    cylinder(lift, [0.055, 0.055], 2.65, [side * 0.52, 1.55, -1.22], materials.metal);
    box(lift, [0.12, 0.08, 2.25], [side * 0.48, 0.15, -2.1], materials.metal);
  }
  box(lift, [1.35, 0.13, 0.18], [0, 2.82, -1.22], materials.metal);
  return lift;
}

function buildCheckpoint(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "checkpoint");

  box(root, [24, 0.22, 122], [0, -0.11, -49], materials.asphalt);
  box(root, [13, 0.12, 122], [-18.5, -0.06, -49], materials.concreteDark);
  box(root, [13, 0.12, 122], [18.5, -0.06, -49], materials.concreteDark);
  for (let z = 8; z >= -104; z -= 10) {
    box(root, [0.14, 0.025, 4.2], [0, 0.025, z], materials.yellow);
  }

  const arrivalBike = makeMotorcycle(materials, -2.1, 4.1, Math.PI);
  root.add(arrivalBike);
  for (let z = 5; z >= -101; z -= 8.5) {
    for (const side of [-1, 1]) {
      cylinder(
        root,
        [0.065, 0.085],
        3,
        [side * 12.8, 1.5, z],
        materials.metal,
        [0, 0, 0],
        10,
      );
      for (const y of [0.65, 1.38, 2.12]) {
        cylinder(
          root,
          [0.018, 0.018],
          8.45,
          [side * 12.8, y, z - 4.15],
          materials.metal,
          [Math.PI / 2, 0, 0],
          7,
        );
      }
    }
  }

  root.add(
    sandbagWall(materials, -7.2, -33, 0.18, 7),
    sandbagWall(materials, 7.4, -33, -0.16, 7),
    makeFieldTent(materials, -8.6, -45, Math.PI / 2 + 0.12),
    makeWatchTower(materials, 9.4, -58),
  );
  collisions.push(
    { x: -7.2, z: -33, radius: 2.7 },
    { x: 7.4, z: -33, radius: 2.7 },
    { x: -8.6, z: -45, radius: 3.2 },
    { x: 9.4, z: -58, radius: 2.1 },
  );

  const commandSign = textPanel(
    "BLACKWOOD EVACUATION CONTROL",
    "#e1e5dc",
    "rgba(40,54,50,.97)",
  );
  commandSign.position.set(-8.45, 3.45, -42);
  commandSign.rotation.y = Math.PI / 2;
  commandSign.scale.set(0.82, 0.82, 0.82);
  root.add(commandSign);

  const ambulance = makeCar(materials, materials.white, 5.2, -49, -0.28);
  ambulance.scale.set(1.08, 1.28, 1.18);
  roundedBox(ambulance, [1.05, 0.14, 0.3], [0, 1.74, -0.18], materials.red, 0.04);
  root.add(ambulance);
  collisions.push({ x: 5.2, z: -49, radius: 2.7 });

  const gateGenerator = new THREE.Group();
  gateGenerator.position.set(-8.4, 0, -67);
  roundedBox(gateGenerator, [2.15, 1.35, 1.3], [0, 0.72, 0], materials.darkGreen, 0.12);
  for (const side of [-1, 1]) {
    cylinder(gateGenerator, [0.3, 0.3], 0.24, [side * 0.88, 0.32, 0], materials.rubber, [Math.PI / 2, 0, 0], 18);
  }
  box(gateGenerator, [1.18, 0.54, 0.06], [0.2, 0.76, 0.68], materials.metal);
  root.add(gateGenerator);
  collisions.push({ x: -8.4, z: -67, radius: 1.5 });

  for (const x of [-9.3, 9.3]) {
    roundedBox(root, [3.7, 3.2, 4.8], [x, 1.6, -91], materials.brick, 0.08);
    roundedBox(root, [2.6, 1.2, 0.06], [x, 2.05, -88.55], materials.glass, 0.04);
    root.add(streetLight(materials, x < 0 ? -5.4 : 5.4, -85, x < 0 ? 1 : -1));
    collisions.push({ x, z: -91, radius: 2.6 });
  }
  for (const x of [-6.1, 6.1]) {
    cylinder(root, [0.13, 0.17], 4.4, [x, 2.2, -88.8], materials.metal, [0, 0, 0], 12);
  }
  box(root, [12.4, 0.34, 0.34], [0, 4.25, -88.8], materials.metal);
  const gateSign = textPanel("HAVEN ROUTE 9 · NORTH", "#e9e4d2", "rgba(62,50,34,.97)");
  gateSign.position.set(0, 3.68, -88.55);
  gateSign.scale.set(0.94, 0.94, 0.94);
  root.add(gateSign);
  const gateArm = makeBarrier(materials, 0, -86.8, 0);
  gateArm.scale.x = 1.65;
  root.add(gateArm);
  collisions.push({ x: 0, z: -86.8, radius: 2.5 });

  for (const [x, z, rotation] of [
    [-4.8, -24, 0.2],
    [5.1, -25.2, -0.18],
    [-6.2, -75, 0.35],
    [6.4, -78, -0.24],
  ] as const) {
    root.add(roadCone(materials, x, z, rotation));
  }
  root.add(
    liquidPuddle("#4f1210", 1.8, -55, 1.6, 0.4),
    shippingCrate(materials, -8.8, -53, 0.08),
    shippingCrate(materials, -6.9, -53.4, -0.15, 0.82),
  );

  interactions.push(
    interactionObject(
      root,
      "checkpoint-radio",
      "Play the final dispatch log",
      [-8.4, 0, -42],
      createEquipmentModel("radio", 0.9),
    ),
    interactionObject(
      root,
      "fuse",
      "Install the gate fuse",
      [-8.4, 0, -64.8],
      createEquipmentModel("fuel", 0.68),
    ),
    interactionObject(
      root,
      "checkpoint-gate",
      "Raise the north gate",
      [0, 0, -84.2],
      new THREE.Group(),
    ),
  );

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(1.2, 0, 3.6),
    bounds: { minX: -11.8, maxX: 11.8, minZ: -84.5, maxZ: 8 },
  };
}

function buildDepot(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "depot");

  box(root, [36, 0.22, 116], [0, -0.11, -49], materials.concrete);
  box(root, [0.45, 8.2, 116], [-18, 4.1, -49], materials.brick);
  box(root, [0.45, 8.2, 116], [18, 4.1, -49], materials.brick);
  box(root, [36, 8.2, 0.45], [0, 4.1, -107], materials.brick);
  box(root, [36, 0.32, 116], [0, 8.05, -49], materials.concreteDark);
  for (let z = 4; z >= -102; z -= 12) {
    for (const x of [-9, 0, 9]) {
      const light = new THREE.PointLight(0xd7e8d8, z < -45 ? 1.2 : 2.6, 15, 2);
      light.position.set(x, 7.5, z);
      light.userData.baseIntensity = z < -45 ? 1.2 : 2.6;
      light.userData.flicker = true;
      root.add(light);
      roundedBox(
        root,
        [3.6, 0.12, 0.55],
        [x, 7.82, z],
        new THREE.MeshStandardMaterial({
          color: 0xdce8dc,
          emissive: 0xc9ddcc,
          emissiveIntensity: z < -45 ? 1.1 : 2.8,
        }),
        0.04,
      );
    }
    box(root, [35.4, 0.24, 0.34], [0, 7.72, z - 5.8], materials.metal);
  }

  const arrivalBike = makeMotorcycle(materials, -2, 4.2, Math.PI);
  root.add(arrivalBike);
  const office = new THREE.Group();
  office.position.set(-12.6, 0, -17);
  box(office, [8, 3.8, 8], [0, 1.9, 0], materials.brick);
  for (const localZ of [-2, 0, 2]) {
    roundedBox(office, [0.06, 1.45, 1.3], [4.04, 2.05, localZ], materials.glass, 0.035);
  }
  roundedBox(office, [0.08, 2.35, 1.2], [4.05, 1.2, 3], materials.darkGreen, 0.045);
  const officeSign = textPanel("FOREMAN · BAY CONTROL", "#e5e4d8", "rgba(45,55,51,.97)");
  officeSign.rotation.y = -Math.PI / 2;
  officeSign.position.set(4.1, 3.25, 0);
  officeSign.scale.set(0.56, 0.56, 0.56);
  office.add(officeSign);
  root.add(office);
  collisions.push({ x: -12.6, z: -17, radius: 4.2 });

  const servicePit = roundedBox(
    root,
    [4.5, 0.06, 15],
    [0, 0.015, -50],
    new THREE.MeshBasicMaterial({ color: 0x050706 }),
    0.04,
  );
  servicePit.receiveShadow = false;
  for (const side of [-1, 1]) {
    box(root, [0.22, 0.25, 15.2], [side * 2.35, 0.12, -50], materials.yellow);
    cylinder(root, [0.045, 0.045], 15, [side * 2.72, 0.72, -50], materials.metal, [Math.PI / 2, 0, 0], 8);
  }
  collisions.push({ x: 0, z: -50, radius: 2.2 });

  root.add(
    toolBench(materials, 12.8, -27, -Math.PI / 2),
    toolBench(materials, -12.8, -47, Math.PI / 2),
    makeForklift(materials, 10.8, -64, -0.28),
    shippingCrate(materials, -11.5, -34, 0.1),
    shippingCrate(materials, -13.2, -35.4, -0.18, 0.84),
    liquidPuddle("#171817", 7.4, -43, 3.8, -0.2),
    liquidPuddle("#59100d", -5.8, -70, 1.7, 0.44),
  );
  collisions.push(
    { x: 12.8, z: -27, radius: 1.45 },
    { x: -12.8, z: -47, radius: 1.45 },
    { x: 10.8, z: -64, radius: 1.8 },
    { x: -11.8, z: -34.4, radius: 1.4 },
  );

  const dormantBusLeft = makeBus(materials, -9.2, -80, 0);
  dormantBusLeft.rotation.z = -0.035;
  root.add(dormantBusLeft);
  collisions.push({ x: -9.2, z: -80, radius: 4.8 });
  const escapeBus = makeBus(materials, 6.5, -91, 0);
  const routeDisplay = textPanel("HAVEN  ·  ROUTE 9", "#efdda7", "rgba(19,29,25,.98)");
  routeDisplay.scale.set(0.54, 0.34, 0.54);
  routeDisplay.position.set(0, 2.72, -4.48);
  escapeBus.add(routeDisplay);
  root.add(escapeBus);
  collisions.push({ x: 6.5, z: -91, radius: 4.8 });

  for (const [x, z] of [
    [-14.8, -60],
    [14.8, -42],
    [-14.8, -92],
    [14.8, -80],
  ] as const) {
    root.add(fireExtinguisher(materials, x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2));
  }

  interactions.push(
    interactionObject(
      root,
      "depot-key",
      "Take the foreman's key",
      [-8.7, 0, -16],
      createEquipmentModel("radio", 0.72),
    ),
    interactionObject(
      root,
      "battery",
      "Lift the charged bus battery",
      [12.4, 0, -28.4],
      createEquipmentModel("fuel", 0.82),
    ),
    interactionObject(
      root,
      "bus",
      "Board the Route 9 evacuation bus",
      [6.5, 0, -85.7],
      new THREE.Group(),
    ),
  );

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(1.2, 0, 3.4),
    bounds: { minX: -16.8, maxX: 16.8, minZ: -102, maxZ: 8 },
  };
}

function buildEscape(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "escape");

  box(root, [18, 0.24, 190], [0, -0.12, -86], materials.asphalt);
  box(root, [16, 0.16, 190], [-17, -0.08, -86], materials.concreteDark);
  box(root, [16, 0.16, 190], [17, -0.08, -86], materials.concreteDark);
  for (let z = 8; z >= -176; z -= 11) {
    box(root, [0.15, 0.025, 4.6], [0, 0.02, z], materials.yellow);
  }
  const convoyBus = makeBus(materials, 0, 14.2, 0);
  const convoyRoute = textPanel("HAVEN · ROUTE 9", "#efdda7", "rgba(19,29,25,.98)");
  convoyRoute.scale.set(0.54, 0.34, 0.54);
  convoyRoute.position.set(0, 2.72, -4.48);
  convoyBus.add(convoyRoute);
  root.add(convoyBus);

  const routeSign = textPanel("HAVEN  5 KM", "#e4e6dd", "rgba(33,58,47,.97)");
  routeSign.position.set(-6.9, 3.3, -12);
  routeSign.rotation.y = Math.PI / 2;
  routeSign.scale.set(0.82, 0.82, 0.82);
  root.add(routeSign);
  for (let z = -18; z >= -162; z -= 24) {
    for (const side of [-1, 1]) {
      box(root, [0.18, 0.42, 18], [side * 8.75, 0.65, z - 8.8], materials.metal);
      for (let post = 0; post < 4; post += 1) {
        cylinder(
          root,
          [0.055, 0.075],
          1.25,
          [side * 8.75, 0.44, z - post * 5.4],
          materials.metal,
          [0, 0, 0],
          8,
        );
      }
    }
  }
  for (let z = 5; z >= -174; z -= 15) {
    root.add(makeTree(materials, -12 - ((Math.abs(z) / 15) % 3) * 2.1, z, 0.8 + (Math.abs(z) % 4) * 0.08));
    root.add(makeTree(materials, 12 + ((Math.abs(z) / 15) % 4) * 1.7, z - 6, 0.75 + (Math.abs(z) % 5) * 0.06));
  }
  const carA = makeCar(materials, materials.rust, -4.7, -45, 0.42);
  root.add(carA);
  collisions.push({ x: -4.7, z: -45, radius: 2.4 });
  const carB = makeCar(materials, materials.darkGreen, 4.6, -92, -0.36);
  root.add(carB);
  collisions.push({ x: 4.6, z: -92, radius: 2.4 });
  const barrier = makeBarrier(materials, -2.7, -123, -0.18);
  root.add(barrier);
  collisions.push({ x: -2.7, z: -123, radius: 1.8 });
  const bus = makeBus(materials, 4.6, -153, 0.1);
  root.add(bus);
  collisions.push({ x: 4.6, z: -153, radius: 4.7 });

  root.add(
    utilityPole(materials, -12.2, -34),
    utilityPole(materials, 12.4, -84, Math.PI),
    utilityPole(materials, -12.8, -136),
    liquidPuddle("#29130f", 2.7, -118, 2.4, 0.4),
  );

  for (const x of [-6.1, 6.1]) {
    cylinder(root, [0.14, 0.18], 6.2, [x, 3.1, -178], materials.metal, [0, 0, 0], 12);
  }
  box(root, [12.4, 0.38, 0.38], [0, 5.85, -178], materials.metal);
  box(root, [14.5, 4.8, 0.6], [0, 2.4, -181], materials.concreteDark);
  const havenGate = textPanel("HAVEN NORTHERN GATE", "#e4eae2", "rgba(25,49,42,.98)");
  havenGate.position.set(0, 5.2, -177.65);
  havenGate.scale.set(1.22, 1, 1);
  root.add(havenGate);
  for (const x of [-5.5, 5.5]) {
    const flood = new THREE.SpotLight(0xdce8dc, 9, 44, Math.PI / 5, 0.46, 1.3);
    flood.position.set(x, 5.7, -177.4);
    flood.target.position.set(x * 0.35, 0, -154);
    flood.castShadow = false;
    root.add(flood, flood.target);
  }

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(1.6, 0, 6.4),
    bounds: { minX: -8.1, maxX: 8.1, minZ: -174, maxZ: 8 },
  };
}

function makeFieldTent(
  materials: MaterialSet,
  x: number,
  z: number,
  rotation = 0,
) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rotation;
  const canvas = new THREE.Mesh(
    new THREE.ConeGeometry(3.25, 3.35, 4),
    materials.fabric,
  );
  canvas.position.y = 1.62;
  canvas.rotation.y = Math.PI / 4;
  canvas.scale.z = 1.48;
  canvas.castShadow = true;
  canvas.receiveShadow = true;
  root.add(canvas);
  box(
    root,
    [0.9, 1.9, 0.04],
    [-0.5, 0.98, 2.32],
    materials.darkGreen,
    [0, 0, 0.16],
  );
  box(
    root,
    [0.9, 1.9, 0.04],
    [0.5, 0.98, 2.32],
    materials.darkGreen,
    [0, 0, -0.16],
  );
  for (const side of [-1, 1]) {
    cylinder(
      root,
      [0.035, 0.035],
      3.4,
      [side * 2.36, 1.55, 0],
      materials.metal,
    );
  }
  return root;
}

function makeWatchTower(materials: MaterialSet, x: number, z: number) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  for (const px of [-1.05, 1.05]) {
    for (const pz of [-1.05, 1.05]) {
      cylinder(
        root,
        [0.09, 0.12],
        5.2,
        [px, 2.6, pz],
        materials.metal,
        [0, 0, 0],
        10,
      );
    }
  }
  box(root, [2.75, 0.2, 2.75], [0, 4.75, 0], materials.metal);
  box(root, [2.55, 1.15, 0.08], [0, 5.38, -1.28], materials.darkGreen);
  box(root, [0.08, 1.15, 2.55], [-1.28, 5.38, 0], materials.darkGreen);
  box(root, [0.08, 1.15, 2.55], [1.28, 5.38, 0], materials.darkGreen);
  box(root, [2.9, 0.16, 2.9], [0, 6.05, 0], materials.concreteDark);
  for (let rung = 0; rung < 9; rung += 1) {
    cylinder(
      root,
      [0.035, 0.035],
      1.15,
      [1.33, 0.55 + rung * 0.48, 1.24],
      materials.metal,
      [0, 0, Math.PI / 2],
      8,
    );
  }
  const flood = new THREE.SpotLight(
    0xdde8d1,
    7.5,
    42,
    Math.PI / 5,
    0.55,
    1.4,
  );
  flood.position.set(0, 5.75, 0);
  flood.target.position.set(-x * 0.4, 0, -z * 0.3);
  flood.castShadow = false;
  root.add(flood, flood.target);
  return root;
}

function buildSurvival(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "survival");

  box(root, [46, 0.18, 92], [0, -0.12, -38], materials.concreteDark);
  box(root, [12, 0.12, 92], [0, 0, -38], materials.asphalt);
  for (let z = 4; z >= -80; z -= 9) {
    box(root, [0.13, 0.02, 3.6], [0, 0.07, z], materials.yellow);
  }

  for (const side of [-1, 1]) {
    const fenceX = side * 21.8;
    for (let z = 5; z >= -79; z -= 4.2) {
      cylinder(
        root,
        [0.055, 0.075],
        2.8,
        [fenceX, 1.4, z],
        materials.metal,
        [0, 0, 0],
        8,
      );
      for (const y of [0.65, 1.35, 2.08]) {
        cylinder(
          root,
          [0.018, 0.018],
          4.25,
          [fenceX, y, z - 2.05],
          materials.metal,
          [Math.PI / 2, 0, 0],
          6,
        );
      }
    }
  }

  for (let z = 2; z >= -78; z -= 11) {
    root.add(
      makeTree(
        materials,
        -27 - (Math.abs(z) % 5),
        z,
        0.8 + (Math.abs(z) % 3) * 0.12,
      ),
    );
    root.add(
      makeTree(
        materials,
        27 + (Math.abs(z) % 4),
        z - 4,
        0.86 + (Math.abs(z) % 4) * 0.08,
      ),
    );
  }

  root.add(
    makeFieldTent(materials, -13, -14, 0.16),
    makeFieldTent(materials, 13.5, -23, -0.2),
  );
  collisions.push(
    { x: -13, z: -14, radius: 3.2 },
    { x: 13.5, z: -23, radius: 3.2 },
  );

  root.add(
    makeWatchTower(materials, -17.5, -65),
    makeWatchTower(materials, 17.5, -65),
  );
  collisions.push(
    { x: -17.5, z: -65, radius: 2 },
    { x: 17.5, z: -65, radius: 2 },
  );

  root.add(
    makeCar(
      materials,
      materials.white,
      -11.5,
      -45,
      Math.PI / 2 + 0.1,
    ),
    makeCar(
      materials,
      materials.rust,
      10.5,
      -56,
      -Math.PI / 2 - 0.25,
    ),
  );
  collisions.push(
    { x: -11.5, z: -45, radius: 2.5 },
    { x: 10.5, z: -56, radius: 2.5 },
  );

  for (const [x, z] of [
    [-6, -32],
    [7, -37],
    [-7, -71],
    [7, -75],
  ] as Array<[number, number]>) {
    root.add(makeBarrier(materials, x, z, x < 0 ? 0.12 : -0.12));
    collisions.push({ x, z, radius: 1.65 });
  }

  root.add(
    hospitalBed(materials, -14.5, -31, Math.PI / 2),
    hospitalCart(materials, -17, -34),
  );
  collisions.push(
    { x: -14.5, z: -31, radius: 1.45 },
    { x: -17, z: -34, radius: 0.75 },
  );

  for (const x of [-16, 16]) {
    root.add(streetLight(materials, x, -5, x < 0 ? 1 : -1));
    root.add(streetLight(materials, x, -48, x < 0 ? 1 : -1));
  }

  const sign = textPanel(
    "HAVEN NIGHT WATCH",
    "#dbe7d8",
    "rgba(22,43,38,.96)",
  );
  sign.position.set(0, 4.1, -79.4);
  sign.scale.set(1.45, 1.15, 1);
  root.add(sign);
  for (const x of [-5.8, 5.8]) {
    cylinder(
      root,
      [0.11, 0.13],
      5.1,
      [x, 2.5, -79.6],
      materials.metal,
      [0, 0, 0],
      10,
    );
  }

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(0, 0, -12),
    bounds: { minX: -20.5, maxX: 20.5, minZ: -77, maxZ: 5 },
  };
}

export function buildWorld(chapter: GameChapter): BuiltWorld {
  const materials = createMaterials();
  const built =
    chapter === "hospital"
      ? buildHospital(materials)
      : chapter === "street"
        ? buildStreet(materials)
        : chapter === "station"
          ? buildStation(materials)
          : chapter === "checkpoint"
            ? buildCheckpoint(materials)
            : chapter === "depot"
              ? buildDepot(materials)
              : chapter === "escape"
                ? buildEscape(materials)
                : buildSurvival(materials);
  return built;
}

export function disposeWorld(world: BuiltWorld) {
  world.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}
