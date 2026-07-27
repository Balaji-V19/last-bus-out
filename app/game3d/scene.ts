import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  compileFloor,
  type CeilingRect,
  type DoorRuntime,
  type FloorMaterials,
  type FloorPlan,
  type OccupancyGrid,
} from "./floorPlan";
import { groundEmergencyPlan, ward2Plan } from "./floors";

export type { OccupancyGrid, CeilingRect, DoorRuntime } from "./floorPlan";
export {
  gridAllows,
  gridSees,
  computeFlowField,
  flowDirection,
  openDoorCells,
} from "./floorPlan";

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
  /**
   * Walkability raster, present on floors built from a room graph. When set it
   * is authoritative for movement and the collision circles are only a fallback
   * for the floors still using the old corridor builder.
   */
  grid?: OccupancyGrid;
  /** Legal standing positions by room, used to spawn enemies inside real rooms. */
  spawnPoints?: Array<{ room: string; position: THREE.Vector3 }>;
  /** Room footprints and ceiling heights, so the camera can stay indoors. */
  ceilings?: CeilingRect[];
  /** Doors that block until opened. */
  doors?: DoorRuntime[];
};

type MaterialSet = {
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  ceilingTile: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  darkGreen: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
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

function createMaterials(): MaterialSet {
  const concreteTexture = surfaceTexture("#625f56", "#d5d0bd", 42);
  concreteTexture.repeat.set(5, 18);
  const wallTexture = surfaceTexture("#7a796f", "#d7d2bd", 64);
  wallTexture.repeat.set(3, 12);
  const tileTexture = surfaceTexture("#6e746d", "#d9ddd4", 84, true);
  tileTexture.repeat.set(5, 24);

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
    // Mineral-fibre ceiling tile: matte, slightly warm, water-stained by the
    // same fleck texture used on the walls.
    ceilingTile: new THREE.MeshStandardMaterial({
      map: tileTexture.clone(),
      color: 0x9a9c8e,
      roughness: 0.98,
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
  // Height of the fitting. Room-graph floors pass their own ceiling height;
  // the legacy corridor builder keeps the fixed 4.58 m it was authored against.
  height = 4.58,
) {
  // Recessed 1200 x 300 troffer sitting in the ceiling grid, rather than the
  // surface-mounted slab this used to be: a steel housing, two visible tubes,
  // and a prismatic diffuser under them.
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.09, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4c524e, roughness: 0.55 }),
  );
  housing.position.set(x, height + 0.03, z);
  parent.add(housing);

  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f6e6,
    emissive: 0xdde8cd,
    emissiveIntensity: 3.8,
  });
  for (const offset of [-0.07, 0.07]) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1.12, 8),
      tubeMaterial,
    );
    tube.rotation.z = Math.PI / 2;
    tube.position.set(x, height - 0.012, z + offset);
    parent.add(tube);
  }

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.14, 0.014, 0.25),
    new THREE.MeshStandardMaterial({
      color: 0xeef3df,
      emissive: 0xdde8cd,
      emissiveIntensity: 2.4,
      transparent: true,
      opacity: 0.62,
      roughness: 0.42,
    }),
  );
  panel.position.set(x, height - 0.042, z);
  parent.add(panel);
  // With the interior sun removed these fittings are the only general light, so
  // they carry more of the exposure than they used to. Reach is extended past
  // the old 13 m because a pool of light that dies before the next fitting now
  // reads as a gap in the ceiling rather than a dim corridor.
  const lampIntensity = intensity * 2.35;
  const light = new THREE.PointLight(0xdcebd2, lampIntensity, 17, 2);
  light.position.set(x, height - 0.22, z);
  light.castShadow = false;
  light.userData.baseIntensity = lampIntensity;
  light.userData.flicker = true;
  parent.add(light);
}

/**
 * Ward bed at real dimensions: 2200 x 990 mm platform, mattress top at 600 mm,
 * four-section articulated deck, drop-side rails and 125 mm braked castors.
 *
 * The rails matter more than anything else here — they are the silhouette that
 * says "hospital bed" rather than "table", and the previous version had none.
 */
