import { readEntities, type Arg, type Entity } from "./step";

/** Number of attributes each IFC4 entity written by this app must have. */
export const IFC4_ARITY: Record<string, number> = {
  IFCPERSON: 8, IFCORGANIZATION: 5, IFCPERSONANDORGANIZATION: 3, IFCAPPLICATION: 4, IFCOWNERHISTORY: 8, IFCSIUNIT: 4, IFCUNITASSIGNMENT: 1,
  IFCCARTESIANPOINT: 1, IFCDIRECTION: 1, IFCAXIS2PLACEMENT3D: 3, IFCAXIS2PLACEMENT2D: 2, IFCLOCALPLACEMENT: 2,
  IFCGEOMETRICREPRESENTATIONCONTEXT: 6, IFCGEOMETRICREPRESENTATIONSUBCONTEXT: 10, IFCPROJECT: 9, IFCSITE: 14, IFCBUILDING: 12, IFCBUILDINGSTOREY: 10,
  IFCRELAGGREGATES: 6, IFCRELCONTAINEDINSPATIALSTRUCTURE: 6, IFCEXTRUDEDAREASOLID: 4, IFCRECTANGLEPROFILEDEF: 5, IFCSHAPEREPRESENTATION: 4, IFCPRODUCTDEFINITIONSHAPE: 3,
  IFCWALL: 9, IFCSLAB: 9, IFCSPACE: 11, IFCOPENINGELEMENT: 9, IFCDOOR: 13, IFCWINDOW: 13, IFCCOLUMN: 9, IFCBEAM: 9, IFCRELVOIDSELEMENT: 6, IFCRELFILLSELEMENT: 6,
};

export interface IfcCheck { ok: boolean; errors: string[]; entityCount: number; byType: Record<string, number> }

/**
 * Structural self-check of IFC4 STEP text: header, unique ids, every #reference resolves, balanced syntax, attribute counts for the
 * entities this app writes, one project, every storey reachable from the project. This is NOT a schema validation by
 * buildingSMART or IfcOpenShell. Open the file in a real IFC viewer before relying on it.
 */
export function validateIfc(text: string): IfcCheck {
  const errors: string[] = [];
  if (!/^\s*ISO-10303-21;/.test(text)) errors.push("Missing ISO-10303-21 header.");
  if (!/FILE_SCHEMA\s*\(\s*\(\s*'IFC4'\s*\)\s*\)/.test(text)) errors.push("FILE_SCHEMA is not IFC4.");
  if (!/END-ISO-10303-21;\s*$/.test(text)) errors.push("Missing END-ISO-10303-21.");
  if (/NaN|Infinity/.test(text)) errors.push("Contains NaN or Infinity.");
  const { entities, errors: pe } = readEntities(text);
  errors.push(...pe);
  const byType: Record<string, number> = {};
  const refs = (a: Arg, from: Entity) => {
    if (a.t === "ref") { if (!entities.has(a.id)) errors.push(`#${from.id} ${from.type} refers to missing #${a.id}`); }
    else if (a.t === "list") a.v.forEach((x) => refs(x, from));
    else if (a.t === "typed") a.args.forEach((x) => refs(x, from));
  };
  for (const e of entities.values()) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    e.args.forEach((a) => refs(a, e));
    const need = IFC4_ARITY[e.type];
    if (need != null && e.args.length !== need) errors.push(`#${e.id} ${e.type} has ${e.args.length} attributes, expected ${need}`);
    if (e.type === "IFCCARTESIANPOINT" || e.type === "IFCDIRECTION") { const l = e.args[0]; if (l.t !== "list" || l.v.some((x) => x.t !== "num")) errors.push(`#${e.id} ${e.type} needs numbers`); }
  }
  if ((byType.IFCPROJECT ?? 0) !== 1) errors.push(`Expected exactly one IFCPROJECT, found ${byType.IFCPROJECT ?? 0}.`);
  // guid shape
  for (const e of entities.values()) if (e.type !== "IFCPERSON" && e.type !== "IFCORGANIZATION" && e.type !== "IFCAPPLICATION" && /^IFC(PROJECT|SITE|BUILDING|BUILDINGSTOREY|WALL|SLAB|SPACE|DOOR|WINDOW|COLUMN|BEAM|OPENINGELEMENT|REL)/.test(e.type)) {
    const g = e.args[0]; if (!g || g.t !== "str" || !/^[0-9A-Za-z_$]{22}$/.test(g.v)) errors.push(`#${e.id} ${e.type} has an invalid GlobalId`);
  }
  // every storey is aggregated under a building
  const aggregated = new Set<number>();
  for (const e of entities.values()) if (e.type === "IFCRELAGGREGATES") { const l = e.args[5]; if (l?.t === "list") l.v.forEach((x) => x.t === "ref" && aggregated.add(x.id)); }
  for (const e of entities.values()) if (e.type === "IFCBUILDINGSTOREY" && !aggregated.has(e.id)) errors.push(`#${e.id} storey is not part of a building`);
  // walls with openings must be contained in a storey
  const contained = new Set<number>();
  for (const e of entities.values()) if (e.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") { const l = e.args[4]; if (l?.t === "list") l.v.forEach((x) => x.t === "ref" && contained.add(x.id)); }
  for (const e of entities.values()) if (/^IFC(WALL|SLAB|DOOR|WINDOW|COLUMN|BEAM)$/.test(e.type) && !contained.has(e.id)) errors.push(`#${e.id} ${e.type} is not contained in a storey`);
  return { ok: errors.length === 0, errors: errors.slice(0, 50), entityCount: entities.size, byType };
}

