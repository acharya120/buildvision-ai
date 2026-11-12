import { describe, expect, it } from "vitest";
import { addRoom, addOpeningOnWall, createProject, generateWalls } from "@/lib/model/ops";
import { exportIfc, ifcGuid, stepStr, stepNum } from "@/lib/bim/ifcWrite";
import { importIfc, validateIfc } from "@/lib/bim/ifcRead";
import { parseArgs } from "@/lib/bim/step";
import type { Project } from "@/lib/model/types";

function plan(): Project {
  let p = createProject({ name: "Ö House's \"test\"", plotWidth: 12, plotDepth: 9, unitSystem: "metric", buildingType: "house", floors: 2 });
  const g = p.floors[0].id;
  p = addRoom(p, g, { type: "living", x: 1, y: 1, width: 5, depth: 4 });
  p = addRoom(p, g, { type: "kitchen", x: 6, y: 1, width: 3, depth: 4 });
  p = generateWalls(p, g);
  const f1 = p.floors[1].id;
  p = addRoom(p, f1, { type: "bedroom", x: 1, y: 1, width: 4, depth: 4 });
  p = generateWalls(p, f1);
  const w = p.floors[0].walls[0];
  const a = addOpeningOnWall(p, g, w.id, "door", 1.5, { width: 0.9, height: 2.1, sill: 0 });
  if ("error" in a) throw new Error(a.error);
  const b = addOpeningOnWall(a.project, g, p.floors[0].walls[1].id, "window", 1.5, { width: 1.2, height: 1.2, sill: 0.9 });
  if ("error" in b) throw new Error(b.error);
  p = b.project;
  return p;
}

describe("STEP helpers", () => {
  it("makes stable valid guids and escapes strings and numbers", () => {
    expect(ifcGuid("a")).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(ifcGuid("a")).toBe(ifcGuid("a"));
    expect(ifcGuid("a")).not.toBe(ifcGuid("b"));
    expect(stepStr("It's Ö")).toBe("'It''s \\X2\\00D6\\X0\\'");
    expect(stepNum(2)).toBe("2.");
    expect(stepNum(0.1 + 0.2)).toBe("0.3");
    let threw = false; try { stepNum(NaN); } catch { threw = true; }
    expect(threw).toBe(true);
    expect(parseArgs("'a''b',(1.5,#3,$),.T.,IFCLABEL('x')")).toHaveLength(4);
  });
});

