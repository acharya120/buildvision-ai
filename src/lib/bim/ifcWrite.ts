import type { Project, Floor, Wall } from "../model/types";
import { floorElevations } from "../export/drawings";
import { buildStructure } from "../structure/structure";
import { isValidRect } from "../geometry/rect";

/**
 * IFC4 writer (STEP text). Geometry: walls, doors, windows, openings, floor slabs, room spaces, and optionally the
 * app's INDICATIVE columns/beams. Everything is a simple extruded profile in metres, as drawn in the app.
 * It is NOT an engineered BIM model and has not been checked against buildingSMART certification here.
 */
const CH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
/** Stable 22-char IFC GlobalId from a seed string (same input gives same id on re-export). */
export function ifcGuid(seed: string): string {
  let h1 = 0xcbf29ce484222325n, h2 = 0x84222325cbf29ce4n;
  const M = (1n << 64n) - 1n;
  for (let i = 0; i < seed.length; i++) { const c = BigInt(seed.charCodeAt(i)); h1 = ((h1 ^ c) * 0x100000001b3n) & M; h2 = ((h2 ^ (c + 31n)) * 0x1000193n * 0x100000001b3n) & M; }
  let n = (h1 << 64n) | h2;
  const out: string[] = [];
  for (let i = 0; i < 21; i++) { out.unshift(CH[Number(n & 63n)]); n >>= 6n; }
  out.unshift(CH[Number(n & 3n)]);
  return out.join("");
}
export const stepStr = (s: string) => "'" + s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\`) + "'";
export function stepNum(n: number): string {
  if (!isFinite(n)) throw new Error("Non-finite number in IFC output");
  const s = (Math.round(n * 1e6) / 1e6).toFixed(6).replace(/0+$/, "");
  return s.endsWith(".") ? s : s;
}
const R = stepNum;

export interface IfcOptions { includeStructure?: boolean; maxSpan?: number; author?: string; now?: Date }
export interface IfcResult { text: string; counts: Record<string, number>; warnings: string[] }

export function exportIfc(p: Project, opts: IfcOptions = {}): IfcResult {
  const lines: string[] = [];
  let n = 0;
  const counts: Record<string, number> = {};
  const add = (type: string, args: string): number => { n++; lines.push(`#${n}=${type}(${args});`); counts[type] = (counts[type] ?? 0) + 1; return n; };
  const ref = (id: number) => `#${id}`;
  const list = (ids: number[]) => `(${ids.map(ref).join(",")})`;
  const warnings: string[] = [];
  const now = opts.now ?? new Date();
  const ts = Math.floor(now.getTime() / 1000);
  const D = p.plot.depth;
  const Y = (y: number) => D - y; // app y points down, IFC y points up

  const pt3 = (x: number, y: number, z: number) => add("IFCCARTESIANPOINT", `(${R(x)},${R(y)},${R(z)})`);
  const pt2 = (x: number, y: number) => add("IFCCARTESIANPOINT", `(${R(x)},${R(y)})`);
  const dir3 = (x: number, y: number, z: number) => add("IFCDIRECTION", `(${R(x)},${R(y)},${R(z)})`);
  const axis3 = (x: number, y: number, z: number, zAxis?: [number, number, number], xAxis?: [number, number, number]) =>
    add("IFCAXIS2PLACEMENT3D", `${ref(pt3(x, y, z))},${zAxis ? ref(dir3(...zAxis)) : "$"},${xAxis ? ref(dir3(...xAxis)) : "$"}`);
  const place = (rel: number | null, a: number) => add("IFCLOCALPLACEMENT", `${rel ? ref(rel) : "$"},${ref(a)}`);
  const guid = (seed: string) => `'${ifcGuid(`${p.id}/${seed}`)}'`;

  // owner, units, context
  const person = add("IFCPERSON", `$,${stepStr(opts.author ?? "BuildVision AI user")},$,$,$,$,$,$`);
  const org = add("IFCORGANIZATION", `$,${stepStr("BuildVision AI")},$,$,$`);
  const pao = add("IFCPERSONANDORGANIZATION", `${ref(person)},${ref(org)},$`);
  const app = add("IFCAPPLICATION", `${ref(org)},${stepStr("1.0")},${stepStr("BuildVision AI")},${stepStr("BuildVision")}`);
  const oh = add("IFCOWNERHISTORY", `${ref(pao)},${ref(app)},$,.ADDED.,$,$,$,${ts}`);
  const uLen = add("IFCSIUNIT", "*,.LENGTHUNIT.,$,.METRE.");
  const uArea = add("IFCSIUNIT", "*,.AREAUNIT.,$,.SQUARE_METRE.");
  const uVol = add("IFCSIUNIT", "*,.VOLUMEUNIT.,$,.CUBIC_METRE.");
  const uAng = add("IFCSIUNIT", "*,.PLANEANGLEUNIT.,$,.RADIAN.");
  const units = add("IFCUNITASSIGNMENT", list([uLen, uArea, uVol, uAng]));
  const worldAx = axis3(0, 0, 0);
  const ctx = add("IFCGEOMETRICREPRESENTATIONCONTEXT", `$,${stepStr("Model")},3,1.E-5,${ref(worldAx)},$`);
  const bodyCtx = add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", `${stepStr("Body")},${stepStr("Model")},*,*,*,*,${ref(ctx)},$,.MODEL_VIEW.,$`);
  const project = add("IFCPROJECT", `${guid("project")},${ref(oh)},${stepStr(p.name || "Project")},$,$,$,$,${list([ctx])},${ref(units)}`);

  const sitePl = place(null, axis3(0, 0, 0));
  const site = add("IFCSITE", `${guid("site")},${ref(oh)},${stepStr("Site")},$,$,${ref(sitePl)},$,$,.ELEMENT.,$,$,$,$,$`);
  const bldPl = place(sitePl, axis3(0, 0, 0));
  const building = add("IFCBUILDING", `${guid("building")},${ref(oh)},${stepStr(p.name || "Building")},$,$,${ref(bldPl)},$,$,.ELEMENT.,$,$,$`);
  add("IFCRELAGGREGATES", `${guid("agg-pj")},${ref(oh)},$,$,${ref(project)},${list([site])}`);
  add("IFCRELAGGREGATES", `${guid("agg-site")},${ref(oh)},$,$,${ref(site)},${list([building])}`);

  const solid = (profile: number, pos: number, height: number, dz: [number, number, number] = [0, 0, 1]) => add("IFCEXTRUDEDAREASOLID", `${ref(profile)},${ref(pos)},${ref(dir3(...dz))},${R(height)}`);
  const rect = (w: number, d: number) => add("IFCRECTANGLEPROFILEDEF", `.AREA.,$,${ref(add("IFCAXIS2PLACEMENT2D", `${ref(pt2(0, 0))},$`))},${R(w)},${R(d)}`);
  const shape = (s: number) => add("IFCPRODUCTDEFINITIONSHAPE", `$,$,${list([add("IFCSHAPEREPRESENTATION", `${ref(bodyCtx)},${stepStr("Body")},${stepStr("SweptSolid")},${list([s])}`)])}`);

  const elev = floorElevations(p);
  const storeys: number[] = [];
  const wallPlacements = new Map<string, { pl: number; len: number; th: number; h: number }>();

  p.floors.forEach((f: Floor, fi) => {
    const sPl = place(bldPl, axis3(0, 0, elev[fi]));
    const st = add("IFCBUILDINGSTOREY", `${guid("st-" + f.id)},${ref(oh)},${stepStr(f.name)},$,$,${ref(sPl)},$,$,.ELEMENT.,${R(elev[fi])}`);
    storeys.push(st);
    const contained: number[] = [], spaces: number[] = [];
    const H = f.height;

    for (const r of f.rooms.filter(isValidRect)) {
      const cx = r.x + r.width / 2, cy = Y(r.y + r.depth / 2);
      const pl = place(sPl, axis3(cx, cy, 0));
      const sp = add("IFCSPACE", `${guid("sp-" + r.id)},${ref(oh)},${stepStr(r.name || r.type)},$,$,${ref(pl)},${ref(shape(solid(rect(r.width, r.depth), axis3(0, 0, 0), H)))},${stepStr(r.type)},.ELEMENT.,.INTERNAL.,$`);
      spaces.push(sp);
      const slPl = place(sPl, axis3(cx, cy, -0.15));
      contained.push(add("IFCSLAB", `${guid("sl-" + r.id)},${ref(oh)},${stepStr((r.name || r.type) + " floor")},$,$,${ref(slPl)},${ref(shape(solid(rect(r.width, r.depth), axis3(0, 0, 0), 0.15)))},$,.FLOOR.`));
    }

    const walls: Wall[] = f.walls;
    for (const w of walls) {
      const dx = w.x2 - w.x1, dy = -(w.y2 - w.y1), len = Math.hypot(dx, dy);
      if (len < 1e-6) { warnings.push(`Skipped a zero-length wall on ${f.name}.`); continue; }
      const ux = dx / len, uy = dy / len;
      const mx = (w.x1 + w.x2) / 2, my = Y((w.y1 + w.y2) / 2);
      const pl = place(sPl, axis3(mx, my, 0, [0, 0, 1], [ux, uy, 0]));
      const wid = add("IFCWALL", `${guid("w-" + w.id)},${ref(oh)},${stepStr("Wall")},$,$,${ref(pl)},${ref(shape(solid(rect(len, w.thickness), axis3(0, 0, 0), H)))},$,.STANDARD.`);
      contained.push(wid);
      wallPlacements.set(w.id, { pl, len, th: w.thickness, h: H });
      for (const o of f.openings.filter((q) => q.wallId === w.id)) {
        const ox = o.offset + o.width / 2 - len / 2;
        if (o.offset < -1e-6 || o.offset + o.width > len + 1e-6) warnings.push(`An opening on ${f.name} is partly outside its wall; it was kept as drawn.`);
        const opPl = place(pl, axis3(ox, 0, o.sill));
        const op = add("IFCOPENINGELEMENT", `${guid("o-" + o.id)},${ref(oh)},${stepStr("Opening")},$,$,${ref(opPl)},${ref(shape(solid(rect(o.width, w.thickness + 0.1), axis3(0, 0, 0), o.height)))},$,.OPENING.`);
        add("IFCRELVOIDSELEMENT", `${guid("v-" + o.id)},${ref(oh)},$,$,${ref(wid)},${ref(op)}`);
        const fPl = place(pl, axis3(ox, 0, o.sill));
        const fillShape = shape(solid(rect(o.width, Math.max(0.04, w.thickness * 0.3)), axis3(0, 0, 0), o.height));
        const fill = o.kind === "door"
          ? add("IFCDOOR", `${guid("d-" + o.id)},${ref(oh)},${stepStr("Door")},$,$,${ref(fPl)},${ref(fillShape)},$,${R(o.height)},${R(o.width)},.DOOR.,.NOTDEFINED.,$`)
          : add("IFCWINDOW", `${guid("d-" + o.id)},${ref(oh)},${stepStr("Window")},$,$,${ref(fPl)},${ref(fillShape)},$,${R(o.height)},${R(o.width)},.WINDOW.,.NOTDEFINED.,$`);
        add("IFCRELFILLSELEMENT", `${guid("f-" + o.id)},${ref(oh)},$,$,${ref(op)},${ref(fill)}`);
        contained.push(fill);
      }
    }

    if (opts.includeStructure) {
      const sm = buildStructure(f, opts.maxSpan ?? p.detail?.maxSpan ?? 4.5);
      const cs = p.detail?.columnSize ?? 0.23, bd = p.detail?.beamDepth ?? 0.3;
      sm.columns.forEach((c, i) => {
        const pl = place(sPl, axis3(c.x, Y(c.y), 0));
        contained.push(add("IFCCOLUMN", `${guid(`col-${f.id}-${i}`)},${ref(oh)},${stepStr("Column (indicative)")},$,$,${ref(pl)},${ref(shape(solid(rect(cs, cs), axis3(0, 0, 0), H)))},$,.COLUMN.`));
      });
      sm.beams.forEach((b, i) => {
        const dx = b.x2 - b.x1, dy = -(b.y2 - b.y1), len = Math.hypot(dx, dy);
        if (len < 1e-6) return;
        const pl = place(sPl, axis3(b.x1, Y(b.y1), H - bd / 2, [0, 0, 1], [dx / len, dy / len, 0]));
        // solid axis along the beam (local x), profile width along local y, depth along local z
        const sol = solid(rect(cs, bd), axis3(0, 0, 0, [1, 0, 0], [0, 1, 0]), len);
        contained.push(add("IFCBEAM", `${guid(`bm-${f.id}-${i}`)},${ref(oh)},${stepStr("Beam (indicative)")},$,$,${ref(pl)},${ref(shape(sol))},$,.BEAM.`));
      });
    }
    if (spaces.length) add("IFCRELAGGREGATES", `${guid("agg-sp-" + f.id)},${ref(oh)},$,$,${ref(st)},${list(spaces)}`);
    if (contained.length) add("IFCRELCONTAINEDINSPATIALSTRUCTURE", `${guid("cont-" + f.id)},${ref(oh)},$,$,${list(contained)},${ref(st)}`);
  });
  add("IFCRELAGGREGATES", `${guid("agg-bld")},${ref(oh)},$,$,${ref(building)},${list(storeys)}`);

  const iso = now.toISOString().slice(0, 19);
  const header = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');", `FILE_NAME(${stepStr((p.name || "project") + ".ifc")},'${iso}',(${stepStr(opts.author ?? "BuildVision AI user")}),(${stepStr("BuildVision AI")}),${stepStr("BuildVision AI")},${stepStr("BuildVision AI")},'');`, "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"];
  if (opts.includeStructure) warnings.push("Columns and beams are the app's indicative layout, not an engineered frame.");
  return { text: [...header, ...lines, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n"), counts, warnings };
}