function hospitalBed(materials: MaterialSet, x: number, z: number, rotation = 0) {
  const bed = new THREE.Group();
  bed.position.set(x, 0, z);
  bed.rotation.y = rotation;

  // Chassis and lifting column.
  box(bed, [1.92, 0.1, 0.72], [0, 0.3, 0], materials.paintedMetal);
  box(bed, [0.24, 0.28, 0.4], [0, 0.44, 0], materials.metal);

  // Four-section deck: back rest raised, seat flat, thigh and calf breaking
  // down toward the foot. Sections are separate so the profile is not one slab.
  box(bed, [0.62, 0.06, 0.9], [-0.72, 0.66, 0], materials.metal, [0, 0, -0.26]);
  box(bed, [0.5, 0.06, 0.9], [-0.16, 0.6, 0], materials.metal);
  box(bed, [0.44, 0.06, 0.9], [0.31, 0.598, 0], materials.metal, [0, 0, 0.08]);
  box(bed, [0.5, 0.06, 0.9], [0.79, 0.566, 0], materials.metal, [0, 0, 0.14]);

  // Mattress, following the deck.
  box(bed, [0.6, 0.13, 0.84], [-0.72, 0.735, 0], materials.white, [0, 0, -0.26]);
  box(bed, [0.5, 0.13, 0.84], [-0.16, 0.675, 0], materials.white);
  box(bed, [0.44, 0.13, 0.84], [0.31, 0.672, 0], materials.white, [0, 0, 0.08]);
  box(bed, [0.5, 0.13, 0.84], [0.79, 0.64, 0], materials.white, [0, 0, 0.14]);

  // Rumpled sheet and pillow.
  box(bed, [0.86, 0.05, 0.86], [0.34, 0.73, 0.02], materials.fabric, [0, 0.06, 0.05]);
  box(bed, [0.44, 0.14, 0.56], [-0.78, 0.83, 0.03], materials.fabric, [0, 0.12, -0.22]);

  // Drop-side rails: two per side, 1050 mm long, top edge at about 950 mm.
  for (const side of [-1, 1]) {
    for (const railX of [-0.52, 0.5]) {
      box(bed, [0.96, 0.045, 0.035], [railX, 0.93, side * 0.45], materials.metal);
      box(bed, [0.96, 0.03, 0.03], [railX, 0.8, side * 0.45], materials.metal);
      for (const postX of [-0.44, 0.44]) {
        box(
          bed,
          [0.035, 0.34, 0.03],
          [railX + postX, 0.78, side * 0.45],
          materials.metal,
        );
      }
    }
  }

  // Head and foot boards, foot board lower as it always is.
  box(bed, [0.055, 0.46, 0.9], [-1.06, 0.86, 0], materials.paintedMetal);
  box(bed, [0.055, 0.34, 0.9], [1.06, 0.8, 0], materials.paintedMetal);
  // Chart holder on the foot board.
  box(bed, [0.03, 0.2, 0.3], [1.1, 0.72, 0.16], materials.white, [0, 0, -0.22]);

  for (const px of [-0.82, 0.82]) {
    for (const pz of [-0.29, 0.29]) {
      cylinder(bed, [0.045, 0.045], 0.24, [px, 0.18, pz], materials.metal, undefined, 10);
      // 125 mm castor in a fork, with a brake lever.
      box(bed, [0.05, 0.1, 0.08], [px, 0.1, pz], materials.metal);
      const wheel = cylinder(
        bed,
        [0.0625, 0.0625],
        0.045,
        [px, 0.0625, pz],
        materials.rubber,
        [Math.PI / 2, 0, 0],
        14,
      );
      wheel.castShadow = true;
      box(bed, [0.11, 0.02, 0.02], [px + 0.05, 0.05, pz], materials.yellow, [0, 0, 0.3]);
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
    // Fire axe: 900 mm oval haft, bit tapering to an edge, square poll behind
    // the eye, over-strike collar under the head and a red-banded blade.
    cylinder(group, [0.026, 0.032], 1.28, [0, 0, 0], dark, undefined, 12);
    const bit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.02, 0.3, 4, 1),
      steel,
    );
    bit.rotation.set(0, Math.PI / 4, Math.PI / 2);
    bit.position.set(-0.19, 0.66, 0);
    bit.scale.set(1, 1, 0.36);
    bit.castShadow = true;
    group.add(bit);
    box(group, [0.13, 0.15, 0.1], [0, 0.66, 0], steel);
    box(group, [0.12, 0.12, 0.1], [0.11, 0.665, 0], dark, [0, 0, 0.12]);
    box(group, [0.055, 0.05, 0.115], [0, 0.55, 0], red);
    box(group, [0.16, 0.09, 0.075], [-0.16, 0.66, 0], red);
    // Grip wrap at the bottom of the haft.
    cylinder(group, [0.034, 0.034], 0.26, [0, -0.5, 0], black, undefined, 12);
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
    // Roughly 190 x 135 x 32 mm overall. Previously three boxes; now it has the
    // parts an eye actually looks for at arm's length — a slide with a
    // chamfered nose, a barrel that opens at the muzzle, sights, a trigger
    // inside a guard, and a magazine floorplate.
    box(group, [0.13, 0.3, 0.19], [0, -0.2, 0.02], black, [0, 0, -0.14]);
    box(group, [0.14, 0.045, 0.2], [0, -0.35, 0.04], steel, [0, 0, -0.14]);
    box(group, [0.15, 0.15, 0.62], [0, 0.05, -0.2], steel);
    box(group, [0.15, 0.08, 0.1], [0, 0.02, -0.53], steel, [0.34, 0, 0]);
    cylinder(group, [0.036, 0.036], 0.1, [0, 0.03, -0.52], black, [Math.PI / 2, 0, 0], 12);
    box(group, [0.14, 0.09, 0.5], [0, 0.15, -0.16], black);
    box(group, [0.028, 0.035, 0.03], [0, 0.21, -0.44], black);
    box(group, [0.09, 0.035, 0.03], [0, 0.21, 0.06], black);
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI * 1.15),
      black,
    );
    guard.rotation.set(0, Math.PI / 2, -0.4);
    guard.position.set(0, -0.06, -0.06);
    group.add(guard);
    box(group, [0.03, 0.09, 0.035], [0, -0.05, -0.07], steel, [0, 0, 0.2]);
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

// Height of the surface a portable pickup is resting on, in metres. Objectives
// used to be lifted to a uniform 0.72 m and haloed with a spinning gold ring,
// which read as an arcade collectible. They now sit at a believable height for
// whatever they are lying on, and are found by torchlight instead.
const PICKUP_SURFACE = {
  floor: 0.04,
  cot: 0.62,
  desk: 0.76,
  trolley: 0.92,
} as const;

function interactionObject(
  root: THREE.Group,
  id: string,
  label: string,
  position: [number, number, number],
  object: THREE.Group,
  // Default is the floor: a dropped item in an evacuated hospital is grounded,
  // and nothing is currently modelled underneath these positions to rest on.
  // Stage 5 places them on real benches, cots and trolleys.
  surface: keyof typeof PICKUP_SURFACE = "floor",
) {
  const holder = new THREE.Group();
  holder.position.set(...position);
  holder.userData.interactionId = id;

  const isStatic = Boolean(object.userData.staticInteraction);
  const restHeight = isStatic ? 0 : PICKUP_SURFACE[surface];
  object.position.y = restHeight;
  holder.userData.restHeight = restHeight;
  holder.userData.portable = !isStatic;

  if (!isStatic) {
    // Prime the pickup's own materials with a dim self-colour emissive so the
    // viewport can raise it when the torch beam lands on the object. Hospital
    // equipment carries retroreflective markings, so catching the light is the
    // believable version of "this one matters" — and it makes the torch the
    // finding mechanic rather than a screen-space marker.
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) continue;
        material.emissive.copy(material.color);
        material.emissiveIntensity = 0;
        material.userData.pickupGlow = true;
      }
    });
  }

  holder.add(object);
  root.add(holder);
  return { id, label, position: holder.position.clone(), object: holder };
}

