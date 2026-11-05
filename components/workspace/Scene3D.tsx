"use client";

import { useMemo } from "react";
import { Shape } from "three";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { Project } from "@/lib/model/types";
import { ROOM_COLORS } from "@/lib/model/defaults";
import { isValidRect } from "@/lib/geometry/rect";
import { wallDir, wallLength, wallSolids } from "@/lib/geometry/walls";
import { floorElevations } from "@/lib/export/drawings";
import { buildSite } from "@/lib/site/site";
import { stairBlocks } from "@/lib/geometry/stairs";
import { furnitureFor } from "@/lib/geometry/furniture";
import type { Theme3D } from "@/lib/geometry/theme3d";
import { buildStructure } from "@/lib/structure/structure";
import { footprintFill, hipRoofPositions, pillarPositions, roadAlong, segPieces, segPillars, segShrubs, shrubPositions } from "@/lib/geometry/landscape";

const WALL_T3 = 0.23;
const SHRUB_TONES = ["#3f8f3a", "#4fa046", "#2f7d35"];
const FLOWERS = ["#e45b9b", "#f4c542", "#a56fd8", "#ff7a59"];
const TREE_TONES = ["#3f9a43", "#4aa84e", "#37893c"];

export type CameraPreset = "perspective" | "top" | "front" | "interior";

export interface SceneOptions {
  visible: Record<string, boolean>;
  wallFactor: number; // 0..1 cut-away of wall height
  explode: number; // metres between floors
  showWalls: boolean;
  showRoof: boolean;
  showWindows: boolean;
  showLabels: boolean;
  showDoors: boolean;
  showFurniture: boolean;
  showStairs: boolean;
  showSite: boolean;
  showStructure: boolean;
  theme: Theme3D;
  selectedRoomId: string | null;
  preset: CameraPreset;
  cameraKey: number;
}

interface Props {
  project: Project;
  options: SceneOptions;
  onSelectRoom: (floorId: string, roomId: string) => void;
}

