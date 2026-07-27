import type { FloorPlan } from "./floorPlan";

// Authored floor plans. One per campaign chapter as they are migrated off the
// old shared corridor.
//
// Coordinates are wall centrelines in metres, so rooms whose edges match share
// a partition. The player starts around positive z and works toward negative z,
// which keeps the existing escape-progress and spawn-distance maths pointing the
// right way.

/**
 * Floor 2 Patient Ward.
 *
 * A racetrack: four corridors forming a ring around a solid service core, with
 * four-bed bays hung off the outside and a nurse station and lift lobby off the
 * east side. The ring is the point — a runner that enters the loop behind you
 * is always one corner back and never seen head-on, and there is no sightline
 * anywhere on the floor longer than one straight.
 */
export const ward2Plan: FloorPlan = {
  title: "FLOOR 2 · PATIENT WARD",
  subtitle: "WEST WARD / SURVIVOR SEARCH",
  startRoom: "southRun",
  route: ["southRun", "westRun", "northRun", "eastRun", "liftLobby"],
  rooms: [
    { id: "northRun", kind: "corridor", center: [0, 12], size: [26, 4], ceiling: 2.7, light: "rows", ambientSeed: 11 },
    { id: "southRun", kind: "corridor", center: [0, -12], size: [26, 4], ceiling: 2.7, light: "rows", ambientSeed: 12 },
    { id: "westRun", kind: "corridor", center: [-15, 0], size: [4, 28], ceiling: 2.7, light: "rows", ambientSeed: 13 },
    { id: "eastRun", kind: "corridor", center: [15, 0], size: [4, 28], ceiling: 2.7, light: "dead", ambientSeed: 14 },
    { id: "bayA", kind: "ward", center: [-8, 18], size: [9, 8], ceiling: 2.7, light: "single", plaque: "214 · FOUR BED", ambientSeed: 21 },
    { id: "bayB", kind: "ward", center: [3, 18], size: [9, 8], ceiling: 2.7, light: "dead", plaque: "216 · FOUR BED", ambientSeed: 22 },
    { id: "bayC", kind: "ward", center: [-8, -18], size: [9, 8], ceiling: 2.7, light: "single", plaque: "203 · FOUR BED", ambientSeed: 23 },
    { id: "bayD", kind: "ward", center: [3, -18], size: [9, 8], ceiling: 2.7, light: "emergency", plaque: "205 · ISOLATION", ambientSeed: 24 },
    { id: "nurse", kind: "nurse", center: [22, 6], size: [10, 10], ceiling: 2.7, light: "single", plaque: "WARD STATION", ambientSeed: 31 },
    { id: "dayroom", kind: "lobby", center: [-22, -4], size: [10, 12], ceiling: 3, light: "sconce", plaque: "DAY ROOM", ambientSeed: 32 },
    { id: "liftLobby", kind: "stair", center: [22, -8], size: [10, 8], ceiling: 3, light: "emergency", plaque: "SERVICE LIFTS", ambientSeed: 33 },
  ],
  openings: [
    // Ring corners, full-width so the loop reads as one continuous circuit.
    { a: "northRun", b: "westRun", wall: "west", offset: 0, width: 3.5, kind: "arch", state: "open" },
    { a: "northRun", b: "eastRun", wall: "east", offset: 0, width: 3.5, kind: "arch", state: "open" },
    { a: "southRun", b: "westRun", wall: "west", offset: 0, width: 3.5, kind: "arch", state: "open" },
    { a: "southRun", b: "eastRun", wall: "east", offset: 0, width: 3.5, kind: "arch", state: "open" },
    // Bays off the outside of the ring.
    { a: "northRun", b: "bayA", wall: "north", offset: -8, width: 1.45, kind: "hinged", state: "open", swing: 1 },
    { a: "northRun", b: "bayB", wall: "north", offset: 3, width: 1.45, kind: "hinged", state: "closed", swing: -1 },
    { a: "southRun", b: "bayC", wall: "south", offset: -8, width: 1.45, kind: "hinged", state: "open", swing: -1 },
    { a: "southRun", b: "bayD", wall: "south", offset: 3, width: 1.45, kind: "hinged", state: "closed", swing: 1 },
    { a: "eastRun", b: "nurse", wall: "east", offset: 6, width: 1.9, kind: "arch", state: "open" },
    { a: "eastRun", b: "liftLobby", wall: "east", offset: -8, width: 1.9, kind: "double", state: "open" },
    { a: "westRun", b: "dayroom", wall: "west", offset: -4, width: 1.9, kind: "double", state: "open" },
  ],
};