// Every floor is a sealed interior, so there is no sun. The only ambient term
// is a faint bounce that keeps unlit faces from crushing to pure black under
// BasicShadowMap; the fluorescents and the player torch do the real lighting.
// Keep these low. The blackout director scales them by globalPowerFactor, so a
// bright ambient here is what previously made "blackouts" still show the floor.
const FLOOR_AMBIENT: Record<GameChapter, { sky: number; ground: number; level: number }> = {
  hospital: { sky: 0xb9c6bd, ground: 0x0f1614, level: 0.15 },
  street: { sky: 0xb3c2b8, ground: 0x0e1513, level: 0.13 },
  station: { sky: 0xc09a66, ground: 0x120d0a, level: 0.09 },
  checkpoint: { sky: 0x9fb0a6, ground: 0x0c1210, level: 0.1 },
  depot: { sky: 0x93a5ad, ground: 0x0a0f11, level: 0.08 },
  escape: { sky: 0xbfc7b6, ground: 0x111612, level: 0.14 },
  survival: { sky: 0x8fa3a6, ground: 0x0b100f, level: 0.07 },
};

function baseScene(root: THREE.Group, chapter: GameChapter) {
  const ambient = FLOOR_AMBIENT[chapter];
  root.add(new THREE.HemisphereLight(ambient.sky, ambient.ground, ambient.level));
}

function floorMaterialsFrom(materials: MaterialSet): FloorMaterials {
  return {
    floor: materials.tile,
    wall: materials.wall,
    ceiling: materials.concreteDark,
    ceilingTile: materials.ceilingTile,
    trim: materials.paintedMetal,
    door: materials.darkGreen,
    doorGlass: materials.glass,
  };
}

/** Ceiling fittings sized and placed from a room's own footprint. */
function lightRoom(
  root: THREE.Group,
  centre: THREE.Vector3,
  size: [number, number],
  mode: "rows" | "single" | "sconce" | "emergency" | "dead",
  ceiling: number,
) {
  if (mode === "dead") return;
  const intensity =
    mode === "rows" ? 1.15 : mode === "single" ? 0.95 : mode === "sconce" ? 0.6 : 0.42;
  const positions: Array<[number, number]> = [];
  if (mode === "rows") {
    // Roughly one fitting per 9 square metres, in two rows down the long axis.
    const alongZ = size[1] >= size[0];
    const count = Math.max(2, Math.round((size[0] * size[1]) / 18));
    for (let index = 0; index < count; index += 1) {
      const t = (index + 0.5) / count - 0.5;
      const lateral = index % 2 === 0 ? -0.24 : 0.24;
      positions.push(
        alongZ
          ? [size[0] * lateral, size[1] * t]
          : [size[0] * t, size[1] * lateral],
      );
    }
  } else {
    positions.push([0, 0]);
  }
  for (const [offsetX, offsetZ] of positions) {
    // Flush with the grid: the housing sits just above the tile line.
    addFluorescent(root, centre.x + offsetX, centre.z + offsetZ, intensity, ceiling);
  }
}

/**
 * The floor exit. This used to be an empty Group marked only by the gold ring
 * that has since been removed, which left nothing at all to see or walk toward.
 * It is now a real fire-escape door with a push bar and a lit running-man sign.
 */
/**
 * Shared scaffolding for a room-graph floor: compile the plan, light each room
 * from its own footprint, hang its door plaque, and hand back helpers for
 * placing props and interactions in room-relative coordinates.
 */
function beginRoomGraphFloor(
  materials: MaterialSet,
  plan: FloorPlan,
  chapter: GameChapter,
) {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, chapter);

  const floor = compileFloor(plan, floorMaterialsFrom(materials));
  root.add(floor.root);

  const centreOf = (id: string) =>
    floor.roomCentres.get(id) ?? new THREE.Vector3();

  for (const room of plan.rooms) {
    lightRoom(root, centreOf(room.id), room.size, room.light, room.ceiling);
    if (!room.plaque) continue;
    const plaque = textPanel(room.plaque, "#d7e0d4", "rgba(26,38,33,.94)");
    const centre = centreOf(room.id);
    plaque.position.set(centre.x, 2.28, centre.z + room.size[1] / 2 - 0.14);
    plaque.scale.set(0.42, 0.34, 1);
    root.add(plaque);
  }

  const place = (
    object: THREE.Object3D,
    room: string,
    offsetX: number,
    offsetZ: number,
    radius?: number,
  ) => {
    const centre = centreOf(room);
    object.position.x += centre.x + offsetX;
    object.position.z += centre.z + offsetZ;
    root.add(object);
    if (radius) {
      collisions.push({ x: centre.x + offsetX, z: centre.z + offsetZ, radius });
    }
    return object;
  };

  const at = (
    room: string,
    offsetX: number,
    offsetZ: number,
  ): [number, number, number] => {
    const centre = centreOf(room);
    return [centre.x + offsetX, 0, centre.z + offsetZ];
  };

  const finish = (): BuiltWorld => ({
    root,
    collisions,
    interactions,
    start: floor.start.clone(),
    bounds: floor.bounds,
    grid: floor.grid,
    spawnPoints: floor.spawnPoints,
    ceilings: floor.ceilings,
    doors: floor.doors,
  });

  return { root, collisions, interactions, place, at, finish };
}

/**
 * Floor 2 Patient Ward. A ring you can be followed around, rather than another
 * straight corridor.
 */
