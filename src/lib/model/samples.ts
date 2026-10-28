import type { BuildingType, Project, RoomType } from "./types";
import { createProject, addRoom, generateWalls, addOpeningNear, getFloor } from "./ops";
import { makeRoom } from "./defaults";
import { M_PER_FT } from "./units";

export interface SampleInfo {
  key: string;
  title: string;
  description: string;
  build: () => Project;
}

type RoomSpec = [RoomType, string, number, number, number, number]; // type, name, x, y, w, d  (feet)

function build(
  name: string,
  widthFt: number,
  depthFt: number,
  type: BuildingType,
  floorsSpec: RoomSpec[][],
  openings: Array<{ floor: number; kind: "door" | "window"; x: number; y: number }>,
): Project {
  let p = createProject({
    name,
    plotWidth: widthFt * M_PER_FT,
    plotDepth: depthFt * M_PER_FT,
    unitSystem: "imperial",
    buildingType: type,
    floors: floorsSpec.length,
  });
  floorsSpec.forEach((rooms, fi) => {
    const floorId = p.floors[fi].id;
    for (const [rt, rname, x, y, w, d] of rooms) {
      p = addRoom(p, floorId, makeRoom(rt, x * M_PER_FT, y * M_PER_FT, { width: w * M_PER_FT, depth: d * M_PER_FT }, rname));
    }
    p = generateWalls(p, floorId);
  });
  for (const o of openings) {
    const floorId = p.floors[o.floor].id;
    const res = addOpeningNear(p, floorId, o.kind, o.x * M_PER_FT, o.y * M_PER_FT, 0.5);
    if ("project" in res) p = res.project;
  }
  void getFloor;
  return p;
}

export const SAMPLES: SampleInfo[] = [
  {
    key: "gaj25",
    title: "25-gaj compact home (15 × 15 ft, 2 floors)",
    description: "A very small plot (about 225 sq ft). Illustrative layout only.",
    build: () =>
      build(
        "Sample: 25-gaj compact home",
        15,
        15,
        "duplex",
        [
          [
            ["living", "Living", 0, 0, 9, 8],
            ["kitchen", "Kitchen", 9, 0, 6, 8],
            ["bedroom", "Bedroom", 0, 8, 9, 7],
            ["bathroom", "Bathroom", 9, 8, 6, 4],
            ["staircase", "Stairs", 9, 12, 6, 3],
          ],
          [
            ["bedroom", "Bedroom 1", 0, 0, 9, 8],
            ["bedroom", "Bedroom 2", 9, 0, 6, 8],
            ["study", "Study", 0, 8, 9, 7],
            ["bathroom", "Bathroom", 9, 8, 6, 4],
            ["staircase", "Stairs", 9, 12, 6, 3],
          ],
        ],
        [
          { floor: 0, kind: "door", x: 4.5, y: 0 },
          { floor: 0, kind: "window", x: 12, y: 0 },
          { floor: 0, kind: "window", x: 0, y: 11 },
          { floor: 1, kind: "window", x: 4.5, y: 0 },
        ],
      ),
  },
  {
    key: "duplex30x40",
    title: "30 × 40 ft duplex",
    description: "Two floors on a common mid-size plot. Illustrative layout only.",
    build: () =>
      build(
        "Sample: 30 x 40 ft duplex",
        30,
        40,
        "duplex",
        [
          [
            ["living", "Living room", 0, 0, 16, 14],
            ["dining", "Dining", 16, 0, 14, 12],
            ["kitchen", "Kitchen", 16, 12, 14, 10],
            ["bedroom", "Bedroom", 0, 14, 16, 12],
            ["bathroom", "Bathroom", 0, 26, 8, 8],
            ["staircase", "Staircase", 16, 22, 5, 12],
            ["garage", "Parking", 0, 34, 30, 6],
          ],
          [
            ["master-bedroom", "Master bedroom", 0, 0, 16, 14],
            ["bedroom", "Bedroom 2", 16, 0, 14, 12],
            ["bedroom", "Bedroom 3", 0, 14, 16, 12],
            ["bathroom", "Bathroom", 0, 26, 8, 8],
            ["staircase", "Staircase", 16, 22, 5, 12],
            ["balcony", "Balcony", 0, 34, 30, 6],
          ],
        ],
        [
          { floor: 0, kind: "door", x: 8, y: 0 },
          { floor: 0, kind: "window", x: 23, y: 0 },
          { floor: 1, kind: "window", x: 8, y: 0 },
        ],
      ),
  },
  {
    key: "narrow",
    title: "Narrow 12 × 50 ft plot (single floor)",
    description: "A long, narrow plot with rooms in a row. Illustrative layout only.",
    build: () =>
      build(
        "Sample: narrow 12 x 50 ft",
        12,
        50,
        "single-floor",
        [
          [
            ["living", "Living", 0, 0, 12, 14],
            ["kitchen", "Kitchen", 0, 14, 12, 10],
            ["bedroom", "Bedroom", 0, 24, 12, 14],
            ["bathroom", "Bathroom", 0, 38, 6, 8],
            ["utility", "Utility", 6, 38, 6, 8],
          ],
        ],
        [
          { floor: 0, kind: "door", x: 6, y: 0 },
          { floor: 0, kind: "window", x: 12, y: 31 },
        ],
      ),
  },
];
