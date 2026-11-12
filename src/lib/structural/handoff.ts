import type { Project } from "../model/types";
import { buildStructure } from "../structure/structure";
import { floorElevations } from "../export/drawings";

/**
 * Structural analysis HAND-OFF. Builds a simple frame (columns and beams) from the app's INDICATIVE layout and writes it as CSV or as STAAD text.
 * Sections and loads are values you enter. This is a starting model for an engineer's own analysis software, not a design.
 */
export interface Node { id: number; x: number; y: number; z: number; support: boolean }
export interface Member { id: number; a: number; b: number; kind: "column" | "beam"; floor: string }
export interface Frame { nodes: Node[]; members: Member[]; floors: string[] }
export interface Sections { colB: number; colD: number; beamB: number; beamD: number }

export function defaultSections(p: Project): Sections {
  const c = p.detail?.columnSize ?? 0.23, d = p.detail?.beamDepth ?? 0.3;
  return { colB: c, colD: c, beamB: c, beamD: d };
}

/** Plan x,y map to analysis x,z; analysis y is height (STAAD convention). Plan y runs down the sheet, so z = plan y. */
export function buildFrame(p: Project, maxSpan = p.detail?.maxSpan ?? 4.5): Frame {
  const elev = floorElevations(p);
  const nodes: Node[] = [], members: Member[] = [];
  const idx = new Map<string, number>();
  const node = (x: number, y: number, z: number, support = false) => {
    const k = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let i = idx.get(k);
    if (i == null) { i = nodes.length + 1; idx.set(k, i); nodes.push({ id: i, x, y, z, support }); }
    return i;
  };
  p.floors.forEach((f, fi) => {
    const sm = buildStructure(f, maxSpan);
    const base = elev[fi], top = base + f.height;
    for (const c of sm.columns) members.push({ id: 0, a: node(c.x, base, c.y, fi === 0), b: node(c.x, top, c.y), kind: "column", floor: f.name });
    const colsAt = (x: number, y: number) => sm.columns.some((c) => Math.abs(c.x - x) < 0.2 && Math.abs(c.y - y) < 0.2);
    for (const b of sm.beams) {
      if (!colsAt(b.x1, b.y1) || !colsAt(b.x2, b.y2)) continue; // only beams that run between two columns
      const a = node(b.x1, top, b.y1), z = node(b.x2, top, b.y2);
      if (a !== z) members.push({ id: 0, a, b: z, kind: "beam", floor: f.name });
    }
  });
  // roof/top nodes of columns on the last floor are free; ground nodes are supports
  members.forEach((m, i) => (m.id = i + 1));
  return { nodes, members, floors: p.floors.map((f) => f.name) };
}

export function frameCsv(fr: Frame, s: Sections): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return [
    "# Structural hand-off (indicative frame). Metres. Y is height; X and Z are in the plan. Not a design.",
    "# NODES", "node,x,y,z,support", ...fr.nodes.map((n) => `${n.id},${r(n.x)},${r(n.y)},${r(n.z)},${n.support ? "FIXED" : ""}`),
    "# MEMBERS", "member,node_a,node_b,kind,floor,b_m,d_m", ...fr.members.map((m) => `${m.id},${m.a},${m.b},${m.kind},"${m.floor}",${m.kind === "column" ? s.colB : s.beamB},${m.kind === "column" ? s.colD : s.beamD}`),
  ].join("\n");
}