function buildWard2(materials: MaterialSet): BuiltWorld {
  const floor = beginRoomGraphFloor(materials, ward2Plan, "street");
  const { place, at, interactions } = floor;

  // Four-bed bays, laid out as they would be: two beds a side, curtain track
  // between them, monitor at the head of each.
  for (const bay of ["bayA", "bayB", "bayC", "bayD"] as const) {
    for (const [index, offsetX] of [-2.6, 2.6].entries()) {
      place(hospitalBed(materials, 0, 0, index === 0 ? 0 : Math.PI), bay, offsetX, -1.4, 1.2);
      place(hospitalBed(materials, 0, 0, index === 0 ? 0 : Math.PI), bay, offsetX, 1.8, 1.2);
    }
    place(patientMonitor(materials, 0, 0, 0), bay, 0, -2.8, 0.65);
    place(ivStand(materials, 0, 0, 0.18), bay, -3.6, 0.4);
    place(oxygenTank(materials, 0, 0, 0), bay, 3.7, -3.1, 0.42);
  }
  place(liquidPuddle("#5d1d18", 0, 0, 2.8, 0.2), "bayB", 0.4, 0.6);
  place(liquidPuddle("#445c52", 0, 0, 2.2, -0.3), "bayD", -1.2, 1.4);

  // Ring corridors: trolleys parked along the outside, wheelchairs abandoned.
  place(hospitalCart(materials, 0, 0), "northRun", -6.2, 1.1, 0.5);
  place(hospitalCart(materials, 0, 0), "southRun", 7.4, -1.1, 0.5);
  place(wheelchair(materials, 0, 0, Math.PI / 2), "westRun", 0.9, 6.4, 0.5);
  place(wheelchair(materials, 0, 0, -0.5), "eastRun", -0.8, -5.2, 0.5);
  place(medicalCabinet(materials, 0, 0, Math.PI / 2), "westRun", -1.2, -8.5, 0.55);
  place(fireExtinguisher(materials, 0, 0, -Math.PI / 2), "eastRun", 1.4, 9.2, 0.28);
  place(liquidPuddle("#3d5349", 0, 0, 3.4, 0.1), "southRun", -2.6, 0.4);
  place(liquidPuddle("#4b6256", 0, 0, 2.6, -0.4), "eastRun", 0, 2.2);

  place(hospitalReception(materials, 0, 0), "nurse", 0, 2.2, 1.6);
  place(medicalCabinet(materials, 0, 0, -Math.PI / 2), "nurse", 3.8, -1.8, 0.55);
  place(pharmacyShelf(materials, 0, 0, Math.PI / 2), "nurse", -3.9, -1.2, 0.7);

  place(wheelchair(materials, 0, 0, 0.3), "dayroom", -2.4, 3.2, 0.5);
  place(hospitalCart(materials, 0, 0), "dayroom", 2.8, -3.6, 0.5);
  place(liquidPuddle("#4a6157", 0, 0, 3, 0.25), "dayroom", 0.4, 0.8);

  interactions.push(
    interactionObject(
      floor.root,
      "signal",
      "Read the ward evacuation board",
      at("nurse", 1.8, -3.2),
      hospitalWardBoard(materials),
    ),
    interactionObject(
      floor.root,
      "maya",
      "Help Dr. Maya Singh",
      at("bayA", -0.6, 2.6),
      hospitalSurvivorCot(materials),
    ),
    interactionObject(
      floor.root,
      "orderly",
      "Free the trapped orderly",
      at("bayC", 0.8, -2.4),
      hospitalSurvivorCot(materials),
    ),
    interactionObject(
      floor.root,
      "pistol",
      "Take the security pistol",
      at("dayroom", -3.2, -4.2),
      createEquipmentModel("pistol", 0.72),
    ),
    interactionObject(
      floor.root,
      "bike",
      "Use the service lift to Basement B1",
      at("liftLobby", 0, -2.4),
      hospitalElevatorBank(materials, "B1", true),
    ),
  );

  return floor.finish();
}

function stairwellExit(materials: MaterialSet) {
  const exit = new THREE.Group();
  exit.userData.staticInteraction = true;

  // Frame and threshold.
  box(exit, [2.3, 0.16, 0.22], [0, 2.24, 0], materials.paintedMetal);
  for (const side of [-1, 1]) {
    box(exit, [0.14, 2.24, 0.22], [side * 1.08, 1.12, 0], materials.paintedMetal);
  }
  // Two leaves, one ajar so the way on is legible from across the room.
  for (const [side, swing] of [
    [-1, 0.0],
    [1, 0.34],
  ] as const) {
    const leaf = new THREE.Group();
    leaf.position.set(side * 1.0, 0, 0);
    leaf.rotation.y = side * swing;
    box(leaf, [0.98, 2.14, 0.05], [-side * 0.49, 1.07, 0], materials.darkGreen);
    box(leaf, [0.34, 0.62, 0.02], [-side * 0.49, 1.62, 0.035], materials.glass);
    // Push bar at 1.05 m.
    cylinder(
      leaf,
      [0.028, 0.028],
      0.82,
      [-side * 0.49, 1.05, 0.06],
      materials.metal,
      [0, 0, Math.PI / 2],
      12,
    );
    box(leaf, [0.9, 0.18, 0.02], [-side * 0.49, 0.16, 0.036], materials.metal);
    exit.add(leaf);
  }
  // Running-man sign. Emissive because a real exit sign is on its own battery,
  // which also makes it the one thing still lit during a blackout.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.24, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x1f6b3a,
      emissive: 0x27f07a,
      emissiveIntensity: 1.35,
    }),
  );
  sign.position.set(0, 2.52, 0.06);
  exit.add(sign);
  return exit;
}

/**
 * Ground Floor Emergency, built from the room graph in floors.ts.
 *
 * Replaces the previous 17 x 128 m straight corridor whose "side rooms" were a
 * door frame and a floor slab you could not enter.
 */
