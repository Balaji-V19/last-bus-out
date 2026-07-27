import type { FloorPlan } from "./floorPlan";

// Authored floor plans. One per campaign chapter as they are migrated off the
// old shared corridor.
//
// Coordinates are wall centrelines in metres, so rooms whose edges match share
// a partition. The player starts around positive z and works toward negative z,
// which keeps the existing escape-progress and spawn-distance maths pointing the
// right way.

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
      width: 1.2,
      kind: "hinged",
      state: "open",
      swing: 1,
    },
    {
      a: "triage",
      b: "bayB",
      wall: "west",
      offset: -4,
      width: 1.2,
      kind: "hinged",
      state: "closed",
      swing: -1,
    },
    {
      a: "triage",
      b: "nurse",
      wall: "east",
      offset: 2,
      width: 1.8,
      kind: "arch",
      state: "open",
    },
    {
      a: "nurse",
      b: "resus",
      wall: "south",
      offset: 0,
      width: 1.2,
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
      width: 1.2,
      kind: "hinged",
      state: "open",
      swing: 1,
    },
    {
      a: "radiology",
      b: "subWait",
      wall: "south",
      offset: 0,
      width: 1.2,
      kind: "hinged",
      state: "open",
      swing: -1,
    },
    {
      a: "southHall",
      b: "stairwell",
      wall: "south",
      offset: 0,
      width: 1.8,
      kind: "double",
      state: "closed",
    },
  ],
};
