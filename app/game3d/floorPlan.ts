import * as THREE from "three";

// Room-graph floor plans.
//
// The campaign used to build every floor as one straight corridor, which meant
// the player could read a whole level at a glance and every floor looked like
// the ward. A floor is now described as rooms plus the openings between them,
// and this module compiles that description into geometry, collision and
// spawnable space.
//
// Rooms are axis-aligned rectangles. That is a deliberate restriction: it makes
// shared-wall merging, doorway cutting and grid rasterisation tractable, and
// real hospital plans are orthogonal anyway. Non-rectangular spaces are made by
// overlapping two rooms joined with an `arch` opening.

export type RoomKind =
  | "corridor"
  | "ward"
  | "sideroom"
  | "nurse"
  | "stair"
  | "lobby"
  | "plant"
  | "cell"
  | "aisle"
  | "store";

/**
 * Which edge of a room a doorway is cut into. The campaign travels toward
 * negative z, so `south` is the low-z edge and `north` the high-z one;
 * `west` is low x and `east` high x.
 */
export type WallSide = "north" | "south" | "east" | "west";

export type Room = {
  id: string;
  kind: RoomKind;
  /** Centre, metres. */
  center: [number, number];
  /**
   * Structural size (x, z) measured wall-centreline to wall-centreline. Two
   * rooms whose edges coincide therefore share one wall centreline, which is
   * what lets the compiler merge them into a single partition instead of
   * emitting two parallel slabs with a gap between them. Interior clear space
   * is this minus one wall thickness.
   */
  size: [number, number];
  /** Interior clear height to the suspended ceiling, metres. */
  ceiling: number;
  light: "rows" | "single" | "sconce" | "emergency" | "dead";
  /** Door plaque or wall sign text. */
  plaque?: string;
};

export type Opening = {
  /** Room the wall belongs to. */
  a: string;
  /** Room on the far side. */
  b: string;
  wall: WallSide;
  /** Distance along the wall from room a's centre, metres. */
  offset: number;
  width: number;
  kind: "arch" | "hinged" | "double";
  state: "open" | "closed";
  /** Hinge side for a single leaf. */
  swing?: -1 | 1;
};

export type FloorPlan = {
  title: string;
  subtitle: string;
  rooms: Room[];
  openings: Opening[];
  startRoom: string;
  /** Critical path through the floor, used for progress and spawn distance. */
  route: string[];
};

/**
 * Walkability raster. Replaces the old rectangular bounds check plus a linear
 * scan of collision circles, which could not describe a non-rectangular plan
 * and grew more expensive with every prop added.
 */
export type OccupancyGrid = {
  originX: number;
  originZ: number;
  cell: number;
  width: number;
  height: number;
  /** bit 0 walkable, bit 1 blocks sight. */
  data: Uint8Array;
};

export const WALKABLE = 1;
export const OPAQUE = 2;

const WALL_THICKNESS = 0.15;
const GRID_CELL = 0.25;

export function gridIndex(grid: OccupancyGrid, x: number, z: number) {
  const column = Math.floor((x - grid.originX) / grid.cell);
  const row = Math.floor((z - grid.originZ) / grid.cell);
  if (
    column < 0 ||
    row < 0 ||
    column >= grid.width ||
    row >= grid.height
  ) {
    return -1;
  }
  return row * grid.width + column;
}

/** True when a disc of `radius` centred on (x, z) sits entirely on walkable cells. */
export function gridAllows(
  grid: OccupancyGrid,
  x: number,
  z: number,
  radius: number,
) {
  for (let offsetX = -radius; offsetX <= radius; offsetX += grid.cell) {
    for (let offsetZ = -radius; offsetZ <= radius; offsetZ += grid.cell) {
      if (offsetX * offsetX + offsetZ * offsetZ > radius * radius) continue;
      const index = gridIndex(grid, x + offsetX, z + offsetZ);
      if (index < 0 || (grid.data[index] & WALKABLE) === 0) return false;
    }
  }
  return true;
}

/** Bresenham walk over the sight-blocking bit. */
export function gridSees(
  grid: OccupancyGrid,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
) {
  const steps = Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / grid.cell);
  if (steps <= 0) return true;
  const stepX = (toX - fromX) / steps;
  const stepZ = (toZ - fromZ) / steps;
  for (let step = 1; step < steps; step += 1) {
    const index = gridIndex(grid, fromX + stepX * step, fromZ + stepZ * step);
    if (index < 0) return false;
    if ((grid.data[index] & OPAQUE) !== 0) return false;
  }
  return true;
}