export default function Scene3D({ project, options, onSelectRoom }: Props) {
  const { plot } = project;
  const elev = useMemo(() => floorElevations(project), [project]);
  const totalH = project.floors.reduce((s, f) => s + f.height, 0) + options.explode * (project.floors.length - 1);
  const cx = plot.width / 2;
  const cz = plot.depth / 2;
  const size = Math.max(plot.width, plot.depth, totalH);
  const camera = useMemo(() => {
    switch (options.preset) {
      case "top":
        return [cx, size * 2.2, cz + 0.01] as [number, number, number];
      case "front":
        return [cx, totalH * 0.6, cz + size * 2.2] as [number, number, number];
      case "interior":
        return [cx + size * 0.35, size * 1.25 + totalH * 0.5, cz + size * 0.95] as [number, number, number];
      default:
        return [cx + size * 1.1, size * 0.95, cz + size * 1.5] as [number, number, number];
    }
  }, [options.preset, cx, cz, size, totalH]);

  const site = useMemo(() => (options.showSite ? buildSite(project) : null), [project, options.showSite]);
  const topIndex = project.floors.reduce((acc, f, i) => (options.visible[f.id] !== false ? i : acc), -1);
  const theme = options.theme;
  // shadows look great but cost a lot, so very large buildings are drawn without them
  const heavy = project.floors.reduce((n, f) => n + f.rooms.length, 0) > 120;

  // roof: a hip roof when the top floor is (almost) a rectangle, otherwise a plain slab per room
  // optional structural layout (columns, beams, footings) drawn from the walls of each floor
  const detail = options.showStructure ? project.detail : undefined;
  const structures = useMemo(
    () => (detail && (detail.columns || detail.beams || detail.footings) ? project.floors.map((f) => buildStructure(f, detail.maxSpan)) : null),
    [project, detail],
  );
  const seeFootings = !!(structures && detail?.footings);
  const roofInfo = useMemo(() => {
    if (topIndex < 0) return null;
    const f = project.floors[topIndex];
    const fp = footprintFill(f.rooms.filter(isValidRect));
    if (!fp) return null;
    return { box: fp.box, hip: fp.fill >= 0.85 ? hipRoofPositions(fp.box, f.height) : null };
  }, [project, topIndex]);
  const shrubs = useMemo(() => (site ? (site.polygon ? segShrubs(site.wallSegs, { x: plot.width / 2, y: plot.depth / 2 }) : shrubPositions(site.wall, plot)) : []), [site, plot]);
  const pillars = useMemo(() => (site ? (site.polygon ? segPillars(site.wallSegs) : pillarPositions(site.wall)) : []), [site]);
  const wallPieces = useMemo(() => (site ? segPieces(site.wallSegs) : []), [site]);
  const plotShape = useMemo(() => {
    if (!plot.polygon) return null;
    const sh = new Shape();
    plot.polygon.forEach((q, i) => (i ? sh.lineTo(q.x, q.y) : sh.moveTo(q.x, q.y)));
    sh.closePath();
    return sh;
  }, [plot.polygon]);
  const frontSide = site?.gates.find((g) => g.kind === "entrance")?.side ?? "bottom";
  const road = useMemo(() => {
    if (!site) return null;
    const g = site.gates.find((q) => q.kind === "entrance");
    const edgeAt = site.polygon && g ? (frontSide === "bottom" || frontSide === "top" ? g.y : g.x) : undefined;
    return roadAlong(frontSide, plot, Math.max(20, size * 0.4), 7, 1.6, edgeAt);
  }, [site, frontSide, plot, size]);

  return (
    <Canvas
      key={`${options.preset}-${options.cameraKey}`}
      shadows={!heavy}
      dpr={[1, 2]}
      camera={{ position: camera, fov: 45, near: 0.1, far: 4000 }}
      style={{ background: `linear-gradient(180deg, ${theme.sky} 0%, #ffffff 100%)` }}
    >
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#ffffff", "#b9d9a8", 0.55]} />
      <directionalLight
        position={[cx + size, size * 2, cz + size * 0.5]}
        intensity={1.15}
        castShadow={!heavy}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size * 1.8}
        shadow-camera-right={size * 1.8}
        shadow-camera-top={size * 1.8}
        shadow-camera-bottom={-size * 1.8}
        shadow-camera-near={1}
        shadow-camera-far={size * 8}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[cx - size, size, cz - size]} intensity={0.3} />
      <OrbitControls makeDefault enableDamping target={[cx, totalH / 3, cz]} maxPolarAngle={Math.PI / 2 + 0.05} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.26, cz]}>
        <planeGeometry args={[size * 10, size * 10]} />
        <meshStandardMaterial color={theme.ground} transparent={seeFootings} opacity={seeFootings ? 0.35 : 1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={plotShape ? [0, -0.2, 0] : [cx, -0.2, cz]} scale={plotShape ? [1, -1, 1] : [1, 1, 1]} receiveShadow>
        {plotShape ? <shapeGeometry args={[plotShape]} /> : <planeGeometry args={[plot.width, plot.depth]} />}
        <meshStandardMaterial side={2} color={site?.options.lawn === false ? "#d9d4c8" : theme.lawn} transparent={seeFootings} opacity={seeFootings ? 0.4 : 1} />
      </mesh>
      {site && road && (
        <group>
          <mesh position={[road.pave.cx, -0.2, road.pave.cz]} receiveShadow>
            <boxGeometry args={[road.pave.w, 0.1, road.pave.d]} />
            <meshStandardMaterial color="#cfcac0" />
          </mesh>
          <mesh position={[road.road.cx, -0.23, road.road.cz]} receiveShadow>
            <boxGeometry args={[road.road.w, 0.06, road.road.d]} />
            <meshStandardMaterial color={theme.road} />
          </mesh>
          {road.dashes.map((d, i) => (
            <mesh key={`dash-${i}`} position={[d.x, -0.19, d.z]}>
              <boxGeometry args={[d.w, 0.02, d.d]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      )}
      {site && (
        <group>
          {site.paths.map((r, i) => (
            <mesh key={`path-${i}`} position={[r.x + r.width / 2, -0.17, r.y + r.depth / 2]} receiveShadow>
              <boxGeometry args={[r.width, 0.06, r.depth]} />
              <meshStandardMaterial color="#d6d0c4" />
            </mesh>
          ))}
          {site.wall.map((r, i) => {
            const horiz = r.width >= r.depth;
            return (
              <group key={`bw-${i}`}>
                <mesh position={[r.x + r.width / 2, 0.8, r.y + r.depth / 2]} castShadow receiveShadow>
                  <boxGeometry args={[r.width, 1.8, r.depth]} />
                  <meshStandardMaterial color={theme.boundary} />
                </mesh>
                <mesh position={[r.x + r.width / 2, 1.75, r.y + r.depth / 2]}>
                  <boxGeometry args={[r.width + (horiz ? 0 : 0.1), 0.1, r.depth + (horiz ? 0.1 : 0)]} />
                  <meshStandardMaterial color={theme.trim} />
                </mesh>
              </group>
            );
          })}
          {wallPieces.map((w, i) => (
            <mesh key={`bs-${i}`} position={[w.cx, 0.8, w.cz]} rotation={[0, w.angle, 0]} castShadow receiveShadow>
              <boxGeometry args={[w.len, 1.8, WALL_T3]} />
              <meshStandardMaterial color={theme.boundary} />
            </mesh>
          ))}
          {pillars.map((p, i) => (
            <group key={`pillar-${i}`} position={[p.x, 0, p.z]}>
              <mesh position={[0, 0.85, 0]} castShadow>
                <boxGeometry args={[0.42, 2.1, 0.42]} />
                <meshStandardMaterial color={theme.boundary} />
              </mesh>
              <mesh position={[0, 1.95, 0]}>
                <boxGeometry args={[0.52, 0.1, 0.52]} />
                <meshStandardMaterial color={theme.trim} />
              </mesh>
            </group>
          ))}
          {shrubs.map((b, i) => (
            <group key={`shrub-${i}`} position={[b.x, -0.2, b.z]}>
              <mesh position={[0, b.r * 0.7, 0]} scale={[1, 0.8, 1]} castShadow>
                <sphereGeometry args={[b.r, 8, 6]} />
                <meshStandardMaterial color={SHRUB_TONES[b.tone]} />
              </mesh>
              {b.flower !== null && (
                <mesh position={[b.r * 0.3, b.r * 1.3, 0]}>
                  <sphereGeometry args={[0.1, 6, 5]} />
                  <meshStandardMaterial color={FLOWERS[b.flower]} />
                </mesh>
              )}
            </group>
          ))}
          {site.trees.map((t, i) => (
            <group key={`tree-${i}`} position={[t.x, -0.2, t.y]}>
              <mesh position={[0, t.r * 1.1, 0]} castShadow>
                <cylinderGeometry args={[Math.max(0.08, t.r * 0.12), Math.max(0.1, t.r * 0.16), t.r * 2.2, 8]} />
                <meshStandardMaterial color="#6b4a2b" />
              </mesh>
              <mesh position={[0, t.r * 2.7, 0]} castShadow>
                <sphereGeometry args={[t.r * 1.45, 14, 12]} />
                <meshStandardMaterial color={TREE_TONES[i % 3]} />
              </mesh>
              <mesh position={[t.r * 0.55, t.r * 3.3, t.r * 0.2]} castShadow>
                <sphereGeometry args={[t.r * 1.0, 12, 10]} />
                <meshStandardMaterial color={TREE_TONES[(i + 1) % 3]} />
              </mesh>
              <mesh position={[-t.r * 0.5, t.r * 2.2, -t.r * 0.35]} castShadow>
                <sphereGeometry args={[t.r * 0.95, 12, 10]} />
                <meshStandardMaterial color={TREE_TONES[(i + 2) % 3]} />
              </mesh>
            </group>
          ))}
          {site.gates.map((g, i) => {
            const horiz = g.side === "top" || g.side === "bottom";
            const bars = Math.max(4, Math.min(40, Math.floor(g.width / 0.3)));
            const leafW = g.width * 0.94;
            return (
              <group key={`gate-${i}`} position={[g.x, 0, g.y]}>
                <group rotation={[0, horiz ? 0 : Math.PI / 2, 0]}>
                  {[0.2, 1.2].map((yy) => (
                    <mesh key={`rail-${yy}`} position={[0, yy, 0]}>
                      <boxGeometry args={[leafW, 0.1, 0.08]} />
                      <meshStandardMaterial color="#2b2f36" />
                    </mesh>
                  ))}
                  {Array.from({ length: bars }, (_, k) => (
                    <mesh key={`bar-${k}`} position={[-leafW / 2 + (leafW * (k + 0.5)) / bars, 0.7, 0]}>
                      <boxGeometry args={[0.05, 1.1, 0.05]} />
                      <meshStandardMaterial color="#2b2f36" />
                    </mesh>
                  ))}
                </group>
                {options.showLabels && (
                  <Html position={[0, 2.8, 0]} center distanceFactor={size * 0.9} style={{ pointerEvents: "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "Arial, sans-serif", color: "#fff", background: g.kind === "entrance" ? "#15803d" : "#b45309", padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>
                      {g.kind === "entrance" ? (g.vehicle ? "VEHICLE ENTRY" : "ENTRANCE") : "EXIT"}
                    </div>
                  </Html>
                )}
              </group>
            );
          })}
        </group>
      )}
      {!site && <gridHelper args={[size * 3, 30, "#b8c2d0", "#d3dae5"]} position={[cx, -0.21, cz]} />}

      {project.floors.map((floor, fi) => {
        if (options.visible[floor.id] === false) return null;
        const base = elev[fi] + options.explode * fi;
        const H = floor.height;
        return (
          <group key={floor.id} position={[0, base, 0]}>
            {floor.rooms.filter(isValidRect).map((r) => {
              const selected = options.selectedRoomId === r.id;
              const isStair = r.type === "staircase";
              const stairwell = isStair && fi > 0; // open stairwell: the stair from below arrives here
              const blocks = isStair && options.showStairs && fi < project.floors.length - 1 ? stairBlocks(r, H) : [];
              const furniture = options.showFurniture ? furnitureFor(r) : [];
              return (
                <group key={r.id}>
                  {blocks.map((b, bi) => (
                    <mesh key={`st-${bi}`} position={[b.x + b.width / 2, b.top / 2, b.y + b.depth / 2]} onClick={(e) => { e.stopPropagation(); onSelectRoom(floor.id, r.id); }}>
                      <boxGeometry args={[b.width, b.top, b.depth]} />
                      <meshStandardMaterial color={b.kind === "landing" ? "#b79d7c" : "#c9b08e"} />
                    </mesh>
                  ))}
                  {furniture.map((f, fx) => (
                    <mesh key={`fu-${fx}`} position={[f.x + f.width / 2, f.height / 2, f.y + f.depth / 2]}>
                      <boxGeometry args={[f.width, f.height, f.depth]} />
                      <meshStandardMaterial color={f.color} />
                    </mesh>
                  ))}
                  {!stairwell && <mesh position={[r.x + r.width / 2, -0.06, r.y + r.depth / 2]} onClick={(e) => { e.stopPropagation(); onSelectRoom(floor.id, r.id); }}>
                    <boxGeometry args={[r.width, 0.12, r.depth]} />
                    <meshStandardMaterial color={ROOM_COLORS[r.type]} emissive={selected ? "#1f9d78" : "#000000"} emissiveIntensity={selected ? 0.55 : 0} />
                  </mesh>}
                  {stairwell && !options.showStairs && (
                    <mesh position={[r.x + r.width / 2, -0.06, r.y + r.depth / 2]}>
                      <boxGeometry args={[r.width, 0.12, r.depth]} />
                      <meshStandardMaterial color={ROOM_COLORS[r.type]} />
                    </mesh>
                  )}
                  {options.showLabels && (
                    <Html position={[r.x + r.width / 2, 0.3, r.y + r.depth / 2]} center distanceFactor={size * 0.9} style={{ pointerEvents: "none" }}>
                      <div style={{ fontSize: 12, fontFamily: "Arial, sans-serif", background: "rgba(255,255,255,0.8)", padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap" }}>{r.name}</div>
                    </Html>
                  )}
                </group>
              );
            })}

            {options.showWalls &&
              floor.walls.flatMap((w) => {
                const len = wallLength(w);
                if (len < 0.01) return [];
                const d = wallDir(w);
                const angle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
                const limit = H * options.wallFactor;
                return wallSolids(w, floor.openings, H)
                  .filter((s) => s.z0 < limit - 1e-6)
                  .map((s, i) => {
                    const z1 = Math.min(s.z1, limit);
                    const mid = (s.a0 + s.a1) / 2;
                    return (
                      <mesh
                        key={`${w.id}-${i}`}
                        position={[w.x1 + d.x * mid, (s.z0 + z1) / 2, w.y1 + d.y * mid]}
                        rotation={[0, -angle, 0]}
                        castShadow
                        receiveShadow
                      >
                        <boxGeometry args={[s.a1 - s.a0, z1 - s.z0, w.thickness]} />
                        <meshStandardMaterial color={theme.wall} />
                      </mesh>
                    );
                  });
              })}

            {options.showWalls && options.showDoors &&
              floor.openings
                .filter((o) => o.kind === "door")
                .map((o) => {
                  const w = floor.walls.find((q) => q.id === o.wallId);
                  if (!w) return null;
                  const d = wallDir(w);
                  const mid = o.offset + o.width / 2;
                  const limit = H * options.wallFactor;
                  const top = Math.min(o.sill + o.height, limit);
                  if (top <= o.sill + 0.01) return null;
                  return (
                    <mesh key={o.id} position={[w.x1 + d.x * mid, (o.sill + top) / 2, w.y1 + d.y * mid]} rotation={[0, -Math.atan2(w.y2 - w.y1, w.x2 - w.x1), 0]}>
                      <boxGeometry args={[o.width * 0.96, top - o.sill, 0.04]} />
                      <meshStandardMaterial color="#8a6a4a" />
                    </mesh>
                  );
                })}

            {options.showWalls && options.showWindows &&
              floor.openings
                .filter((o) => o.kind === "window")
                .map((o) => {
                  const w = floor.walls.find((q) => q.id === o.wallId);
                  if (!w) return null;
                  const d = wallDir(w);
                  const mid = o.offset + o.width / 2;
                  const limit = H * options.wallFactor;
                  if (o.sill >= limit) return null;
                  const top = Math.min(o.sill + o.height, limit);
                  const ang = -Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
                  return (
                    <group key={o.id} position={[w.x1 + d.x * mid, 0, w.y1 + d.y * mid]} rotation={[0, ang, 0]}>
                      <mesh position={[0, (o.sill + top) / 2, 0]}>
                        <boxGeometry args={[o.width, top - o.sill, 0.03]} />
                        <meshStandardMaterial color={theme.window} transparent opacity={0.8} metalness={0.2} roughness={0.25} />
                      </mesh>
                      <mesh position={[0, o.sill - 0.03, 0]}>
                        <boxGeometry args={[o.width + 0.16, 0.06, w.thickness + 0.1]} />
                        <meshStandardMaterial color="#ffffff" />
                      </mesh>
                    </group>
                  );
                })}

            {structures && detail && structures[fi] && (
              <group>
                {detail.columns &&
                  structures[fi].columns.map((c, ci) => (
                    <mesh key={`col-${ci}`} position={[c.x, H / 2 - 0.06, c.y]} castShadow>
                      <boxGeometry args={[detail.columnSize, H + 0.12, detail.columnSize]} />
                      <meshStandardMaterial color="#8d949c" />
                    </mesh>
                  ))}
                {detail.beams &&
                  structures[fi].beams.map((b, bi) => {
                    const horiz = Math.abs(b.y2 - b.y1) < 1e-3;
                    const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
                    const bw = Math.min(0.23, detail.columnSize);
                    return (
                      <mesh key={`beam-${bi}`} position={[(b.x1 + b.x2) / 2, H - detail.beamDepth / 2, (b.y1 + b.y2) / 2]}>
                        <boxGeometry args={horiz ? [len, detail.beamDepth, bw] : [bw, detail.beamDepth, len]} />
                        <meshStandardMaterial color="#a89f91" />
                      </mesh>
                    );
                  })}
                {detail.footings && fi === 0 &&
                  structures[0].columns.map((c, ci) => (
                    <group key={`ft-${ci}`} position={[c.x, 0, c.y]}>
                      <mesh position={[0, -0.9, 0]}>
                        <boxGeometry args={[detail.footingSize, 0.4, detail.footingSize]} />
                        <meshStandardMaterial color="#7b6a55" />
                      </mesh>
                      <mesh position={[0, -0.51, 0]}>
                        <boxGeometry args={[detail.columnSize, 0.78, detail.columnSize]} />
                        <meshStandardMaterial color="#8d949c" />
                      </mesh>
                    </group>
                  ))}
              </group>
            )}

            {options.showWalls && options.wallFactor >= 0.99 && options.explode === 0 && fi < project.floors.length - 1 && (() => {
              const fp = footprintFill(floor.rooms.filter(isValidRect));
              if (!fp) return null;
              return (
                <mesh position={[fp.box.x + fp.box.width / 2, H, fp.box.y + fp.box.depth / 2]}>
                  <boxGeometry args={[fp.box.width + 0.12, 0.14, fp.box.depth + 0.12]} />
                  <meshStandardMaterial color={theme.trim} />
                </mesh>
              );
            })()}

            {options.showRoof && fi === topIndex && roofInfo && (
              roofInfo.hip ? (
                <group>
                  <mesh position={[roofInfo.box.x + roofInfo.box.width / 2, H + 0.04, roofInfo.box.y + roofInfo.box.depth / 2]}>
                    <boxGeometry args={[roofInfo.box.width, 0.1, roofInfo.box.depth]} />
                    <meshStandardMaterial color={theme.trim} />
                  </mesh>
                  <mesh key={`hip-${roofInfo.box.x}-${roofInfo.box.width}-${roofInfo.box.depth}-${H}`} castShadow receiveShadow>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[roofInfo.hip.positions, 3]} />
                    </bufferGeometry>
                    <meshStandardMaterial color={theme.roof} flatShading side={2} roughness={0.85} />
                  </mesh>
                </group>
              ) : (
                <group>
                  {floor.rooms.filter(isValidRect).map((r) => (
                    <mesh key={`roof-${r.id}`} position={[r.x + r.width / 2, H + 0.07, r.y + r.depth / 2]} castShadow>
                      <boxGeometry args={[r.width + 0.2, 0.14, r.depth + 0.2]} />
                      <meshStandardMaterial color={theme.roof} />
                    </mesh>
                  ))}
                </group>
              )
            )}
          </group>
        );
      })}
    </Canvas>
  );
}
