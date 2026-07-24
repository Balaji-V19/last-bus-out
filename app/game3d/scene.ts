import * as THREE from "three";

export type GameChapter = "hospital" | "street" | "station" | "escape";
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
  box(car, [1.9, 0.55, 4.2], [0, 0.66, 0], color);
  box(car, [1.62, 0.62, 2.05], [0, 1.17, -0.25], color);
  box(car, [1.5, 0.47, 0.08], [0, 1.25, -1.32], materials.glass, [-0.18, 0, 0]);
  box(car, [1.5, 0.47, 0.08], [0, 1.25, 0.83], materials.glass, [0.18, 0, 0]);
  for (const px of [-0.98, 0.98]) {
    for (const pz of [-1.36, 1.36]) {
      cylinder(
        car,
        [0.36, 0.36],
        0.24,
        [px, 0.4, pz],
        materials.rubber,
        [0, 0, Math.PI / 2],
        18,
      );
    }
  }
  return car;
}

function makeBus(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const bus = new THREE.Group();
  bus.position.set(x, 0, z);
  bus.rotation.y = rotation;
  box(bus, [2.55, 2.75, 8.7], [0, 1.6, 0], materials.rust);
  for (const side of [-1, 1]) {
    for (let p = -3.25; p <= 3.25; p += 1.3) {
      box(bus, [0.05, 0.72, 0.88], [side * 1.29, 2.06, p], materials.glass);
    }
  }
  for (const px of [-1.3, 1.3]) {
    for (const pz of [-2.75, 2.75]) {
      cylinder(
        bus,
        [0.48, 0.48],
        0.3,
        [px, 0.52, pz],
        materials.rubber,
        [0, 0, Math.PI / 2],
        20,
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
  box(building, [width, height, depth], [0, height / 2, 0], materials.concreteDark);
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
      box(building, [0.035, 0.92, 1.18], [faceX, y, p], windowMaterial);
    }
  }
  parent.add(building);
  return building;
}

function makePump(materials: MaterialSet, x: number, z: number, number: string) {
  const pump = new THREE.Group();
  pump.position.set(x, 0, z);
  box(pump, [1.05, 1.95, 0.72], [0, 1, 0], materials.white);
  box(pump, [0.82, 0.5, 0.05], [0, 1.45, 0.39], materials.glass);
  box(pump, [0.76, 0.19, 0.05], [0, 1.05, 0.39], materials.red);
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
  }
  box(bike, [0.25, 0.2, 1.25], [0, 0.84, 0], materials.red, [0.08, 0, 0]);
  cylinder(bike, [0.19, 0.19], 0.42, [0, 0.76, -0.2], materials.metal, [Math.PI / 2, 0, 0]);
  box(bike, [0.48, 0.18, 0.72], [0, 1.03, 0.18], materials.rubber);
  cylinder(bike, [0.035, 0.035], 0.92, [0, 0.85, 0.68], materials.metal, [0.56, 0, 0]);
  box(bike, [0.85, 0.06, 0.06], [0, 1.22, 0.98], materials.metal);
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
  cylinder(tree, [0.18 * scale, 0.28 * scale], 3.8 * scale, [0, 1.9 * scale, 0], materials.rust);
  const foliage = new THREE.MeshStandardMaterial({
    color: 0x263d2e,
    roughness: 1,
  });
  for (const [ox, oy, oz, radius] of [
    [0, 4.2, 0, 1.5],
    [-0.8, 3.9, 0.15, 1.05],
    [0.72, 4.05, -0.2, 1.18],
    [0.1, 5.05, 0, 1.0],
  ] as const) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * scale, 1), foliage);
    crown.position.set(ox * scale, oy * scale, oz * scale);
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
    escape: [0xf0a17c, 0x211a1a],
  };
  const [sky, ground] = hemiColors[chapter];
  root.add(new THREE.HemisphereLight(sky, ground, chapter === "hospital" ? 1.45 : 2.1));
  const sun = new THREE.DirectionalLight(
    chapter === "hospital" ? 0xdde5d4 : 0xffc68b,
    chapter === "hospital" ? 1.2 : 3.4,
  );
  sun.position.set(-16, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
    medicalCabinet(materials, -7.72, -80, Math.PI / 2),
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
  exitSign.position.set(0, 3.5, -90.78);
  root.add(exitSign);
  const exitDoorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c4d3e,
    roughness: 0.62,
    metalness: 0.22,
  });
  box(root, [3.2, 3.6, 0.18], [0, 1.8, -90.74], exitDoorMaterial);
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

  box(root, [20, 0.24, 140], [0, -0.12, -56], materials.asphalt);
  box(root, [5, 0.34, 140], [-12.5, 0.02, -56], materials.concrete);
  box(root, [5, 0.34, 140], [12.5, 0.02, -56], materials.concrete);
  for (let z = 8; z >= -120; z -= 10) {
    box(root, [0.16, 0.025, 4.4], [0, 0.02, z], materials.yellow);
  }

  for (let z = 0; z >= -112; z -= 18) {
    addBuilding(root, materials, -18.4, z, 7, 10 + (Math.abs(z) % 4), 15, 1);
    addBuilding(root, materials, 18.4, z - 7, 7, 13 + (Math.abs(z) % 5), 15, -1);
    root.add(streetLight(materials, -9.2, z - 4, 1));
    root.add(streetLight(materials, 9.2, z - 12, -1));
  }

  const carA = makeCar(materials, materials.darkGreen, -4.8, -24, 0.2);
  root.add(carA);
  collisions.push({ x: -4.8, z: -24, radius: 2.3 });
  const carB = makeCar(materials, materials.rust, 4.6, -54, -0.28);
  root.add(carB);
  collisions.push({ x: 4.6, z: -54, radius: 2.3 });
  const carC = makeCar(materials, materials.white, -5.2, -82, 0.48);
  root.add(carC);
  collisions.push({ x: -5.2, z: -82, radius: 2.3 });
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
    bounds: { minX: -9.2, maxX: 9.2, minZ: -116, maxZ: 8 },
  };
}

function buildStation(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "station");

  box(root, [38, 0.24, 112], [0, -0.12, -46], materials.asphalt);
  box(root, [25, 0.26, 20], [0, 0, -74], materials.concrete);
  box(root, [23, 4.6, 11], [0, 2.3, -83], materials.concreteDark);
  box(root, [14, 3.1, 0.14], [0, 1.55, -77.45], materials.glass);
  const stationSign = textPanel("NORTHLINE", "#f4d8af", "rgba(91,33,24,.96)");
  stationSign.position.set(0, 4.05, -77.36);
  stationSign.scale.set(1.6, 1.2, 1);
  root.add(stationSign);

  box(root, [26, 0.46, 12], [0, 5.15, -35], materials.white);
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
  const bike = makeMotorcycle(materials, 0, -8, Math.PI);
  root.add(bike);
  interactions.push(interactionObject(root, "bike", "Ride toward Haven", [0, 0, -10.5], new THREE.Group()));

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(0, 0, 4),
    bounds: { minX: -17.5, maxX: 17.5, minZ: -74, maxZ: 8 },
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

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(0, 0, 7),
    bounds: { minX: -8.1, maxX: 8.1, minZ: -174, maxZ: 8 },
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
          : buildEscape(materials);
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
