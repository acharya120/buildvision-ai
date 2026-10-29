"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { Project } from "@/lib/model/types";
import { ROOM_COLORS } from "@/lib/model/defaults";
import { isValidRect } from "@/lib/geometry/rect";
import { wallDir, wallLength, wallSolids } from "@/lib/geometry/walls";
import { floorElevations } from "@/lib/export/drawings";
import { stairBlocks } from "@/lib/geometry/stairs";
import { furnitureFor } from "@/lib/geometry/furniture";

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

  const topIndex = project.floors.reduce((acc, f, i) => (options.visible[f.id] !== false ? i : acc), -1);

  return (
    <Canvas key={`${options.preset}-${options.cameraKey}`} camera={{ position: camera, fov: 45, near: 0.1, far: 2000 }} style={{ background: "#e9eef5" }}>
      <ambientLight intensity={0.65} />
      <directionalLight position={[cx + size, size * 2, cz + size * 0.5]} intensity={1.1} />
      <directionalLight position={[cx - size, size, cz - size]} intensity={0.35} />
      <OrbitControls makeDefault enableDamping target={[cx, totalH / 3, cz]} maxPolarAngle={Math.PI / 2 + 0.05} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.2, cz]}>
        <planeGeometry args={[plot.width, plot.depth]} />
        <meshStandardMaterial color="#cfe3d0" />
      </mesh>
      <gridHelper args={[size * 3, 30, "#b8c2d0", "#d3dae5"]} position={[cx, -0.21, cz]} />

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
                      >
                        <boxGeometry args={[s.a1 - s.a0, z1 - s.z0, w.thickness]} />
                        <meshStandardMaterial color="#ece6da" />
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
                  return (
                    <mesh
                      key={o.id}
                      position={[w.x1 + d.x * mid, (o.sill + top) / 2, w.y1 + d.y * mid]}
                      rotation={[0, -Math.atan2(w.y2 - w.y1, w.x2 - w.x1), 0]}
                    >
                      <boxGeometry args={[o.width, top - o.sill, 0.03]} />
                      <meshStandardMaterial color="#8ec5ef" transparent opacity={0.55} />
                    </mesh>
                  );
                })}

            {options.showRoof && fi === topIndex &&
              floor.rooms.filter(isValidRect).map((r) => (
                <mesh key={`roof-${r.id}`} position={[r.x + r.width / 2, H + 0.07, r.y + r.depth / 2]}>
                  <boxGeometry args={[r.width + 0.2, 0.14, r.depth + 0.2]} />
                  <meshStandardMaterial color="#b9a58f" />
                </mesh>
              ))}
          </group>
        );
      })}
    </Canvas>
  );
}