// ---------------------------------------------------------------- limited import

export interface ImportedRoom { name: string; x: number; y: number; width: number; depth: number; type: string }
export interface ImportedWall { x1: number; y1: number; x2: number; y2: number; thickness: number }
export interface ImportedFloor { name: string; elevation: number; height: number | null; rooms: ImportedRoom[]; walls: ImportedWall[] }
export interface IfcImport { floors: ImportedFloor[]; warnings: string[]; skipped: Record<string, number>; plotWidth: number; plotDepth: number }

type M = { x: number; y: number; z: number; ux: number; uy: number };
const num = (a: Arg | undefined) => (a && a.t === "num" ? a.v : 0);
const asList = (a: Arg | undefined) => (a && a.t === "list" ? a.v : []);

/**
 * LIMITED import. Reads storeys, spaces (to rooms) and walls whose body is an extruded rectangle, with placements rotated by any angle about the
 * vertical axis (walls) but rooms only when axis-aligned. Anything else (curved, polygonal, mesh/Brep geometry, slopes) is skipped and counted.
 * Files from Revit/ArchiCAD usually use richer geometry, so expect partial results; this is not a full IFC reader.
 */
export function importIfc(text: string): IfcImport {
  const { entities, errors } = readEntities(text);
  const warnings = errors.slice(0, 5).map((e) => `File problem: ${e}`);
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1; };
  const get = (a: Arg | undefined): Entity | undefined => (a && a.t === "ref" ? entities.get(a.id) : undefined);
  // unit scale
  let scale = 1;
  for (const e of entities.values()) if (e.type === "IFCSIUNIT" && e.args[1]?.t === "enum" && e.args[1].v === "LENGTHUNIT") { const pre = e.args[2]; if (pre?.t === "enum") scale = pre.v === "MILLI" ? 0.001 : pre.v === "CENTI" ? 0.01 : pre.v === "DECI" ? 0.1 : 1; }
  if (scale !== 1) warnings.push(`File units scaled by ${scale} to metres.`);

  const pointOf = (e?: Entity): [number, number, number] => { const l = asList(e?.args[0]); return [num(l[0]) * scale, num(l[1]) * scale, num(l[2]) * scale]; };
  const axisOf = (e?: Entity): M => {
    if (!e) return { x: 0, y: 0, z: 0, ux: 1, uy: 0 };
    const [x, y, z] = pointOf(get(e.args[0]));
    const rd = get(e.args[2]); const r = asList(rd?.args[0]);
    let ux = r.length ? num(r[0]) : 1, uy = r.length ? num(r[1]) : 0; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    return { x, y, z, ux, uy };
  };
  const compose = (pe?: Entity, depth = 0): M => {
    if (!pe || pe.type !== "IFCLOCALPLACEMENT" || depth > 20) return { x: 0, y: 0, z: 0, ux: 1, uy: 0 };
    const parent = compose(get(pe.args[0]), depth + 1);
    const a = axisOf(get(pe.args[1]));
    return { x: parent.x + a.x * parent.ux - a.y * parent.uy, y: parent.y + a.x * parent.uy + a.y * parent.ux, z: parent.z + a.z, ux: a.ux * parent.ux - a.uy * parent.uy, uy: a.ux * parent.uy + a.uy * parent.ux };
  };
  /** rectangle + height of an extruded solid in the product's own placement; null when the geometry is anything else */
  const body = (prod: Entity, repIdx: number) => {
    const pds = get(prod.args[repIdx]);
    for (const r of asList(pds?.args[2])) {
      const sr = r.t === "ref" ? entities.get(r.id) : undefined;
      for (const it of asList(sr?.args[3])) {
        const s = it.t === "ref" ? entities.get(it.id) : undefined;
        if (s?.type !== "IFCEXTRUDEDAREASOLID") continue;
        const prof = get(s.args[0]);
        if (prof?.type !== "IFCRECTANGLEPROFILEDEF") continue;
        const a = axisOf(get(s.args[1]));
        const pos2 = get(prof.args[2]); const [px, py] = pointOf(get(pos2?.args[0]));
        return { w: num(prof.args[3]) * scale, d: num(prof.args[4]) * scale, h: num(s.args[3]) * scale, off: { x: a.x + px, y: a.y + py }, rot: a.ux, rotY: a.uy };
      }
    }
    return null;
  };

  // storeys and what they contain
  const storeyOf = new Map<number, number>();
  const storeys = [...entities.values()].filter((e) => e.type === "IFCBUILDINGSTOREY");
  for (const e of entities.values()) {
    if (e.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") { const st = e.args[5]; if (st?.t === "ref") for (const x of asList(e.args[4])) if (x.t === "ref") storeyOf.set(x.id, st.id); }
    if (e.type === "IFCRELAGGREGATES") { const st = e.args[4]; if (st?.t === "ref" && entities.get(st.id)?.type === "IFCBUILDINGSTOREY") for (const x of asList(e.args[5])) if (x.t === "ref") storeyOf.set(x.id, st.id); }
  }
  if (!storeys.length) warnings.push("No building storeys found; everything goes on one floor.");

  type Raw = { name: string; elev: number; rooms: Array<{ n: string; cx: number; cy: number; w: number; d: number; type: string }>; walls: Array<{ cx: number; cy: number; ux: number; uy: number; len: number; th: number }>; h: number | null };
  const raw = new Map<number, Raw>();
  const ensure = (id: number): Raw => {
    let r = raw.get(id);
    if (!r) { const e = entities.get(id); r = { name: e && e.args[2]?.t === "str" ? e.args[2].v : "Floor", elev: e ? compose(get(e.args[5])).z : 0, rooms: [], walls: [], h: null }; raw.set(id, r); }
    return r;
  };
  storeys.forEach((s) => ensure(s.id));
  if (!storeys.length) raw.set(0, { name: "Floor 1", elev: 0, rooms: [], walls: [], h: null });

  for (const e of entities.values()) {
    if (!/^IFC(SPACE|WALL|WALLSTANDARDCASE)$/.test(e.type)) { if (/^IFC(SLAB|BEAM|COLUMN|DOOR|WINDOW|ROOF|STAIR|COVERING|FURNISHINGELEMENT|MEMBER|PLATE|RAILING)/.test(e.type)) skip(e.type); continue; }
    const sid = storeyOf.get(e.id) ?? (storeys[0]?.id ?? 0);
    const fl = ensure(sid);
    const b = body(e, 6);
    if (!b) { skip(e.type + " (geometry not an extruded rectangle)"); continue; }
    const pl = compose(get(e.args[5]));
    // profile centre in world
    const cx = pl.x + b.off.x * pl.ux - b.off.y * pl.uy, cy = pl.y + b.off.x * pl.uy + b.off.y * pl.ux;
    const ux = pl.ux * b.rot - pl.uy * b.rotY, uy = pl.uy * b.rot + pl.ux * b.rotY;
    if (e.type === "IFCSPACE") {
      const ang = Math.abs(uy) < 0.01 ? "0" : Math.abs(ux) < 0.01 ? "90" : "";
      if (!ang) { skip("IFCSPACE (rotated off the axes)"); continue; }
      const w = ang === "0" ? b.w : b.d, d = ang === "0" ? b.d : b.w;
      fl.rooms.push({ n: e.args[2]?.t === "str" ? e.args[2].v : "Room", cx, cy, w, d, type: e.args[7]?.t === "str" ? e.args[7].v : "" });
      if (b.h > 1) fl.h = fl.h == null ? b.h : Math.max(fl.h, b.h);
    } else fl.walls.push({ cx, cy, ux, uy, len: b.w, th: b.d });
  }

  // normalise to plot coordinates (origin top-left, y down) using the extent of everything read
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const ext = (x0: number, y0: number, x1: number, y1: number) => { minX = Math.min(minX, x0, x1); maxX = Math.max(maxX, x0, x1); minY = Math.min(minY, y0, y1); maxY = Math.max(maxY, y0, y1); };
  for (const f of raw.values()) { f.rooms.forEach((r) => ext(r.cx - r.w / 2, r.cy - r.d / 2, r.cx + r.w / 2, r.cy + r.d / 2)); f.walls.forEach((w) => ext(w.cx - (w.ux * w.len) / 2, w.cy - (w.uy * w.len) / 2, w.cx + (w.ux * w.len) / 2, w.cy + (w.uy * w.len) / 2)); }
  if (!isFinite(minX)) return { floors: [], warnings: [...warnings, "No spaces or walls with simple geometry were found, so nothing could be imported."], skipped, plotWidth: 0, plotDepth: 0 };
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const floors = [...raw.values()].sort((a, b) => a.elev - b.elev).map((f): ImportedFloor => ({
    name: f.name, elevation: r3(f.elev), height: f.h == null ? null : r3(f.h),
    rooms: f.rooms.map((r) => ({ name: r.n, type: r.type, x: r3(r.cx - r.w / 2 - minX), y: r3(maxY - (r.cy + r.d / 2)), width: r3(r.w), depth: r3(r.d) })),
    walls: f.walls.map((w) => ({ x1: r3(w.cx - (w.ux * w.len) / 2 - minX), y1: r3(maxY - (w.cy - (w.uy * w.len) / 2)), x2: r3(w.cx + (w.ux * w.len) / 2 - minX), y2: r3(maxY - (w.cy + (w.uy * w.len) / 2)), thickness: r3(w.th) })),
  }));
  if (floors.some((f) => f.walls.length)) warnings.push("Walls are listed for reference; the new project regenerates walls from the rooms. Openings (doors/windows) are not imported.");
  return { floors, warnings, skipped, plotWidth: r3(maxX - minX), plotDepth: r3(maxY - minY) };
}