function buildHospital(materials: MaterialSet): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, "hospital");

  const floor = compileFloor(groundEmergencyPlan, floorMaterialsFrom(materials));
  root.add(floor.root);

  const centreOf = (id: string) =>
    floor.roomCentres.get(id) ?? new THREE.Vector3();
  const sizeOf = (id: string): [number, number] => {
    const room = groundEmergencyPlan.rooms.find((entry) => entry.id === id);
    return room ? room.size : [4, 4];
  };

  for (const room of groundEmergencyPlan.rooms) {
    lightRoom(
      root,
      centreOf(room.id),
      room.size,
      room.light,
      room.ceiling,
    );
    if (!room.plaque) continue;
    const plaque = textPanel(room.plaque, "#d7e0d4", "rgba(26,38,33,.94)");
    const centre = centreOf(room.id);
    plaque.position.set(centre.x, 2.28, centre.z + sizeOf(room.id)[1] / 2 - 0.14);
    plaque.scale.set(0.42, 0.34, 1);
    root.add(plaque);
  }

  const place = (
    object: THREE.Object3D,
    room: string,
    offsetX: number,
    offsetZ: number,
    radius?: number,
  ) => {
    const centre = centreOf(room);
    object.position.x += centre.x + offsetX;
    object.position.z += centre.z + offsetZ;
    root.add(object);
    if (radius) {
      collisions.push({
        x: centre.x + offsetX,
        z: centre.z + offsetZ,
        radius,
      });
    }
    return object;
  };

  // Ambulance receiving: the only daylight in the game, and it is grey.
  place(hospitalReception(materials, 0, 0), "vestibule", 4.4, -2.6, 1.5);
  place(wheelchair(materials, 0, 0, Math.PI / 2), "vestibule", -4.2, 1.4, 0.5);
  place(wheelchair(materials, 0, 0, -0.4), "vestibule", -2.6, -2.2, 0.5);
  place(liquidPuddle("#3f5a50", 0, 0, 2.6, 0.2), "vestibule", 1.2, 2.4);

  // Triage hall: curtained bays down one side, trolleys parked along the other.
  for (const [index, offsetZ] of [-5.2, -1.4, 2.6, 5.4].entries()) {
    place(
      hospitalBed(materials, 0, 0, index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2),
      "triage",
      index % 2 === 0 ? -4.6 : 4.6,
      offsetZ,
      1.2,
    );
  }
  place(patientMonitor(materials, 0, 0, Math.PI / 2), "triage", -5.4, -3.2, 0.65);
  place(patientMonitor(materials, 0, 0, -Math.PI / 2), "triage", 5.4, 1.1, 0.65);
  place(ivStand(materials, 0, 0, 0.2), "triage", -3.9, 4.1);
  place(ivStand(materials, 0, 0, -0.3), "triage", 3.8, -4.6);
  place(oxygenTank(materials, 0, 0, 0.2), "triage", 5.9, -5.8, 0.42);
  place(liquidPuddle("#5d1d18", 0, 0, 3, -0.3), "triage", -1.4, -1.8);

  place(hospitalBed(materials, 0, 0, 0), "bayA", 2.2, 0, 1.2);
  place(medicalCabinet(materials, 0, 0, -Math.PI / 2), "bayA", -4.4, -1.2, 0.55);
  place(hospitalBed(materials, 0, 0, 0), "bayB", 2.4, 1.4, 1.2);
  place(oxygenTank(materials, 0, 0, 0), "bayB", -4.2, -2.2, 0.42);
  place(liquidPuddle("#4a6157", 0, 0, 2.2, 0.4), "bayB", 0.4, -1.2);

  place(hospitalReception(materials, 0, 0), "nurse", 0, 1.9, 1.6);
  place(medicalCabinet(materials, 0, 0, Math.PI / 2), "nurse", 3.9, -1.6, 0.55);

  place(operatingLamp(materials, 0, 0), "resus", 0, 0.6);
  place(hospitalBed(materials, 0, 0, Math.PI / 2), "resus", 0, 0.6, 1.2);
  place(hospitalCart(materials, 0, 0), "resus", -2.8, -2.4, 0.5);
  place(patientMonitor(materials, 0, 0, 0), "resus", 2.9, -2.2, 0.65);

  place(fireExtinguisher(materials, 0, 0, 0), "southHall", -5.9, 3.2, 0.28);
  place(liquidPuddle("#3d5349", 0, 0, 3.4, 0.1), "southHall", 1.8, 0.6);
  place(hospitalCart(materials, 0, 0), "southHall", 4.6, -2.2, 0.5);

  place(toolBench(materials, 0, 0, Math.PI / 2), "radiology", -3.8, 0.4, 1.3);
  place(pharmacyShelf(materials, 0, 0, -Math.PI / 2), "radiology", 4.4, -1.4, 0.7);

  place(liquidPuddle("#4b6256", 0, 0, 3.2, -0.2), "subWait", 0, 1.6);
  place(hospitalCart(materials, 0, 0), "subWait", -3.6, -2.8, 0.5);

  const breaker = new THREE.Group();
  breaker.userData.staticInteraction = true;
  roundedBox(breaker, [0.72, 0.92, 0.26], [0, 0.35, 0], materials.paintedMetal, 0.06);
  roundedBox(breaker, [0.44, 0.17, 0.035], [0, 0.52, 0.15], materials.glass, 0.025);
  for (const x of [-0.16, 0, 0.16]) {
    cylinder(breaker, [0.035, 0.035], 0.11, [x, 0.25, 0.15], materials.red, [Math.PI / 2, 0, 0], 10);
  }
  box(breaker, [0.12, 0.34, 0.08], [0, 0.02, 0.17], materials.rust, [0, 0, -0.32]);

  const at = (room: string, offsetX: number, offsetZ: number): [number, number, number] => {
    const centre = centreOf(room);
    return [centre.x + offsetX, 0, centre.z + offsetZ];
  };

  interactions.push(
    interactionObject(root, "torch", "Take torch", at("vestibule", -1.8, -3.4), createEquipmentModel("torch", 1)),
    interactionObject(root, "radio", "Check emergency radio", at("nurse", -1.4, 1.4), createEquipmentModel("radio", 1), "desk"),
    interactionObject(root, "axe", "Take fire axe", at("resus", 3.2, 2.8), createEquipmentModel("axe", 1)),
    interactionObject(root, "breaker", "Reset stairwell power", at("radiology", 4.2, 2.6), breaker),
    interactionObject(root, "exit", "Enter Stairwell A", at("stairwell", 0, -2.6), stairwellExit(materials)),
  );

  return {
    root,
    collisions,
    interactions,
    start: floor.start.clone(),
    bounds: floor.bounds,
    grid: floor.grid,
    spawnPoints: floor.spawnPoints,
    ceilings: floor.ceilings,
    doors: floor.doors,
  };
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