/**
 * Ground Floor Emergency.
 *
 * L-shaped rather than a tube: the triage hall runs north-south with treatment
 * bays and a nurse station hung off it, then the route turns west through a
 * dogleg into the radiology spur before doubling back to Stairwell A. The turn
 * is the point of the layout — it is the first time the player cannot see where
 * they came from, and it puts the dead-end sub-wait off the critical path so
 * exploring it is a real decision.
 */
export const groundEmergencyPlan: FloorPlan = {
  title: "GROUND FLOOR · EMERGENCY",
  subtitle: "TRIAGE / RESUS / STAIRWELL A",
  startRoom: "vestibule",
  route: ["vestibule", "triage", "southHall", "stairwell"],
  rooms: [
    {
      id: "vestibule",
      kind: "lobby",
      center: [0, 10],
      size: [14, 10],
      ceiling: 3.4,
      light: "rows",
      plaque: "AMBULANCE RECEIVING",
    },
    {
      id: "triage",
      kind: "corridor",
      center: [0, -2],
      size: [14, 14],
      ceiling: 3.2,
      light: "rows",
      plaque: "TRIAGE HALL",
    },
    {
      id: "bayA",
      kind: "ward",
      center: [-13, 1],
      size: [12, 6],
      ceiling: 2.7,
      light: "single",
      plaque: "BAY 1 · MINORS",
    },
    {
      id: "bayB",
      kind: "ward",
      center: [-13, -6],
      size: [12, 8],
      ceiling: 2.7,
      light: "dead",
      plaque: "BAY 2 · MAJORS",
    },
    {
      id: "nurse",
      kind: "nurse",
      center: [12, 0],
      size: [10, 8],
      ceiling: 2.7,
      light: "single",
      plaque: "NURSE STATION",
    },
    {
      id: "resus",
      kind: "sideroom",
      center: [12, -9],
      size: [10, 10],
      ceiling: 2.7,
      light: "emergency",
      plaque: "RESUS 1",
    },
    {
      id: "southHall",
      kind: "corridor",
      center: [0, -13],
      size: [14, 8],
      ceiling: 2.6,
      light: "rows",
      plaque: "SOUTH LINK",
    },
    {
      id: "radiology",
      kind: "plant",
      center: [-13, -13],
      size: [12, 8],
      ceiling: 2.5,
      light: "emergency",
      plaque: "RADIOLOGY / PLANT",
    },
    {
      id: "subWait",
      kind: "store",
      center: [-13, -22],
      size: [12, 10],
      ceiling: 2.5,
      light: "dead",
      plaque: "SUB-WAIT",
    },
    {
      id: "stairwell",
      kind: "stair",
      center: [0, -22],
      size: [10, 10],
      ceiling: 3,
      light: "emergency",
      plaque: "STAIRWELL A",
    },
  ],
  openings: [
    {
      a: "vestibule",
      b: "triage",
      wall: "south",
      offset: 0,
      width: 2.4,
      kind: "double",
      state: "open",
    },
    {
      a: "triage",
      b: "bayA",
      wall: "west",
      offset: 3,
      width: 1.45,
      kind: "hinged",
      state: "open",
      swing: 1,
    },
    {
      a: "triage",
      b: "bayB",
      wall: "west",
      offset: -4,
      width: 1.45,
      kind: "hinged",
      state: "closed",
      swing: -1,
    },
    {
      a: "triage",
      b: "nurse",
      wall: "east",
      offset: 2,
      width: 1.9,
      kind: "arch",
      state: "open",
    },
    {
      a: "nurse",
      b: "resus",
      wall: "south",
      offset: 0,
      width: 1.45,
      kind: "hinged",
      state: "closed",
      swing: 1,
    },
    {
      a: "triage",
      b: "southHall",
      wall: "south",
      offset: 0,
      width: 2.4,
      kind: "double",
      state: "open",
    },
    {
      a: "southHall",
      b: "radiology",
      wall: "west",
      offset: 0,
      width: 1.45,
      kind: "hinged",
      state: "open",
      swing: 1,
    },
    {
      a: "radiology",
      b: "subWait",
      wall: "south",
      offset: 0,
      width: 1.45,
      kind: "hinged",
      state: "open",
      swing: -1,
    },
    {
      a: "southHall",
      b: "stairwell",
      wall: "south",
      offset: 0,
      width: 1.9,
      kind: "double",
      state: "closed",
    },
  ],
};