export interface StaadOptions { beamUdl: number; elasticGPa: number; densityKnM3: number; poisson: number }
/** STAAD.Pro input text using the standard command layout. Not opened in STAAD by this app; check it loads and review every line. */
export function staadText(p: Project, fr: Frame, s: Sections, o: StaadOptions): string {
  const r = (n: number) => String(Math.round(n * 1000) / 1000);
  const cols = fr.members.filter((m) => m.kind === "column").map((m) => m.id), beams = fr.members.filter((m) => m.kind === "beam").map((m) => m.id);
  const L: string[] = ["STAAD SPACE", "START JOB INFORMATION", `JOB NAME ${p.name.replace(/[^\w .-]/g, "")}`, "END JOB INFORMATION", "INPUT WIDTH 79", "UNIT METER KN", "JOINT COORDINATES"];
  L.push(fr.nodes.map((n) => `${n.id} ${r(n.x)} ${r(n.y)} ${r(n.z)};`).join(" "));
  L.push("MEMBER INCIDENCES", fr.members.map((m) => `${m.id} ${m.a} ${m.b};`).join(" "));
  L.push("DEFINE MATERIAL START", "ISOTROPIC CONCRETE", `E ${o.elasticGPa * 1e6}`, `POISSON ${o.poisson}`, `DENSITY ${o.densityKnM3}`, "END DEFINE MATERIAL", "MEMBER PROPERTY");
  if (cols.length) L.push(`${cols.join(" ")} PRISMATIC YD ${s.colD} ZD ${s.colB}`);
  if (beams.length) L.push(`${beams.join(" ")} PRISMATIC YD ${s.beamD} ZD ${s.beamB}`);
  L.push("CONSTANTS", "MATERIAL CONCRETE ALL", "SUPPORTS");
  const sup = fr.nodes.filter((n) => n.support).map((n) => n.id);
  if (sup.length) L.push(`${sup.join(" ")} FIXED`);
  L.push("LOAD 1 DEAD LOAD", "SELFWEIGHT Y -1");
  if (beams.length && o.beamUdl > 0) L.push("MEMBER LOAD", `${beams.join(" ")} UNI GY -${r(o.beamUdl)}`);
  L.push("PERFORM ANALYSIS", "FINISH", "");
  return L.join("\n");
}

// ------------------------------------------------------------------ simple single-beam analysis (hand-check)
export type Support = "simple" | "fixed" | "cantilever" | "propped";
export interface BeamInput { spanM: number; udlKnM: number; pointKn: number; support: Support; bM: number; dM: number; elasticGPa: number; limitRatio: number }
export interface BeamResult { maxMomentKnM: number; supportMomentKnM: number | null; maxShearKn: number; deflectionMm: number; limitMm: number; deflectionOk: boolean; elasticStressMPa: number; inertiaM4: number; notes: string[] }

/**
 * Textbook closed-form results for ONE prismatic beam under a full-length uniform load plus an optional central point load
 * (point load only for 'simple' and 'fixed'). Uncracked rectangular section, elastic. This is a hand-check, NOT a reinforced-concrete design:
 * no cracking, creep, reinforcement, shear design, continuity between spans or load combinations.
 */
export function analyzeBeam(i: BeamInput): BeamResult | { error: string } {
  const { spanM: L, udlKnM: w, pointKn: P, bM: b, dM: d, elasticGPa: E } = i;
  if (![L, w, P, b, d, E, i.limitRatio].every(isFinite) || L <= 0 || b <= 0 || d <= 0 || E <= 0 || w < 0 || P < 0 || i.limitRatio <= 0) return { error: "Enter positive span, section and modulus, and loads of zero or more." };
  const EI = E * 1e6 * ((b * d ** 3) / 12); // kN.m2
  const I = (b * d ** 3) / 12;
  const notes: string[] = [];
  let M: number, Ms: number | null = null, V: number, dl: number;
  if (P > 0 && (i.support === "cantilever" || i.support === "propped")) notes.push("The point load was ignored: it is only supported for 'simple' and 'fixed' beams here.");
  const Pe = i.support === "simple" || i.support === "fixed" ? P : 0;
  switch (i.support) {
    case "simple": M = (w * L * L) / 8 + (Pe * L) / 4; V = (w * L) / 2 + Pe / 2; dl = (5 * w * L ** 4) / (384 * EI) + (Pe * L ** 3) / (48 * EI); break;
    case "fixed": Ms = (w * L * L) / 12 + (Pe * L) / 8; M = Ms; V = (w * L) / 2 + Pe / 2; dl = (w * L ** 4) / (384 * EI) + (Pe * L ** 3) / (192 * EI); notes.push("Fixed ends assume full rotational restraint, which real supports rarely provide."); break;
    case "cantilever": M = (w * L * L) / 2; Ms = M; V = w * L; dl = (w * L ** 4) / (8 * EI); break;
    default: M = (w * L * L) / 8; Ms = M; V = (5 * w * L) / 8; dl = (w * L ** 4) / (185 * EI); break;
  }
  const mm = dl * 1000, limit = (L * 1000) / i.limitRatio;
  return { maxMomentKnM: M, supportMomentKnM: Ms, maxShearKn: V, deflectionMm: mm, limitMm: limit, deflectionOk: mm <= limit, elasticStressMPa: (6 * M) / (b * d * d) / 1000, inertiaM4: I, notes };
}