function hospitalElevatorBank(
  materials: MaterialSet,
  label: string,
  powered = false,
) {
  const group = new THREE.Group();
  group.userData.staticInteraction = true;
  roundedBox(
    group,
    [5.2, 4.2, 0.34],
    [0, 2.05, 0],
    materials.concreteDark,
    0.08,
  );
  for (const side of [-1, 1]) {
    roundedBox(
      group,
      [2.34, 3.7, 0.18],
      [side * 1.24, 1.85, 0.2],
      materials.paintedMetal,
      0.06,
    );
    box(
      group,
      [0.06, 3.58, 0.05],
      [side * 1.24, 1.85, 0.31],
      materials.metal,
    );
  }
  const display = textPanel(
    label,
    powered ? "#c9f5ce" : "#f1c7b9",
    powered ? "rgba(27,72,47,.96)" : "rgba(83,29,25,.96)",
  );
  display.position.set(0, 4.32, 0.26);
  display.scale.set(0.72, 0.72, 0.72);
  group.add(display);
  const callLight = new THREE.MeshStandardMaterial({
    color: powered ? 0x7acb75 : 0xb53225,
    emissive: powered ? 0x2a8b45 : 0x761109,
    emissiveIntensity: powered ? 2.1 : 1.35,
    roughness: 0.46,
  });
  roundedBox(group, [0.22, 0.34, 0.08], [3, 1.42, 0.27], callLight, 0.03);
  return group;
}

function hospitalFoodCache(materials: MaterialSet) {
  const group = new THREE.Group();
  group.userData.staticInteraction = true;
  const cardboard = new THREE.MeshStandardMaterial({
    color: 0x7d6240,
    roughness: 0.98,
  });
  for (const [x, y, z, scale] of [
    [-0.42, 0.28, 0.08, 0.86],
    [0.36, 0.24, -0.12, 0.72],
    [0.02, 0.68, 0.04, 0.62],
  ] as const) {
    roundedBox(
      group,
      [0.92 * scale, 0.58 * scale, 0.72 * scale],
      [x, y, z],
      cardboard,
      0.06,
    );
    box(
      group,
      [0.12 * scale, 0.59 * scale, 0.73 * scale],
      [x, y, z],
      materials.yellow,
    );
  }
  for (const x of [-0.52, -0.18, 0.2, 0.56]) {
    cylinder(
      group,
      [0.1, 0.1],
      0.32,
      [x, 0.98 + Math.abs(x) * 0.08, 0.06],
      materials.paintedMetal,
      [0, 0, 0],
      16,
    );
  }
  return group;
}

function hospitalPowerConsole(materials: MaterialSet) {
  const group = new THREE.Group();
  group.userData.staticInteraction = true;
  roundedBox(
    group,
    [1.5, 1.72, 0.52],
    [0, 0.82, 0],
    materials.paintedMetal,
    0.08,
  );
  roundedBox(group, [1.08, 0.48, 0.05], [0, 1.15, 0.3], materials.glass, 0.04);
  for (const [x, color] of [
    [-0.38, materials.red],
    [-0.12, materials.yellow],
    [0.14, materials.darkGreen],
    [0.4, materials.white],
  ] as const) {
    cylinder(
      group,
      [0.055, 0.055],
      0.08,
      [x, 0.66, 0.31],
      color,
      [Math.PI / 2, 0, 0],
      12,
    );
  }
  box(group, [0.18, 0.54, 0.16], [0.34, 0.24, 0.34], materials.rust, [0, 0, -0.28]);
  return group;
}

function hospitalWardBoard(materials: MaterialSet) {
  const group = new THREE.Group();
  group.userData.staticInteraction = true;
  roundedBox(
    group,
    [1.8, 1.22, 0.12],
    [0, 1.22, 0],
    materials.paintedMetal,
    0.08,
  );
  roundedBox(group, [1.58, 0.98, 0.04], [0, 1.22, -0.08], materials.white, 0.04);
  const heading = textPanel(
    "WEST WARD · OCCUPANCY",
    "#e9eee8",
    "rgba(37,65,56,.98)",
  );
  heading.position.set(0, 1.49, -0.12);
  heading.scale.set(0.36, 0.28, 0.36);
  group.add(heading);
  for (const [y, color, width] of [
    [1.3, materials.red, 0.96],
    [1.12, materials.yellow, 1.2],
    [0.94, materials.darkGreen, 0.72],
  ] as const) {
    roundedBox(group, [width, 0.06, 0.025], [-0.12, y, -0.115], color, 0.015);
  }
  box(group, [0.1, 2.1, 0.1], [-0.74, 0.1, 0.02], materials.metal);
  box(group, [0.1, 2.1, 0.1], [0.74, 0.1, 0.02], materials.metal);
  return group;
}

function hospitalSurvivorCot(materials: MaterialSet, family = false) {
  const group = new THREE.Group();
  group.userData.staticInteraction = true;
  const cot = hospitalBed(materials, 0, 0, 0);
  cot.scale.setScalar(0.78);
  cot.position.set(0, 0, 0);
  group.add(cot);
  const blanket = new THREE.MeshStandardMaterial({
    color: family ? 0x6e805f : 0x657b83,
    roughness: 1,
  });
  roundedBox(group, [1.18, 0.2, 0.66], [0, 0.92, 0.04], blanket, 0.08);
  roundedBox(
    group,
    [0.34, 0.22, 0.46],
    [0, 1.05, -0.56],
    materials.fabric,
    0.12,
  );
  if (family) {
    roundedBox(group, [0.52, 0.18, 0.38], [0.62, 0.84, 0.12], blanket, 0.1);
  }
  return group;
}

