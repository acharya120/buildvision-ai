/** Minimal ISO 10303-21 (STEP) text helpers shared by the IFC writer, validator and reader. */

export type Arg =
  | { t: "ref"; id: number }
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "enum"; v: string }
  | { t: "null" }
  | { t: "star" }
  | { t: "list"; v: Arg[] }
  | { t: "typed"; name: string; args: Arg[] };
export interface Entity { id: number; type: string; args: Arg[]; raw: string }

/** Decode \X2\....\X0\ and \S\ escapes and doubled quotes. */
export function decodeStr(s: string): string {
  return s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, h: string) => (h.match(/.{4}/g) ?? []).map((c) => String.fromCharCode(parseInt(c, 16))).join("")).replace(/''/g, "'");
}
/** Parse the argument text of one entity. Throws on malformed input. */
export function parseArgs(src: string): Arg[] {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const value = (): Arg => {
    ws();
    const c = src[i];
    if (c === "$") { i++; return { t: "null" }; }
    if (c === "*") { i++; return { t: "star" }; }
    if (c === "#") { const m = /^#(\d+)/.exec(src.slice(i)); if (!m) throw new Error("bad reference"); i += m[0].length; return { t: "ref", id: Number(m[1]) }; }
    if (c === "'") {
      let j = i + 1, out = "";
      for (;;) { if (j >= src.length) throw new Error("unterminated string"); if (src[j] === "'") { if (src[j + 1] === "'") { out += "''"; j += 2; continue; } break; } out += src[j++]; }
      i = j + 1; return { t: "str", v: decodeStr(out) };
    }
    if (c === ".") { const m = /^\.([A-Z0-9_]+)\./i.exec(src.slice(i)); if (!m) throw new Error("bad enum"); i += m[0].length; return { t: "enum", v: m[1].toUpperCase() }; }
    if (c === "(") { i++; const v: Arg[] = []; ws(); if (src[i] === ")") { i++; return { t: "list", v }; } for (;;) { v.push(value()); ws(); if (src[i] === ",") { i++; continue; } if (src[i] === ")") { i++; break; } throw new Error("bad list"); } return { t: "list", v }; }
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
    if (m) { i += m[0].length; const n = Number(m[0]); if (!isFinite(n)) throw new Error("bad number"); return { t: "num", v: n }; }
    const w = /^([A-Z0-9_]+)\(/i.exec(src.slice(i));
    if (w) { i += w[0].length - 1; const a = value(); return { t: "typed", name: w[1].toUpperCase(), args: a.t === "list" ? a.v : [a] }; }
    throw new Error(`unexpected '${c}'`);
  };
  const out: Arg[] = [];
  ws();
  if (!src.length) return out;
  for (;;) { out.push(value()); ws(); if (i >= src.length) break; if (src[i] === ",") { i++; continue; } throw new Error(`unexpected '${src[i]}'`); }
  return out;
}

/** Split the DATA section into entities. Statements may span lines. */
export function readEntities(text: string): { entities: Map<number, Entity>; errors: string[]; header: string } {
  const errors: string[] = [];
  const entities = new Map<number, Entity>();
  const d0 = text.search(/\bDATA\s*;/i), d1 = text.search(/\bENDSEC\s*;\s*END-ISO-10303-21/i);
  const header = d0 > 0 ? text.slice(0, d0) : "";
  if (d0 < 0) { errors.push("No DATA section."); return { entities, errors, header }; }
  const body = text.slice(d0 + text.slice(d0).indexOf(";") + 1, d1 > d0 ? d1 : undefined).replace(/\/\*[\s\S]*?\*\//g, "");
  // split on ';' that are not inside quotes
  let cur = "", inQ = false;
  const stmts: string[] = [];
  for (let k = 0; k < body.length; k++) { const ch = body[k]; if (ch === "'") inQ = !inQ; if (ch === ";" && !inQ) { stmts.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim() && !/^ENDSEC$/i.test(cur.trim())) stmts.push(cur.trim());
  for (const s of stmts) {
    if (!s || /^ENDSEC$/i.test(s)) continue;
    const m = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/.exec(s);
    if (!m) { errors.push(`Cannot read statement: ${s.slice(0, 60)}`); continue; }
    const id = Number(m[1]);
    if (entities.has(id)) { errors.push(`Duplicate id #${id}`); continue; }
    try { entities.set(id, { id, type: m[2].toUpperCase(), args: parseArgs(m[3]), raw: s }); } catch (e) { errors.push(`#${id} ${m[2]}: ${(e as Error).message}`); }
  }
  return { entities, errors, header };
}
