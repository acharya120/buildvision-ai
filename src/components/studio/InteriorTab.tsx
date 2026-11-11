"use client";

import { useMemo, useState } from "react";
import { furnitureCsv, planFloorInterior } from "@/lib/interior/plan";
import { interiorSvg } from "@/lib/studio/interiorSheet";
import { downloadText, safeFileName } from "@/lib/export/download";
import { useWorkspace } from "@/lib/state/store";
import { btn } from "../ui/Field";
import { Card, Chip, SvgDownloads, SvgView } from "./shared";

export default function InteriorTab() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const [floorId, setFloorId] = useState(activeFloorId);
  const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  const svg = useMemo(() => interiorSvg(project, floor.id), [project, floor.id]);
  const rooms = useMemo(() => planFloorInterior(floor), [floor]);
  return (
    <div className="space-y-4">
      <Card title="Interior layout" right={<div className="flex gap-1.5 overflow-x-auto">{project.floors.map((f) => <Chip key={f.id} active={f.id === floor.id} onClick={() => setFloorId(f.id)}>{f.name}</Chip>)}</div>}>
        <p className="mb-3 text-xs text-ink-600">Furniture is placed by rules: against walls, outside door swings, tall pieces away from windows, with walking space kept clear. It updates when you change rooms, doors or windows.</p>
        <SvgView svg={svg} label={`Interior layout of ${floor.name}`} />
        <div className="mt-3 flex flex-wrap gap-2">
          <SvgDownloads svg={svg} base={`interior-${safeFileName(floor.name)}`} />
          <button className={btn} onClick={() => downloadText(furnitureCsv(project), `${safeFileName(project.name)}-furniture.csv`, "text/csv")}>Furniture schedule (CSV)</button>
        </div>
      </Card>
      <Card title="Room-by-room suggestions">
        {rooms.length === 0 && <p className="text-sm text-ink-600">No rooms on this floor yet.</p>}
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.roomId} className="rounded-lg border border-ink-100 p-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong>{r.roomName}</strong>
                <span className="text-xs text-ink-500">{r.items.length} item(s) · furniture covers {r.crowdingPct}% of floor</span>
              </div>
              {r.items.length > 0 && <p className="mt-1 text-ink-700">{r.items.map((i) => i.name).join(", ")}</p>}
              {r.tips.map((t, i) => <p key={i} className="mt-1 text-xs text-ink-600">• {t}</p>)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
