"use client";

import { useMemo, useState } from "react";
import { DEFAULT_SERVICES, POINT_LABELS, servicesSummary, type PointKind } from "@/lib/analysis/services";
import { DEFAULT_TIMELINE, buildTimeline } from "@/lib/analysis/timeline";
import { servicesSvg, timelineSvg, type ServicesLayer } from "@/lib/analysis/sheets";
import { useStored } from "@/lib/analysis/useStored";
import { useWorkspace } from "@/lib/state/store";
import { NumberField, inputCls } from "../ui/Field";
import { Card, Chip, SvgDownloads, SvgView } from "../studio/shared";
import { FloorChips, Prelim, Stat } from "./common";

export function ServicesPage() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const [o, setO] = useStored(project.id, "services", DEFAULT_SERVICES);
  const [layer, setLayer] = useState<ServicesLayer>("both");
  const [fid, setFid] = useState(activeFloorId);
  const floor = project.floors.find((f) => f.id === fid) ?? project.floors[0];
  const svg = useMemo(() => servicesSvg(project, floor, layer, o), [project, floor, layer, o]);
  const sum = useMemo(() => servicesSummary(project, o), [project, o]);
  return (
    <div className="space-y-4">
      <Card title="Electrical and plumbing layout" right={<FloorChips floorId={floor.id} onChange={setFid} />}>
        <Prelim>Points, fixtures and pipe runs are placed by rules to size quantities and loads. A licensed electrician or plumbing engineer must design and approve circuits, cable and pipe sizes, earthing, protection and drainage slopes.</Prelim>
        <div className="my-3 flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5" role="group" aria-label="Layer">{(["both", "electrical", "plumbing"] as const).map((l) => <Chip key={l} active={layer === l} onClick={() => setLayer(l)}>{l === "both" ? "Both" : l === "electrical" ? "Electrical" : "Plumbing"}</Chip>)}</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.acInBedrooms} onChange={(e) => setO({ ...o, acInBedrooms: e.target.checked })} /> AC point in bedrooms</label>
          <div className="w-32"><NumberField label="People (0 = auto)" allowEmpty={false} step="1" value={o.people} onCommit={(v) => { if (v != null && v >= 0 && v <= 2000) setO({ ...o, people: Math.round(v) }); }} /></div>
          <div className="w-36"><NumberField label="Litres / person / day" allowEmpty={false} value={o.litresPerHead} onCommit={(v) => { if (v != null && v >= 10 && v <= 1000) setO({ ...o, litresPerHead: v }); }} /></div>
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-4"><Stat label="Connected load" value={`${sum.connectedKw} kW`} /><Stat label="Water use" value={`${sum.dailyLitres} L/day`} /><Stat label="Suggested tank" value={`${sum.tankLitres} L`} /><Stat label="Pipe (supply + drain)" value={`${(sum.supplyPipeM + sum.drainPipeM).toFixed(0)} m`} /></div>
        <SvgView svg={svg} label="Electrical and plumbing layout" />
        <div className="mt-3"><SvgDownloads svg={svg} base={`services-${floor.name}`} /></div>
        <p className="mt-3 text-xs text-ink-600">Points in the whole building: {(Object.keys(POINT_LABELS) as PointKind[]).filter((k) => sum.points[k]).map((k) => `${POINT_LABELS[k]} ${sum.points[k]}`).join(" · ")}</p>
      </Card>
    </div>
  );
}

export function TimelinePage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [o, setO] = useStored(project.id, "timeline", DEFAULT_TIMELINE);
  const t = useMemo(() => buildTimeline(project, o), [project, o]);
  const svg = useMemo(() => timelineSvg(project, o), [project, o]);
  return (
    <Card title="Construction timeline">
      <Prelim>Durations come from rule-of-thumb productivity that grows with the built-up area. Real programmes depend on your contractor, labour and material supply, weather, approvals and curing times.</Prelim>
      <div className="my-3 grid gap-3 sm:grid-cols-4">
        <div><label htmlFor="tl-start" className="mb-1 block text-xs font-medium text-ink-600">Start date</label><input id="tl-start" type="date" className={inputCls} value={o.startDate} onChange={(e) => { if (e.target.value) setO({ ...o, startDate: e.target.value }); }} /></div>
        <div><label htmlFor="tl-dpw" className="mb-1 block text-xs font-medium text-ink-600">Working days per week</label><select id="tl-dpw" className={inputCls} value={o.daysPerWeek} onChange={(e) => setO({ ...o, daysPerWeek: e.target.value === "5" ? 5 : 6 })}><option value={6}>6 (Mon-Sat)</option><option value={5}>5 (Mon-Fri)</option></select></div>
        <NumberField label="Crew size factor (1 = normal)" allowEmpty={false} step="0.25" value={o.crew} onCommit={(v) => { if (v != null && v >= 0.25 && v <= 4) setO({ ...o, crew: v }); }} />
        <NumberField label="Weather buffer on outdoor work %" allowEmpty={false} value={o.weatherBufferPct} onCommit={(v) => { if (v != null && v <= 100) setO({ ...o, weatherBufferPct: v }); }} />
      </div>
      <div className="mb-3 grid gap-3 sm:grid-cols-3"><Stat label="Working days" value={String(t.totalWorkDays)} /><Stat label="About" value={`${(t.totalWorkDays / (o.daysPerWeek * 4.345)).toFixed(1)} months`} /><Stat label="Estimated finish" value={t.finish} /></div>
      <SvgView svg={svg} label="Construction timeline chart" />
      <div className="mt-3"><SvgDownloads svg={svg} base="timeline" /></div>
    </Card>
  );
}