/**
 * Breadth-first distance field over walkable cells, measured from a target.
 *
 * Enemies used to walk straight at the player, which is fine in a tube and
 * useless in rooms: they wedged in doorways and never arrived, which could
 * leave an encounter permanently uncleared. Reading a flow field instead means
 * they route through openings without needing a navmesh.
 *
 * Unreachable cells stay at -1.
 */
export function computeFlowField(
  grid: OccupancyGrid,
  targetX: number,
  targetZ: number,
  scratch?: Int32Array,
) {
  const size = grid.width * grid.height;
  const distance = scratch && scratch.length === size ? scratch : new Int32Array(size);
  distance.fill(-1);

  const column = Math.floor((targetX - grid.originX) / grid.cell);
  const row = Math.floor((targetZ - grid.originZ) / grid.cell);
  if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) {
    return distance;
  }
  const start = row * grid.width + column;
  if ((grid.data[start] & WALKABLE) === 0) return distance;

  // Ring buffer sized to the grid; BFS visits each cell at most once.
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  distance[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const index = queue[head++];
    const cx = index % grid.width;
    const cz = (index - cx) / grid.width;
    const next = distance[index] + 1;
    for (let step = 0; step < 8; step += 1) {
      const dx = FLOW_NEIGHBOURS[step * 2];
      const dz = FLOW_NEIGHBOURS[step * 2 + 1];
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
      const at = nz * grid.width + nx;
      if (distance[at] >= 0) continue;
      if ((grid.data[at] & WALKABLE) === 0) continue;
      // Never cut a diagonal through a wall corner.
      if (dx !== 0 && dz !== 0) {
        const sideA = cz * grid.width + (cx + dx);
        const sideB = (cz + dz) * grid.width + cx;
        if ((grid.data[sideA] & WALKABLE) === 0) continue;
        if ((grid.data[sideB] & WALKABLE) === 0) continue;
      }
      distance[at] = next;
      queue[tail++] = at;
    }
  }
  return distance;
}

const FLOW_NEIGHBOURS = new Int8Array([
  1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1,
]);

/**
 * Unit direction from (x, z) toward the flow field's target, or null when the
 * position is off-grid or in a pocket with no route.
 */
export function flowDirection(
  grid: OccupancyGrid,
  distance: Int32Array,
  x: number,
  z: number,
): { x: number; z: number } | null {
  const column = Math.floor((x - grid.originX) / grid.cell);
  const row = Math.floor((z - grid.originZ) / grid.cell);
  if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) {
    return null;
  }
  const here = distance[row * grid.width + column];
  if (here < 0) return null;
  if (here === 0) return { x: 0, z: 0 };

  // Averaging every descending neighbour rather than taking the single best
  // one keeps a mover centred in an opening. Picking one neighbour lets it hug
  // the wall beside a door and then fail to fit through the gap, which is what
  // stranded enemies against door frames.
  let sumX = 0;
  let sumZ = 0;
  let fallbackX = 0;
  let fallbackZ = 0;
  let bestValue = here;
  for (let step = 0; step < 8; step += 1) {
    const dx = FLOW_NEIGHBOURS[step * 2];
    const dz = FLOW_NEIGHBOURS[step * 2 + 1];
    const nx = column + dx;
    const nz = row + dz;
    if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
    const value = distance[nz * grid.width + nx];
    if (value < 0 || value >= here) continue;
    const weight = here - value;
    const length = Math.hypot(dx, dz) || 1;
    sumX += (dx / length) * weight;
    sumZ += (dz / length) * weight;
    if (value < bestValue) {
      bestValue = value;
      fallbackX = dx / length;
      fallbackZ = dz / length;
    }
  }
  const magnitude = Math.hypot(sumX, sumZ);
  if (magnitude > 0.0001) {
    return { x: sumX / magnitude, z: sumZ / magnitude };
  }
  if (fallbackX === 0 && fallbackZ === 0) return null;
  return { x: fallbackX, z: fallbackZ };
}

type Interval = { min: number; max: number };

type WallRun = {
  /** "alongX" runs in x at a fixed z; "alongZ" runs in z at a fixed x. */
  axis: "alongX" | "alongZ";
  fixed: number;
  intervals: Interval[];
  height: number;
};

/** Wall centrelines. Shared edges between rooms produce identical values. */
function roomBounds(room: Room) {
  const [cx, cz] = room.center;
  const [sx, sz] = room.size;
  return {
    x0: cx - sx / 2,
    x1: cx + sx / 2,
    z0: cz - sz / 2,
    z1: cz + sz / 2,
  };
}