function mutationSpecimenPod(materials: MaterialSet, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  cylinder(group, [0.78, 0.9], 0.3, [0, 0.15, 0], materials.metal, [0, 0, 0], 20);
  const fluid = new THREE.MeshPhysicalMaterial({
    color: 0x486c55,
    emissive: 0x142a1b,
    emissiveIntensity: 0.6,
    roughness: 0.18,
    transparent: true,
    opacity: 0.52,
    transmission: 0.2,
  });
  cylinder(group, [0.68, 0.68], 2.65, [0, 1.62, 0], fluid, [0, 0, 0], 24);
  cylinder(group, [0.84, 0.76], 0.34, [0, 3.05, 0], materials.metal, [0, 0, 0], 20);
  const growth = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 2),
    new THREE.MeshStandardMaterial({
      color: 0x364b35,
      emissive: 0x172919,
      emissiveIntensity: 0.72,
      roughness: 0.9,
    }),
  );
  growth.position.set(0.04, 1.56, 0);
  growth.scale.set(0.76, 1.58, 0.68);
  group.add(growth);
  const alarm = new THREE.PointLight(0xa92d22, 1.4, 7, 2);
  alarm.position.set(0, 3.36, 0);
  alarm.userData.baseIntensity = 1.4;
  alarm.userData.flicker = true;
  group.add(alarm);
  return group;
}

