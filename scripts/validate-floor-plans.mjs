// Structural validation for room-graph floor plans.
//
// Catches the failure mode that matters most when authoring a floor: a doorway
// declared on the wrong wall, so a room — and any objective inside it — ends up
// sealed off. Flood-fills the compiled occupancy grid from the player start and
// requires every room and every declared opening to be reachable.
//
// Run with: npm run validate:floors

import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";

const WALKABLE = 1;

async function loadModules() {
  // Built inside the project rather than the system temp directory: `three` is
  // left external, so the emitted bundle only resolves it from a location that
  // can see the project's node_modules.
  const outdir = await mkdtemp(join("node_modules", ".cache", "lbo-floors-"));
  await build({
    entryPoints: ["app/game3d/floorPlan.ts", "app/game3d/floors.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["three"],
    outdir,
    logLevel: "error",
  });
  const floorPlan = await import(pathToFileURL(join(outdir, "floorPlan.js")).href);
  const floors = await import(pathToFileURL(join(outdir, "floors.js")).href);
  return { floorPlan, floors, cleanup: () => rm(outdir, { recursive: true, force: true }) };
}

function stubMaterials() {
  const make = () => new THREE.MeshBasicMaterial();
  return {
    floor: make(),
    wall: make(),
    ceiling: make(),
    trim: make(),
    door: make(),
    doorGlass: make(),
  };
}

function floodFill(grid, startX, startZ) {
  const cell = (x, z) => [
    Math.floor((x - grid.originX) / grid.cell),
    Math.floor((z - grid.originZ) / grid.cell),
  ];
  const index = (cx, rz) => rz * grid.width + cx;
  const seen = new Uint8Array(grid.width * grid.height);
  const [sx, sz] = cell(startX, startZ);
  if (sx < 0 || sz < 0 || sx >= grid.width || sz >= grid.height) return { seen, cell, index };
  const queue = [[sx, sz]];
  seen[index(sx, sz)] = 1;
  while (queue.length) {
    const [cx, rz] = queue.pop();
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const nz = rz + dz;
      if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
      const at = index(nx, nz);
      if (seen[at]) continue;
      if ((grid.data[at] & WALKABLE) === 0) continue;
      seen[at] = 1;
      queue.push([nx, nz]);
    }
  }
  return { seen, cell, index };
}

function validatePlan(name, plan, floorPlan) {
  const compiled = floorPlan.compileFloor(plan, stubMaterials());
  const { grid } = compiled;
  const { seen, cell, index } = floodFill(grid, compiled.start.x, compiled.start.z);
  const failures = [];

  const reachable = (x, z) => {
    const [cx, rz] = cell(x, z);
    if (cx < 0 || rz < 0 || cx >= grid.width || rz >= grid.height) return false;
    return seen[index(cx, rz)] === 1;
  };

  const roomIds = new Set(plan.rooms.map((room) => room.id));

  for (const room of plan.rooms) {
    if (!floorPlan.gridAllows(grid, room.center[0], room.center[1], 0.48)) {
      failures.push(`${room.id}: centre is not standable (room too small, or a prop wall overlaps it)`);
      continue;
    }
    if (!reachable(room.center[0], room.center[1])) {
      failures.push(`${room.id}: unreachable from the player start — check the wall side on its opening`);
    }
  }

  for (const opening of plan.openings) {
    if (!roomIds.has(opening.a)) failures.push(`opening references unknown room "${opening.a}"`);
    if (!roomIds.has(opening.b)) failures.push(`opening references unknown room "${opening.b}"`);
  }

  // An opening must sit on a boundary the two rooms actually share, otherwise it
  // cuts a hole in an outside wall and the far room stays sealed.
  const byId = new Map(plan.rooms.map((room) => [room.id, room]));
  for (const opening of plan.openings) {
    const a = byId.get(opening.a);
    const b = byId.get(opening.b);
    if (!a || !b) continue;
    const edge = (room, side) => {
      const [cx, cz] = room.center;
      const [sx, sz] = room.size;
      if (side === "south") return cz - sz / 2;
      if (side === "north") return cz + sz / 2;
      if (side === "west") return cx - sx / 2;
      return cx + sx / 2;
    };
    const line = edge(a, opening.wall);
    const vertical = opening.wall === "east" || opening.wall === "west";
    const bLow = vertical ? b.center[0] - b.size[0] / 2 : b.center[1] - b.size[1] / 2;
    const bHigh = vertical ? b.center[0] + b.size[0] / 2 : b.center[1] + b.size[1] / 2;
    if (Math.abs(bLow - line) > 0.01 && Math.abs(bHigh - line) > 0.01) {
      failures.push(
        `opening ${opening.a} -> ${opening.b} on "${opening.wall}" sits at ${line.toFixed(2)}, ` +
          `which is not an edge of ${opening.b} (${bLow.toFixed(2)}..${bHigh.toFixed(2)})`,
      );
    }
  }

  let walkable = 0;
  for (const value of grid.data) if (value & WALKABLE) walkable += 1;
  let reachedCells = 0;
  for (const value of seen) if (value) reachedCells += 1;

  console.log(
    `${name}: ${plan.rooms.length} rooms, ${plan.openings.length} openings, ` +
      `grid ${grid.width}x${grid.height}, ${reachedCells}/${walkable} walkable cells reachable`,
  );
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  return failures.length;
}

const { floorPlan, floors, cleanup } = await loadModules();
let failed = 0;
try {
  for (const [name, plan] of Object.entries(floors)) {
    if (!plan || !Array.isArray(plan.rooms)) continue;
    failed += validatePlan(name, plan, floorPlan);
  }
} finally {
  await cleanup();
}

if (failed) {
  console.error(`\n${failed} floor-plan problem(s) found.`);
  process.exit(1);
}
console.log("floor plans valid — every room and objective is reachable");
