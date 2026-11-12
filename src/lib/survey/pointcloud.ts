/** Point cloud import and rectangular-room detection. Works on ASCII XYZ/CSV/PTS and ASCII PLY. No scanner or phone capture is included. */
export interface Cloud { x: Float32Array; y: Float32Array; z: Float32Array; n: number; skipped: number; decimated: boolean }
export interface CloudOptions { scale?: number; maxPoints?: number }

export function parseCloud(text: string, opt: CloudOptions = {}): { cloud: Cloud | null; error: string | null } {
  const scale = opt.scale ?? 1, maxPts = opt.maxPoints ?? 1_500_000;
  let body = text, expected = -1;
  if (/^\s*ply/i.test(text)) {
    const end = text.search(/end_header\s*\r?\n/i);
    if (end < 0) return { cloud: null, error: "PLY header not finished." };
    const header = text.slice(0, end);
    if (/format\s+binary/i.test(header)) return { cloud: null, error: "Binary PLY is not supported. Export the scan as ASCII PLY, or as XYZ/CSV, from your scan software." };
    const m = /element\s+vertex\s+(\d+)/i.exec(header);
    expected = m ? Number(m[1]) : -1;
    body = text.slice(end).replace(/^end_header\s*\r?\n/i, "");
  }
  const lines = body.split(/\r?\n/);
  const cap = expected > 0 ? expected : lines.length;
  const keepEvery = cap > maxPts ? Math.ceil(cap / maxPts) : 1;
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  let skipped = 0, seen = 0;
  for (const line of lines) {
    if (expected >= 0 && seen >= expected) break;
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/[,;\t ]+/);
    const a = Number(parts[0]), b = Number(parts[1]), c = Number(parts[2]);
    if (parts.length < 3 || !isFinite(a) || !isFinite(b) || !isFinite(c)) { skipped++; continue; }
    seen++;
    if (seen % keepEvery) continue;
    xs.push(a * scale); ys.push(b * scale); zs.push(c * scale);
  }
  if (xs.length < 50) return { cloud: null, error: `Only ${xs.length} usable points found. Expected lines of "x y z".` };
  return { cloud: { x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs), n: xs.length, skipped, decimated: keepEvery > 1 }, error: null };
}

/** Swap axes when the scan is Y-up (common from phones and game engines): (x, y, z) becomes (x, -z, y). */
export function yUpToZUp(c: Cloud): Cloud { return { ...c, y: Float32Array.from(c.z, (v) => -v), z: Float32Array.from(c.y) }; }

export const percentile = (a: Float32Array, p: number) => { const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };

export interface DetectOptions { cell?: number; sliceFrom?: number; sliceTo?: number; minPerCell?: number; closeGap?: number; minRoomArea?: number }
export interface DetectedRoom { x: number; y: number; width: number; depth: number; area: number }
export interface Detection { rotationDeg: number; rooms: DetectedRoom[]; floorZ: number; slicePoints: number; width: number; depth: number; warnings: string[] }