function buildHospitalWing(
  materials: MaterialSet,
  chapter: Exclude<GameChapter, "hospital">,
): BuiltWorld {
  const root = new THREE.Group();
  const collisions: CollisionCircle[] = [];
  const interactions: InteractionPoint[] = [];
  baseScene(root, chapter);

  const floorConfig: Record<
    Exclude<GameChapter, "hospital">,
    { sign: string; subSign: string; accent: string; light: number }
  > = {
    street: {
      sign: "FLOOR 2 · PATIENT WARD",
      subSign: "WEST WARD / SURVIVOR SEARCH",
      accent: "rgba(42,76,70,.97)",
      light: 1.85,
    },
    station: {
      sign: "BASEMENT B1 · SERVICES",
      subSign: "COLD STORAGE / EMERGENCY POWER",
      accent: "rgba(70,58,38,.97)",
      light: 1.35,
    },
    checkpoint: {
      sign: "FLOOR 3 · ISOLATION",
      subSign: "PEDIATRICS / NEGATIVE PRESSURE",
      accent: "rgba(74,38,40,.97)",
      light: 1.12,
    },
    depot: {
      sign: "FLOOR 4 · RESEARCH",
      subSign: "PHARMACY / PATHOLOGY LAB",
      accent: "rgba(44,55,67,.97)",
      light: 0.92,
    },
    escape: {
      sign: "GROUND FLOOR · SAFE WING",
      subSign: "SHELTER 04 / MANUAL LOCK",
      accent: "rgba(35,72,52,.97)",
      light: 1.48,
    },
    survival: {
      sign: "QUARANTINE ANNEX",
      subSign: "CONTAINMENT FAILURE",
      accent: "rgba(76,29,27,.97)",
      light: 0.78,
    },
  };
  const config = floorConfig[chapter];

  box(root, [18, 0.22, 112], [0, -0.11, -48], materials.tile);
  box(root, [0.34, 5.1, 112], [-8.85, 2.55, -48], materials.wall);
  box(root, [0.34, 5.1, 112], [8.85, 2.55, -48], materials.wall);
  box(root, [18, 0.2, 112], [0, 5.02, -48], materials.concreteDark);
  box(root, [18, 5.1, 0.34], [0, 2.55, -104], materials.wall);
  box(root, [18, 5.1, 0.34], [0, 2.55, 8], materials.wall);

  for (let z = 4; z >= -100; z -= 8) {
    addFluorescent(
      root,
      Math.abs(z / 8) % 2 === 0 ? -2.9 : 2.9,
      z,
      Math.max(0.58, config.light - (Math.abs(z) % 4) * 0.08),
    );
  }

  const mainSign = textPanel(config.sign, "#edf1e8", config.accent);
  mainSign.position.set(0, 4.22, 5.7);
  mainSign.scale.set(1.08, 0.92, 1);
  root.add(mainSign);
  const subSign = textPanel(config.subSign, "#d8dfd6", config.accent);
  subSign.position.set(0, 4.08, -95);
  subSign.scale.set(0.78, 0.7, 1);
  root.add(subSign);

  for (const side of [-1, 1] as const) {
    for (let z = -4; z >= -94; z -= 18) {
      box(root, [4.9, 0.1, 14.6], [side * 6.35, -0.04, z - 6], materials.concrete);
      box(root, [0.22, 4.5, 14.6], [side * 8.56, 2.25, z - 6], materials.concreteDark);
      box(root, [3.2, 4.5, 0.2], [side * 6.95, 2.25, z - 13.2], materials.wall);
      box(root, [1.34, 3.1, 0.16], [side * 7.7, 1.55, z - 0.1], materials.darkGreen);
      roundedBox(
        root,
        [0.62, 1.15, 0.04],
        [side * 7.7, 2.0, z],
        materials.glass,
        0.04,
      );
    }
  }

  for (const [x, z, rotation] of [
    [-5.7, -14, Math.PI / 2],
    [5.55, -31, -Math.PI / 2],
    [-5.5, -52, Math.PI / 2],
    [5.6, -73, -Math.PI / 2],
    [-5.45, -91, Math.PI / 2],
  ] as const) {
    const bed = hospitalBed(materials, x, z, rotation);
    root.add(bed);
    collisions.push({ x, z, radius: 1.18 });
  }
  for (const [x, z, rotation] of [
    [5.65, -18, Math.PI / 2],
    [-5.8, -39, -Math.PI / 2],
    [5.7, -61, Math.PI / 2],
    [-5.6, -82, -Math.PI / 2],
  ] as const) {
    root.add(patientMonitor(materials, x, z, rotation));
    collisions.push({ x, z, radius: 0.68 });
  }
  for (const [x, z] of [
    [-6.5, -25],
    [6.4, -45],
    [-6.4, -68],
    [6.35, -88],
  ] as const) {
    root.add(oxygenTank(materials, x, z, x < 0 ? 0.2 : -0.2));
    collisions.push({ x, z, radius: 0.42 });
  }
  for (const [x, z, rotation] of [
    [-5.7, -20, 0.12],
    [5.8, -42, -0.18],
    [-5.6, -66, 0.22],
    [5.65, -86, -0.16],
  ] as const) {
    root.add(ivStand(materials, x, z, rotation));
  }
  root.add(
    medicalCabinet(materials, -8.2, -34, Math.PI / 2),
    medicalCabinet(materials, 8.2, -58, -Math.PI / 2),
    fireExtinguisher(materials, -8.34, -74, Math.PI / 2),
    liquidPuddle("#4b6256", 2.2, -24, 3.2, 0.18),
    liquidPuddle("#641b17", -2.5, -56, 2.4, -0.34),
    liquidPuddle("#324e45", 2.8, -84, 2.8, 0.24),
  );

  if (chapter === "street") {
    root.add(
      wheelchair(materials, -4.9, -47, Math.PI / 2),
      hospitalReception(materials, 6.8, -8),
    );
    interactions.push(
      interactionObject(root, "signal", "Read the ward evacuation board", [-4.6, 0, -18], hospitalWardBoard(materials)),
      interactionObject(root, "maya", "Help Dr. Maya Singh", [4.8, 0, -48], hospitalSurvivorCot(materials)),
      interactionObject(root, "orderly", "Free the trapped orderly", [-4.8, 0, -69], hospitalSurvivorCot(materials)),
      interactionObject(root, "pistol", "Take the security pistol", [5.4, 0, -36], createEquipmentModel("pistol", 0.72)),
      interactionObject(root, "bike", "Use the service elevator to B1", [0, 0, -99], hospitalElevatorBank(materials, "B1", true)),
    );
  } else if (chapter === "station") {
    root.add(
      toolBench(materials, -6.7, -16, Math.PI / 2),
      pharmacyShelf(materials, 7.8, -42, -Math.PI / 2),
      pharmacyShelf(materials, -7.8, -72, Math.PI / 2),
    );
    interactions.push(
      interactionObject(root, "generator", "Restart emergency power", [-4.8, 0, -18], hospitalPowerConsole(materials)),
      interactionObject(root, "food", "Pack sealed food for the survivors", [4.7, 0, -38], hospitalFoodCache(materials)),
      interactionObject(root, "meds", "Take refrigerated antivirals", [-4.7, 0, -59], createEquipmentModel("medkit", 0.86)),
      interactionObject(root, "bike", "Take the elevator to Floor 3", [0, 0, -99], hospitalElevatorBank(materials, "03", true)),
    );
  } else if (chapter === "checkpoint") {
    root.add(
      operatingLamp(materials, 0, -47),
      wheelchair(materials, 5.3, -76, -Math.PI / 2),
    );
    interactions.push(
      interactionObject(root, "checkpoint-radio", "Answer the isolation intercom", [-4.7, 0, -19], createEquipmentModel("radio", 0.82)),
      interactionObject(root, "fuse", "Replace the pressure-door fuse", [4.8, 0, -43], hospitalPowerConsole(materials)),
      interactionObject(root, "survivor-family", "Escort the hidden family", [-4.7, 0, -78], hospitalSurvivorCot(materials, true)),
      interactionObject(root, "checkpoint-gate", "Open the research stairwell", [0, 0, -99], hospitalElevatorBank(materials, "04", false)),
    );
  } else if (chapter === "depot") {
    root.add(
      pharmacyShelf(materials, -7.7, -20, Math.PI / 2),
      pharmacyShelf(materials, 7.7, -28, -Math.PI / 2),
      operatingLamp(materials, -1.8, -55),
      mutationSpecimenPod(materials, -5.7, -70),
      mutationSpecimenPod(materials, 5.8, -83),
    );
    collisions.push(
      { x: -5.7, z: -70, radius: 0.9 },
      { x: 5.8, z: -83, radius: 0.9 },
    );
    interactions.push(
      interactionObject(root, "depot-key", "Recover the pharmacy access card", [-4.8, 0, -18], createEquipmentModel("radio", 0.7)),
      interactionObject(root, "battery", "Secure the antiviral case", [4.8, 0, -42], createEquipmentModel("medkit", 0.9)),
      interactionObject(root, "food-cart", "Take nutrition packs", [-4.7, 0, -58], hospitalFoodCache(materials)),
      interactionObject(root, "bus", "Return to the ground-floor safe wing", [0, 0, -99], hospitalElevatorBank(materials, "G", true)),
    );
  } else if (chapter === "escape") {
    const foodCache = hospitalFoodCache(materials);
    foodCache.position.set(5.8, 0, -34);
    const survivorCot = hospitalSurvivorCot(materials, true);
    survivorCot.position.set(-5.3, 0, -75);
    root.add(
      foodCache,
      survivorCot,
      wheelchair(materials, -5.6, -38, Math.PI / 2),
    );
    const safeDoor = hospitalElevatorBank(materials, "SHELTER 04", true);
    safeDoor.position.set(0, 0, -102.6);
    root.add(safeDoor);
  } else {
    root.add(
      mutationSpecimenPod(materials, -5.8, -24),
      mutationSpecimenPod(materials, 5.8, -48),
      mutationSpecimenPod(materials, -5.7, -78),
    );
    collisions.push(
      { x: -5.8, z: -24, radius: 0.9 },
      { x: 5.8, z: -48, radius: 0.9 },
      { x: -5.7, z: -78, radius: 0.9 },
    );
  }

  return {
    root,
    collisions,
    interactions,
    start: new THREE.Vector3(0, 0, 5.5),
    bounds: { minX: -8.1, maxX: 8.1, minZ: -101.5, maxZ: 6.5 },
  };
}

export function buildWorld(chapter: GameChapter): BuiltWorld {
  const materials = createMaterials();
  // Floors are being migrated off the shared corridor one at a time.
  if (chapter === "hospital") return buildHospital(materials);
  if (chapter === "street") return buildWard2(materials);
  return buildHospitalWing(materials, chapter);
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