/** Walkable interior, inset from the centrelines by half a wall. */
function roomInterior(room: Room) {
  const bounds = roomBounds(room);
  const inset = WALL_THICKNESS / 2;
  return {
    x0: bounds.x0 + inset,
    x1: bounds.x1 - inset,
    z0: bounds.z0 + inset,
    z1: bounds.z1 - inset,
  };
}

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length === 0) return intervals;
  const sorted = [...intervals].sort((a, b) => a.min - b.min);
  const merged: Interval[] = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.min <= last.max + 0.001) {
      last.max = Math.max(last.max, interval.max);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function subtractInterval(intervals: Interval[], cut: Interval) {
  const result: Interval[] = [];
  for (const interval of intervals) {
    if (cut.max <= interval.min || cut.min >= interval.max) {
      result.push(interval);
      continue;
    }
    if (cut.min > interval.min) {
      result.push({ min: interval.min, max: cut.min });
    }
    if (cut.max < interval.max) {
      result.push({ min: cut.max, max: interval.max });
    }
  }
  return result;
}

/**
 * Where an opening sits in world space, derived from the wall it is cut into.
 * Returns the fixed coordinate of the wall line and the span along it.
 */
function openingSpan(room: Room, opening: Opening) {
  const bounds = roomBounds(room);
  const half = opening.width / 2;
  if (opening.wall === "north" || opening.wall === "south") {
    // The campaign runs toward negative z, so "south" is the low-z edge — the
    // wall you leave a room through on the way deeper into the floor.
    const fixed = opening.wall === "south" ? bounds.z0 : bounds.z1;
    const centre = room.center[0] + opening.offset;
    return {
      axis: "alongX" as const,
      fixed,
      span: { min: centre - half, max: centre + half },
      centre,
    };
  }
  const fixed = opening.wall === "west" ? bounds.x0 : bounds.x1;
  const centre = room.center[1] + opening.offset;
  return {
    axis: "alongZ" as const,
    fixed,
    span: { min: centre - half, max: centre + half },
    centre,
  };
}

export type CompiledFloor = {
  root: THREE.Group;
  grid: OccupancyGrid;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  start: THREE.Vector3;
  /** One legal standing position per room, for spawning out of sight. */
  spawnPoints: Array<{ room: string; position: THREE.Vector3 }>;
  roomCentres: Map<string, THREE.Vector3>;
};

export type FloorMaterials = {
  floor: THREE.Material;
  wall: THREE.Material;
  ceiling: THREE.Material;
  trim: THREE.Material;
  door: THREE.Material;
  doorGlass: THREE.Material;
};

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Builds the geometry, collision grid and spawn space for a floor plan. */
export function compileFloor(
  plan: FloorPlan,
  materials: FloorMaterials,
): CompiledFloor {
  const root = new THREE.Group();
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));

  // ---- extents -----------------------------------------------------------
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const room of plan.rooms) {
    const bounds = roomBounds(room);
    minX = Math.min(minX, bounds.x0);
    maxX = Math.max(maxX, bounds.x1);
    minZ = Math.min(minZ, bounds.z0);
    maxZ = Math.max(maxZ, bounds.z1);
  }
  const pad = WALL_THICKNESS * 2 + GRID_CELL * 2;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;

  // ---- occupancy grid ----------------------------------------------------
  const grid: OccupancyGrid = {
    originX: minX,
    originZ: minZ,
    cell: GRID_CELL,
    width: Math.ceil((maxX - minX) / GRID_CELL),
    height: Math.ceil((maxZ - minZ) / GRID_CELL),
    data: new Uint8Array(0),
  };
  grid.data = new Uint8Array(grid.width * grid.height);

  const paintRect = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    set: number,
    clear: number,
  ) => {
    const columnStart = Math.max(0, Math.floor((x0 - grid.originX) / grid.cell));
    const columnEnd = Math.min(
      grid.width - 1,
      Math.ceil((x1 - grid.originX) / grid.cell),
    );
    const rowStart = Math.max(0, Math.floor((z0 - grid.originZ) / grid.cell));
    const rowEnd = Math.min(
      grid.height - 1,
      Math.ceil((z1 - grid.originZ) / grid.cell),
    );
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let column = columnStart; column <= columnEnd; column += 1) {
        const index = row * grid.width + column;
        grid.data[index] = (grid.data[index] & ~clear) | set;
      }
    }
  };

  // ---- floors, ceilings, room interiors ----------------------------------
  for (const room of plan.rooms) {
    const interior = roomInterior(room);
    const [sx, sz] = room.size;
    const [cx, cz] = room.center;

    // Slab and ceiling span the full structural rectangle so they meet under
    // the walls rather than leaving a seam at every partition.
    addBox(root, [sx, 0.12, sz], [cx, -0.06, cz], materials.floor);
    // Suspended ceiling at the room's own height. Varying this per room is the
    // main emotional control in first person: a 2.3 m plant room feels nothing
    // like a 3.4 m vestibule.
    addBox(
      root,
      [sx, 0.1, sz],
      [cx, room.ceiling + 0.05, cz],
      materials.ceiling,
    );

    paintRect(
      interior.x0,
      interior.x1,
      interior.z0,
      interior.z1,
      WALKABLE,
      OPAQUE,
    );
  }

  // ---- wall runs, deduplicated across shared boundaries -------------------
  const runs = new Map<string, WallRun>();
  const runKey = (axis: WallRun["axis"], fixed: number) =>
    `${axis}:${fixed.toFixed(2)}`;

  const addRun = (
    axis: WallRun["axis"],
    fixed: number,
    interval: Interval,
    height: number,
  ) => {
    const key = runKey(axis, fixed);
    const existing = runs.get(key);
    if (existing) {
      existing.intervals.push(interval);
      existing.height = Math.max(existing.height, height);
      return;
    }
    runs.set(key, { axis, fixed, intervals: [interval], height });
  };

  for (const room of plan.rooms) {
    const bounds = roomBounds(room);
    const height = room.ceiling;
    // Runs extend half a thickness past each corner so corners are filled.
    const half = WALL_THICKNESS / 2;
    const spanX = { min: bounds.x0 - half, max: bounds.x1 + half };
    const spanZ = { min: bounds.z0 - half, max: bounds.z1 + half };
    addRun("alongX", bounds.z0, { ...spanX }, height);
    addRun("alongX", bounds.z1, { ...spanX }, height);
    addRun("alongZ", bounds.x0, { ...spanZ }, height);
    addRun("alongZ", bounds.x1, { ...spanZ }, height);
  }

  for (const run of runs.values()) {
    run.intervals = mergeIntervals(run.intervals);
  }

  // ---- cut the openings out of the runs ----------------------------------
  const doorways: Array<{
    axis: "alongX" | "alongZ";
    fixed: number;
    centre: number;
    width: number;
    height: number;
    opening: Opening;
  }> = [];

  const HEAD_HEIGHT = 2.1;

  for (const opening of plan.openings) {
    const room = roomsById.get(opening.a);
    if (!room) continue;
    const placement = openingSpan(room, opening);
    const key = runKey(placement.axis, placement.fixed);
    const run = runs.get(key);
    if (!run) continue;
    run.intervals = subtractInterval(run.intervals, placement.span);
    doorways.push({
      axis: placement.axis,
      fixed: placement.fixed,
      centre: placement.centre,
      width: opening.width,
      height: run.height,
      opening,
    });

  }

  // ---- emit wall geometry -------------------------------------------------
  for (const run of runs.values()) {
    for (const interval of run.intervals) {
      const length = interval.max - interval.min;
      if (length < 0.02) continue;
      const centre = (interval.min + interval.max) / 2;
      if (run.axis === "alongX") {
        addBox(
          root,
          [length, run.height, WALL_THICKNESS],
          [centre, run.height / 2, run.fixed],
          materials.wall,
        );
        addBox(
          root,
          [length, 0.1, WALL_THICKNESS + 0.04],
          [centre, 0.05, run.fixed],
          materials.trim,
        );
        paintRect(
          interval.min,
          interval.max,
          run.fixed - WALL_THICKNESS / 2,
          run.fixed + WALL_THICKNESS / 2,
          OPAQUE,
          WALKABLE,
        );
      } else {
        addBox(
          root,
          [WALL_THICKNESS, run.height, length],
          [run.fixed, run.height / 2, centre],
          materials.wall,
        );
        addBox(
          root,
          [WALL_THICKNESS + 0.04, 0.1, length],
          [run.fixed, 0.05, centre],
          materials.trim,
        );
        paintRect(
          run.fixed - WALL_THICKNESS / 2,
          run.fixed + WALL_THICKNESS / 2,
          interval.min,
          interval.max,
          OPAQUE,
          WALKABLE,
        );
      }
    }
  }

  // ---- doorway walkability, painted last ---------------------------------
  // Walls must rasterise outward or a 0.15 m partition could miss the 0.25 m
  // grid entirely and stop blocking. That outward rounding also bleeds a cell
  // into each side of every opening, which turned a 1.2 m door into roughly
  // 0.7 m of clearance — narrower than an enemy, so they wedged in door frames
  // and never arrived. Repainting the openings after the walls gives the
  // doorway back its full width.
  for (const doorway of doorways) {
    const half = doorway.width / 2 - 0.02;
    const seeThrough =
      doorway.opening.state === "open" || doorway.opening.kind === "arch";
    const set = WALKABLE | (seeThrough ? 0 : OPAQUE);
    const clear = seeThrough ? OPAQUE : 0;
    if (doorway.axis === "alongX") {
      paintRect(
        doorway.centre - half,
        doorway.centre + half,
        doorway.fixed - WALL_THICKNESS,
        doorway.fixed + WALL_THICKNESS,
        set,
        clear,
      );
    } else {
      paintRect(
        doorway.fixed - WALL_THICKNESS,
        doorway.fixed + WALL_THICKNESS,
        doorway.centre - half,
        doorway.centre + half,
        set,
        clear,
      );
    }
  }

  // ---- door assemblies ----------------------------------------------------
  for (const doorway of doorways) {
    const { opening } = doorway;
    const headHeight = Math.min(HEAD_HEIGHT, doorway.height - 0.1);
    const lintelHeight = doorway.height - headHeight;

    const frame = new THREE.Group();
    frame.position.set(
      doorway.axis === "alongX" ? doorway.centre : doorway.fixed,
      0,
      doorway.axis === "alongX" ? doorway.fixed : doorway.centre,
    );
    if (doorway.axis === "alongZ") frame.rotation.y = Math.PI / 2;
    root.add(frame);

    // Lintel above the opening, so the wall reads as continuous.
    if (lintelHeight > 0.02) {
      addBox(
        frame,
        [doorway.width + WALL_THICKNESS * 2, lintelHeight, WALL_THICKNESS],
        [0, headHeight + lintelHeight / 2, 0],
        materials.wall,
      );
    }
    // Jambs.
    for (const side of [-1, 1] as const) {
      addBox(
        frame,
        [0.06, headHeight, WALL_THICKNESS + 0.03],
        [side * (doorway.width / 2 + 0.03), headHeight / 2, 0],
        materials.trim,
      );
    }

    if (opening.kind === "arch") continue;

    const leafWidth =
      opening.kind === "double" ? doorway.width / 2 : doorway.width;
    const leaves = opening.kind === "double" ? [-1, 1] : [opening.swing ?? 1];
    for (const side of leaves) {
      const pivot = new THREE.Group();
      pivot.position.set(
        opening.kind === "double" ? side * (doorway.width / 2) : side * (leafWidth / 2),
        0,
        0,
      );
      // An open leaf swings back against the wall rather than standing in the
      // doorway; a closed one fills it.
      pivot.rotation.y =
        opening.state === "open" ? side * -1.85 : 0;
      frame.add(pivot);

      const leaf = new THREE.Group();
      leaf.position.set(-side * (leafWidth / 2), 0, 0);
      pivot.add(leaf);

      addBox(
        leaf,
        [leafWidth - 0.02, headHeight - 0.04, 0.045],
        [0, (headHeight - 0.04) / 2, 0],
        materials.door,
      );
      // Vision panel, 300 x 700 centred at 1500 — the real detail that makes a
      // hospital door read as a hospital door.
      addBox(
        leaf,
        [Math.min(0.3, leafWidth * 0.4), 0.7, 0.05],
        [0, 1.5, 0],
        materials.doorGlass,
      );
      // Kick plate.
      addBox(
        leaf,
        [leafWidth - 0.06, 0.2, 0.052],
        [0, 0.14, 0],
        materials.trim,
      );
      // Lever handle at 1050.
      addBox(
        leaf,
        [0.12, 0.03, 0.09],
        [side * (leafWidth / 2 - 0.11), 1.05, 0.055],
        materials.trim,
      );
    }
  }

  // ---- spawn points and room centres -------------------------------------
  const spawnPoints: Array<{ room: string; position: THREE.Vector3 }> = [];
  const roomCentres = new Map<string, THREE.Vector3>();
  for (const room of plan.rooms) {
    const centre = new THREE.Vector3(room.center[0], 0, room.center[1]);
    roomCentres.set(room.id, centre);
    if (gridAllows(grid, centre.x, centre.z, 0.5)) {
      spawnPoints.push({ room: room.id, position: centre.clone() });
    }
  }

  const startRoom = roomsById.get(plan.startRoom) ?? plan.rooms[0];
  const start = new THREE.Vector3(
    startRoom.center[0],
    0,
    startRoom.center[1],
  );

  return {
    root,
    grid,
    bounds: { minX, maxX, minZ, maxZ },
    start,
    spawnPoints,
    roomCentres,
  };
}