/** Best rotation (0-89 degrees) that makes walls line up with the axes: maximises how peaked the x and y histograms are. */
export function dominantAngle(px: number[], py: number[], bin = 0.05): number {
  let best = 0, bestScore = -1;
  for (let a = 0; a < 90; a++) {
    const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const hx = new Map<number, number>(), hy = new Map<number, number>();
    for (let i = 0; i < px.length; i++) {
      const u = px[i] * c + py[i] * s, v = -px[i] * s + py[i] * c;
      const ku = Math.floor(u / bin), kv = Math.floor(v / bin);
      hx.set(ku, (hx.get(ku) ?? 0) + 1); hy.set(kv, (hy.get(kv) ?? 0) + 1);
    }
    let sc = 0;
    for (const v of hx.values()) sc += v * v;
    for (const v of hy.values()) sc += v * v;
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  return best;
}

/**
 * Finds axis-aligned rectangular rooms: takes a horizontal slice at wall height, rotates it so walls are straight, marks cells that hold wall points,
 * closes door-sized gaps, and reports enclosed empty regions that are close to rectangles. Diagonal/curved walls, furnished clutter and
 * incomplete scans reduce accuracy. Results are a starting point to review and correct, not a survey.
 */
export function detectRooms(c: Cloud, opt: DetectOptions = {}): Detection {
  const cell = opt.cell ?? 0.05, from = opt.sliceFrom ?? 0.9, to = opt.sliceTo ?? 1.6, minPer = opt.minPerCell ?? 2, closeGap = opt.closeGap ?? 1.0, minArea = opt.minRoomArea ?? 2;
  const warnings: string[] = [];
  const floorZ = percentile(c.z, 0.02);
  const sx: number[] = [], sy: number[] = [];
  for (let i = 0; i < c.n; i++) { const h = c.z[i] - floorZ; if (h >= from && h <= to) { sx.push(c.x[i]); sy.push(c.y[i]); } }
  if (sx.length < 200) return { rotationDeg: 0, rooms: [], floorZ, slicePoints: sx.length, width: 0, depth: 0, warnings: [`Only ${sx.length} points between ${from} m and ${to} m above the floor. Check the scale (metres) and which axis is up.`] };
  // limit work for angle search
  const stride = Math.max(1, Math.floor(sx.length / 20000));
  const angle = dominantAngle(sx.filter((_, i) => i % stride === 0), sy.filter((_, i) => i % stride === 0));
  const r = (angle * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  const u = sx.map((x, i) => x * co + sy[i] * si), v = sx.map((x, i) => -x * si + sy[i] * co);
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let i = 0; i < u.length; i++) { u0 = Math.min(u0, u[i]); u1 = Math.max(u1, u[i]); v0 = Math.min(v0, v[i]); v1 = Math.max(v1, v[i]); }
  const pad = Math.ceil(closeGap / cell) + 2;
  const nx = Math.ceil((u1 - u0) / cell) + 2 * pad + 1, ny = Math.ceil((v1 - v0) / cell) + 2 * pad + 1;
  if (nx * ny > 16_000_000) return { rotationDeg: angle, rooms: [], floorZ, slicePoints: sx.length, width: 0, depth: 0, warnings: ["The scan area is too large for the chosen cell size. Use a larger cell or crop the scan."] };
  const cnt = new Uint16Array(nx * ny);
  for (let i = 0; i < u.length; i++) { const ix = Math.floor((u[i] - u0) / cell) + pad, iy = Math.floor((v[i] - v0) / cell) + pad; const k = iy * nx + ix; if (cnt[k] < 65535) cnt[k]++; }
  let occ: Uint8Array = new Uint8Array(nx * ny);
  for (let k = 0; k < occ.length; k++) occ[k] = cnt[k] >= minPer ? 1 : 0;
  // close gaps: dilate by rad, flood, then map back
  const rad = Math.max(1, Math.ceil(closeGap / 2 / cell));
  const dil = (src: Uint8Array): Uint8Array => {
    const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
    for (let y = 0; y < ny; y++) { let last = -1e9; for (let x = 0; x < nx; x++) { if (src[y * nx + x]) last = x; if (x - last <= rad) tmp[y * nx + x] = 1; } last = 1e9; for (let x = nx - 1; x >= 0; x--) { if (src[y * nx + x]) last = x; if (last - x <= rad) tmp[y * nx + x] = 1; } }
    for (let x = 0; x < nx; x++) { let last = -1e9; for (let y = 0; y < ny; y++) { if (tmp[y * nx + x]) last = y; if (y - last <= rad) out[y * nx + x] = 1; } last = 1e9; for (let y = ny - 1; y >= 0; y--) { if (tmp[y * nx + x]) last = y; if (last - y <= rad) out[y * nx + x] = 1; } }
    return out;
  };
  occ = dil(occ);
  // flood the outside
  const lab = new Int32Array(nx * ny).fill(-1);
  const stack: number[] = [];
  const flood = (start: number, id: number): number[] => {
    const cells: number[] = [];
    stack.push(start); lab[start] = id;
    while (stack.length) {
      const k = stack.pop() as number; cells.push(k);
      const x = k % nx, y = (k - x) / nx;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue; const q = Y * nx + X; if (!occ[q] && lab[q] < 0) { lab[q] = id; stack.push(q); } }
    }
    return cells;
  };
  flood(0, 0);
  const rooms: DetectedRoom[] = [];
  let id = 1;
  for (let k = 0; k < occ.length; k++) {
    if (occ[k] || lab[k] >= 0) continue;
    const cells = flood(k, id++);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of cells) { const x = q % nx, y = (q - x) / nx; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    // expand back by the dilation radius: the room's clear edge sits at the wall face
    const w = (x1 - x0 + 1 + 2 * rad) * cell, d = (y1 - y0 + 1 + 2 * rad) * cell;
    const fill = (cells.length * cell * cell) / (((x1 - x0 + 1) * cell) * ((y1 - y0 + 1) * cell));
    if (w * d < minArea || fill < 0.85) continue;
    rooms.push({ x: (x0 - rad - pad) * cell + u0, y: (y0 - rad - pad) * cell + v0, width: w, depth: d, area: w * d });
  }
  if (!rooms.length) warnings.push("No enclosed rectangular rooms found. Try a larger 'close gaps' value if doors are wide, or check that the scan covers whole rooms.");
  const round = (n: number) => Math.round(n * 100) / 100;
  // normalise to a top-left origin (u right, v down is already how the plan reads after the y-flip below)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of rooms) { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x + q.width); maxY = Math.max(maxY, q.y + q.depth); }
  const out = rooms.map((q) => ({ x: round(q.x - minX), y: round(q.y - minY), width: round(q.width), depth: round(q.depth), area: round(q.area) })).sort((a, b) => a.y - b.y || a.x - b.x);
  if (rooms.length) warnings.push(`Plan rotated by ${angle}° so walls line up. Room sizes are clear internal sizes; walls between rooms are not included in the sizes.`);
  return { rotationDeg: angle, rooms: out, floorZ: round(floorZ), slicePoints: sx.length, width: round(maxX - minX), depth: round(maxY - minY), warnings };
}