describe("IFC export", () => {
  it("writes a structurally valid IFC4 file with every element accounted for", () => {
    const p = plan();
    const r = exportIfc(p, { now: new Date("2026-01-01T00:00:00Z") });
    const v = validateIfc(r.text);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(r.counts.IFCBUILDINGSTOREY).toBe(2);
    expect(r.counts.IFCWALL).toBe(p.floors.reduce((s, f) => s + f.walls.length, 0));
    expect(r.counts.IFCSPACE).toBe(3);
    expect(r.counts.IFCSLAB).toBe(3);
    expect(r.counts.IFCDOOR).toBe(1);
    expect(r.counts.IFCWINDOW).toBe(1);
    expect(r.counts.IFCOPENINGELEMENT).toBe(2);
    expect(r.counts.IFCRELVOIDSELEMENT).toBe(2);
    expect(r.text).toContain("FILE_SCHEMA(('IFC4'))");
    expect(exportIfc(p, { now: new Date("2026-01-01T00:00:00Z") }).text).toBe(r.text);
  });
  it("includes indicative structure only when asked", () => {
    const p = plan();
    expect(exportIfc(p).counts.IFCCOLUMN).toBeUndefined();
    const s = exportIfc(p, { includeStructure: true });
    expect(s.counts.IFCCOLUMN).toBeGreaterThan(0);
    expect(s.counts.IFCBEAM).toBeGreaterThan(0);
    expect(validateIfc(s.text).errors).toEqual([]);
    expect(s.warnings.join(" ")).toMatch(/indicative/);
  });
  it("validator catches broken files", () => {
    const good = exportIfc(plan()).text;
    expect(validateIfc(good.replace("#10=", "#10=X;\n#10=")).ok).toBe(false);
    expect(validateIfc(good.replace(/IFCWALL\(/, "IFCWALL($,")).errors.join(" ")).toMatch(/attributes/);
    const dangling = good.replace("IFCUNITASSIGNMENT((", "IFCUNITASSIGNMENT((#99999,");
    expect(dangling).not.toBe(good);
    expect(validateIfc(dangling).errors.join(" ")).toMatch(/missing #99999/);
    expect(validateIfc("hello").ok).toBe(false);
    expect(validateIfc(good.replace("IFC4", "IFC2X3")).errors.join(" ")).toMatch(/not IFC4/);
  });
  it("round-trips rooms and walls through the importer", () => {
    const p = plan();
    const imp = importIfc(exportIfc(p).text);
    expect(imp.floors).toHaveLength(2);
    expect(imp.floors[0].rooms.map((r) => r.name).sort()).toEqual(["kitchen", "living"]);
    const liv = imp.floors[0].rooms.find((r) => r.name === "living")!;
    expect(liv.width).toBeCloseTo(5, 3);
    expect(liv.depth).toBeCloseTo(4, 3);
    // relative positions survive the y flip: living is left of kitchen, both the same height
    const kit = imp.floors[0].rooms.find((r) => r.name === "kitchen")!;
    expect(kit.x - liv.x).toBeCloseTo(5, 3);
    expect(kit.y).toBeCloseTo(liv.y, 3);
    expect(imp.floors[1].elevation).toBeCloseTo(p.floors[0].height, 3);
    expect(imp.floors[0].walls.length).toBe(p.floors[0].walls.length);
    const w0 = imp.floors[0].walls[0], o0 = p.floors[0].walls[0];
    expect(Math.hypot(w0.x2 - w0.x1, w0.y2 - w0.y1)).toBeCloseTo(Math.hypot(o0.x2 - o0.x1, o0.y2 - o0.y1), 2);
  });
  it("skips unsupported geometry and reports it, and handles junk", () => {
    const txt = exportIfc(plan()).text.replace(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,\$,#(\d+),5\.,4\.\)/, "IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#$1)");
    const imp = importIfc(txt);
    expect(Object.keys(imp.skipped).join(" ")).toMatch(/geometry/);
    expect(importIfc("not an ifc file").floors).toEqual([]);
    expect(importIfc("not an ifc file").warnings.length).toBeGreaterThan(0);
  });
});

import { parseSpots, buildGrid, interpolate, contours, slopeStats, cutFill, footprintMask, contoursSvg, type Grid, type Spot } from "@/lib/survey/topo";
import { parseCloud, detectRooms, yUpToZUp, dominantAngle } from "@/lib/survey/pointcloud";
import { buildFrame, frameCsv, staadText, analyzeBeam, defaultSections } from "@/lib/structural/handoff";

describe("topography", () => {
  it("parses spot levels and reports bad lines", () => {
    const r = parseSpots("x,y,z\n0,0,10\n5;5;11.5\n1 2 3\nfoo,1,2\n4,4\n# c\n");
    expect(r.spots).toHaveLength(3);
    expect(r.errors).toHaveLength(2);
  });
  it("interpolation is exact at samples and stays within their range", () => {
    const s: Spot[] = [{ x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 12 }, { x: 0, y: 10, z: 11 }, { x: 10, y: 10, z: 15 }];
    expect(interpolate(s, 10, 0)).toBe(12);
    for (const [x, y] of [[3, 3], [7, 2], [5, 9], [-4, 20]]) { const z = interpolate(s, x, y)!; expect(z).toBeGreaterThanOrEqual(10); expect(z).toBeLessThanOrEqual(15); }
    expect(interpolate([], 1, 1)).toBeNull();
    expect(buildGrid(s.slice(0, 2), 10, 10)).toBeNull();
  });
  const slope = (): Grid => { const nx = 101, ny = 101, step = 0.1; const z = new Float64Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = 0.1 * (i * step); return { x0: 0, y0: 0, step, nx, ny, z }; };
  it("slope, contours and cut/fill match closed-form values on a plane", () => {
    const g = slope();
    const st = slopeStats(g);
    expect(st.meanPct).toBeCloseTo(10, 1);
    expect(st.moderatePct).toBeGreaterThan(99);
    const c = contours(g, 0.25);
    expect(c.map((x) => x.level)).toEqual([0.25, 0.5, 0.75]);
    // the 0.5 m contour runs at x = 5, all the way down the plot (10 m long)
    const len = c[1].segs.reduce((s, q) => s + Math.hypot(q[2] - q[0], q[3] - q[1]), 0);
    expect(len).toBeCloseTo(10, 1);
    expect(c[1].segs.every((q) => Math.abs(q[0] - 5) < 0.01)).toBe(true);
    // level 0.5: half the plot is cut, half is fill, 12.5 m3 each (analytic)
    const cf = cutFill(g, 0.5);
    expect(cf.cutM3).toBeCloseTo(12.5, 0);
    expect(cf.fillM3).toBeCloseTo(12.5, 0);
    expect(Math.abs(cf.netM3)).toBeLessThan(0.5);
    // a level above everything is all fill
    expect(cutFill(g, 5).cutM3).toBe(0);
    expect(contours(g, 0)).toEqual([]);
  });
  it("builds a grid from spots, masks the footprint and draws contours", () => {
    const p = plan();
    const spots: Spot[] = [{ x: 0, y: 0, z: 100 }, { x: 12, y: 0, z: 101 }, { x: 0, y: 9, z: 100.5 }, { x: 12, y: 9, z: 101.5 }, { x: 6, y: 4, z: 100.8 }];
    const g = buildGrid(spots, p.plot.width, p.plot.depth)!;
    expect(g.nx * g.ny).toBeGreaterThan(100);
    const cf = cutFill(g, 100.5, footprintMask(p));
    expect(cf.areaM2).toBeGreaterThan(20);
    expect(cf.areaM2).toBeLessThan(p.plot.width * p.plot.depth);
    const svg = contoursSvg(p, g, 0.25, 100.5);
    expect(svg).toContain("<line");
    expect(svg).toContain("not a survey");
  });
});

/** Synthetic scan: two rooms 6x4 and 4x4 (clear), 0.2 m walls, interior door gap 0.9, exterior door 1.0, then rotated and offset. */
function scan(angleDeg: number, yUp = false, noise = 0.008) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pts: number[][] = [];
  const wall = (x0: number, y0: number, x1: number, y1: number, gap?: [number, number]) => {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / 0.03);
    for (let i = 0; i <= n; i++) {
      const t = i / n * L; if (gap && t > gap[0] && t < gap[1]) continue;
      for (let k = 0; k < 28; k++) { const h = (k / 27) * 2.7, off = (k % 2 ? 0.1 : -0.1); const nxv = -(y1 - y0) / L, nyv = (x1 - x0) / L; pts.push([x0 + ((x1 - x0) / L) * t + nxv * off, y0 + ((y1 - y0) / L) * t + nyv * off, h]); }
    }
  };
  // outer box 10.4 x 4.4 from (-0.2,-0.2) to (10.2,4.2); wall centrelines
  wall(-0.1, -0.1, 10.1, -0.1); wall(-0.1, 4.1, 10.1, 4.1, [2, 3]); wall(-0.1, -0.1, -0.1, 4.1); wall(10.1, -0.1, 10.1, 4.1); wall(6.1, -0.1, 6.1, 4.1, [1.5, 2.4]);
  for (let i = 0; i < 4000; i++) pts.push([rnd() * 10, rnd() * 4, 0]);
  const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const rows = pts.map(([x, y, z]) => { const X = x * c - y * s + 12.5 + (rnd() - 0.5) * noise, Y = x * s + y * c - 3.2 + (rnd() - 0.5) * noise, Z = z + (rnd() - 0.5) * noise; return yUp ? [X, Z, -Y] : [X, Y, Z]; });
  return rows.map((r) => r.map((v) => v.toFixed(4)).join(" ")).join("\n");
}
describe("point cloud", () => {
  it("parses XYZ, CSV and ASCII PLY, rejects binary PLY and junk", () => {
    const x = parseCloud(scan(0)); expect(x.cloud!.n).toBeGreaterThan(1000);
    const csv = parseCloud("x,y,z\n" + Array.from({ length: 80 }, (_, i) => `${i},${i % 7},${i % 3}`).join("\n")); expect(csv.cloud!.n).toBe(80); expect(csv.cloud!.skipped).toBe(1);
    const ply = parseCloud("ply\nformat ascii 1.0\nelement vertex 60\nproperty float x\nproperty float y\nproperty float z\nend_header\n" + Array.from({ length: 60 }, (_, i) => `${i} 1 2`).join("\n")); expect(ply.cloud!.n).toBe(60);
    expect(parseCloud("ply\nformat binary_little_endian 1.0\nend_header\n").error).toMatch(/Binary PLY/);
    expect(parseCloud("hello world").cloud).toBeNull();
    expect(parseCloud(Array.from({ length: 100 }, (_, i) => `${i} ${i} ${i}`).join("\n"), { scale: 0.001 }).cloud!.x[99]).toBeCloseTo(0.099, 3);
    expect(parseCloud(Array.from({ length: 1000 }, (_, i) => `${i} ${i} ${i}`).join("\n"), { maxPoints: 100 }).cloud!.decimated).toBe(true);
  });
  it("finds the building rotation", () => {
    const px: number[] = [], py: number[] = [];
    const a = (23 * Math.PI) / 180;
    for (let t = 0; t <= 10; t += 0.02) for (const [x, y] of [[t, 0], [t, 4], [0, t * 0.4], [10, t * 0.4]]) { px.push(x * Math.cos(a) - y * Math.sin(a)); py.push(x * Math.sin(a) + y * Math.cos(a)); }
    const found = dominantAngle(px, py);
    expect(Math.min(Math.abs(found - 23), Math.abs(found - 23 + 90), Math.abs(found - 23 - 90))).toBeLessThanOrEqual(1);
  });
  for (const [ang, yUp] of [[0, false], [20, false], [20, true]] as const) {
    it(`detects both rooms in a synthetic scan (rotated ${ang}°${yUp ? ", Y-up" : ""})`, () => {
      let c = parseCloud(scan(ang, yUp)).cloud!;
      if (yUp) c = yUpToZUp(c);
      const d = detectRooms(c);
      expect(d.rooms).toHaveLength(2);
      const big = d.rooms.find((r) => r.area > 20)!, small = d.rooms.find((r) => r.area <= 20)!;
      const dims = (r: { width: number; depth: number }) => [r.width, r.depth].sort((a, b) => b - a);
      // clear sizes: 5.9 x 4.0 (wall centre 6.1 minus 0.1 half-thickness each side) and 3.9 x 4.0
      expect(dims(big)[0]).toBeCloseTo(5.8, 0);
      expect(Math.abs(dims(big)[0] - 5.8)).toBeLessThan(0.2);
      expect(Math.abs(dims(big)[1] - 3.8)).toBeLessThan(0.2);
      expect(Math.abs(dims(small)[0] - 3.8)).toBeLessThan(0.2);
      expect(Math.abs(dims(small)[1] - 3.8)).toBeLessThan(0.2);
      expect(d.floorZ).toBeCloseTo(0, 1);
    });
  }
  it("warns instead of guessing when the scan has no wall-height points", () => {
    const c = parseCloud(Array.from({ length: 500 }, (_, i) => `${i % 20} ${Math.floor(i / 20)} 0`).join("\n")).cloud!;
    const d = detectRooms(c);
    expect(d.rooms).toEqual([]);
    expect(d.warnings.join(" ")).toMatch(/Only/);
  });
});

describe("structural hand-off", () => {
  it("builds a connected frame with supports and exports CSV and STAAD text", () => {
    const p = plan();
    const fr = buildFrame(p);
    expect(fr.nodes.length).toBeGreaterThan(4);
    expect(fr.members.filter((m) => m.kind === "column").length).toBeGreaterThan(0);
    expect(fr.members.every((m) => fr.nodes.some((n) => n.id === m.a) && fr.nodes.some((n) => n.id === m.b))).toBe(true);
    expect(fr.members.every((m) => m.a !== m.b)).toBe(true);
    const ground = fr.nodes.filter((n) => n.support);
    expect(ground.length).toBeGreaterThan(0);
    expect(ground.every((n) => n.y === 0)).toBe(true);
    const s = defaultSections(p);
    const csv = frameCsv(fr, s);
    expect(csv.split("\n").length).toBe(fr.nodes.length + fr.members.length + 5);
    const std = staadText(p, fr, s, { beamUdl: 12, elasticGPa: 25, densityKnM3: 25, poisson: 0.17 });
    expect(std).toContain("JOINT COORDINATES");
    expect(std).toContain("MEMBER INCIDENCES");
    expect(std).toContain("E 25000000");
    expect(std).toContain("UNI GY -12");
    expect(std).toContain("PERFORM ANALYSIS");
    expect(staadText(p, fr, s, { beamUdl: 0, elasticGPa: 25, densityKnM3: 25, poisson: 0.17 })).not.toContain("MEMBER LOAD");
  });
  it("beam formulas match textbook values", () => {
    const base = { spanM: 4, udlKnM: 10, pointKn: 0, bM: 0.3, dM: 0.5, elasticGPa: 25, limitRatio: 250 };
    const simple = analyzeBeam({ ...base, support: "simple" }) as Exclude<ReturnType<typeof analyzeBeam>, { error: string }>;
    expect(simple.maxMomentKnM).toBeCloseTo(20, 6);
    expect(simple.maxShearKn).toBeCloseTo(20, 6);
    // I = 0.3*0.5^3/12 = 0.003125 ; EI = 25e6*0.003125 = 78125 kNm2 ; d = 5wL4/(384EI) = 5*10*256/(384*78125) m
    expect(simple.deflectionMm).toBeCloseTo(((5 * 10 * 256) / (384 * 78125)) * 1000, 6);
    expect(simple.elasticStressMPa).toBeCloseTo((6 * 20) / (0.3 * 0.25) / 1000, 6);
    expect(simple.limitMm).toBeCloseTo(16, 6);
    expect(simple.deflectionOk).toBe(true);
    const fixed = analyzeBeam({ ...base, support: "fixed" }) as typeof simple;
    expect(fixed.maxMomentKnM).toBeCloseTo((10 * 16) / 12, 6);
    expect(fixed.deflectionMm).toBeCloseTo(simple.deflectionMm / 5, 6);
    const cant = analyzeBeam({ ...base, support: "cantilever" }) as typeof simple;
    expect(cant.maxMomentKnM).toBeCloseTo(80, 6);
    expect(cant.maxShearKn).toBeCloseTo(40, 6);
    const pt = analyzeBeam({ ...base, udlKnM: 0, pointKn: 30, support: "simple" }) as typeof simple;
    expect(pt.maxMomentKnM).toBeCloseTo(30, 6);
    expect(pt.deflectionMm).toBeCloseTo(((30 * 64) / (48 * 78125)) * 1000, 6);
    const warn = analyzeBeam({ ...base, pointKn: 5, support: "cantilever" }) as typeof simple;
    expect(warn.notes.join(" ")).toMatch(/ignored/);
    expect("error" in (analyzeBeam({ ...base, spanM: 0, support: "simple" }) as object)).toBe(true);
    expect("error" in (analyzeBeam({ ...base, bM: NaN, support: "simple" }) as object)).toBe(true);
    expect((analyzeBeam({ ...base, spanM: 9, limitRatio: 1000, support: "simple" }) as typeof simple).deflectionOk).toBe(false);
  });
});

import { projectFromFloors, guessRoomType } from "@/lib/bim/toProject";
describe("create project from imported or scanned rooms", () => {
  it("guesses room types and builds walls", () => {
    expect(guessRoomType("Master Bedroom")).toBe("master-bedroom");
    expect(guessRoomType("WC")).toBe("bathroom");
    expect(guessRoomType("Lounge")).toBe("living");
    expect(guessRoomType("xyz")).toBe("custom");
    const r = projectFromFloors("Scan", [{ name: "G", height: 3.1, rooms: [{ name: "Room 1", type: "", x: 0, y: 0, width: 5.8, depth: 3.8 }, { name: "Room 2", type: "", x: 6, y: 0, width: 3.8, depth: 3.8 }, { name: "bad", type: "", x: 0, y: 0, width: 0.1, depth: 2 }] }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.skipped).toBe(1);
    expect(r.project.floors[0].rooms).toHaveLength(2);
    expect(r.project.floors[0].walls.length).toBeGreaterThan(4);
    expect(r.project.floors[0].height).toBe(3.1);
    expect(r.project.plot.width).toBeGreaterThanOrEqual(10);
    expect("error" in projectFromFloors("x", [{ name: "G", height: null, rooms: [] }])).toBe(true);
  });
  it("imports an exported IFC into a new project with the same rooms", () => {
    const p = plan();
    const imp = importIfc(exportIfc(p).text);
    const r = projectFromFloors("From IFC", imp.floors.map((f) => ({ name: f.name, height: f.height, rooms: f.rooms })));
    if ("error" in r) throw new Error(r.error);
    expect(r.project.floors).toHaveLength(2);
    expect(r.project.floors[0].rooms.map((q) => Math.round(q.width * 10) / 10).sort()).toEqual([3, 5]);
    expect(r.project.floors[1].rooms).toHaveLength(1);
  });
});
