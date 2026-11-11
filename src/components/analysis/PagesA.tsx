"use client";

import { useMemo, useState } from "react";
import { setNorth } from "@/lib/model/ops";
import { vastuCheck } from "@/lib/analysis/vastu";
import { SECTOR_NAMES, SECTORS } from "@/lib/analysis/compass";
import { dayOfYear, dayLength, shadowPolygons, sunPosition, sunReport } from "@/lib/analysis/sun";
import { windAnalysis, windSummary } from "@/lib/analysis/wind";
import { shadowSvg, vastuSvg, windSvg } from "@/lib/analysis/sheets";
import { useStored } from "@/lib/analysis/useStored";
import { useWorkspace } from "@/lib/state/store";
import { btn, NumberField } from "../ui/Field";
import { Card, Chip, SvgDownloads, SvgView } from "../studio/shared";
import { FloorChips, Pill, Prelim, Stat } from "./common";

const R = { favoured: ["Favoured", "good"], acceptable: ["Acceptable", "info"], neutral: ["Neutral", "muted"], avoid: ["Less favoured", "bad"] } as const;

export function VastuPage() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const [fid, setFid] = useState(activeFloorId);
  const floor = project.floors.find((f) => f.id === fid) ?? project.floors[0];
  const res = useMemo(() => vastuCheck(project), [project]);
  const svg = useMemo(() => vastuSvg(project, floor), [project, floor]);
  return (
    <div className="space-y-4">
      <Card title="Vastu check (optional)" right={<FloorChips floorId={floor.id} onChange={setFid} />}>
        <p className="mb-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-700">Vastu Shastra is a traditional belief system, and schools differ on the rules. This is an optional cultural guide. It is not an engineering, safety or legal check and it never changes your plan.</p>
        <div className="mb-3 grid gap-3 sm:grid-cols-4">
          <NumberField label="North angle (° clockwise from plan top)" allowEmpty={false} min={-360} value={project.northAngle ?? 0} onCommit={(v) => { if (v != null) ws.commit(setNorth(ws.getState().project, v)); }} />
          <Stat label="Rooms in a favoured direction" value={`${res.favoured} of ${res.rated}`} tone={res.rated && res.favoured === res.rated ? "good" : undefined} />
          <Stat label="Main entrance faces" value={res.entrance ? SECTOR_NAMES[res.entrance.sector] : "no outside door"} />
          <Stat label="Less favoured placements" value={String(res.avoid.length + (res.entrance?.rating === "avoid" ? 1 : 0))} tone={res.avoid.length ? "bad" : undefined} />
        </div>
        <SvgView svg={svg} label="Vastu overview" />
        <div className="mt-3"><SvgDownloads svg={svg} base="vastu" /></div>
      </Card>
      <Card title="Room by room">
        {res.rooms.length === 0 && <p className="text-sm text-ink-600">Add rooms to see results.</p>}
        <ul className="space-y-1.5">
          {res.entrance && <li className="flex flex-wrap items-center gap-2 text-sm"><Pill tone={R[res.entrance.rating][1]}>{R[res.entrance.rating][0]}</Pill><strong>Main entrance</strong> faces {SECTOR_NAMES[res.entrance.sector]}. <span className="text-xs text-ink-500">{res.entrance.text}</span></li>}
          {res.rooms.map((r) => (
            <li key={r.roomId} className="flex flex-wrap items-center gap-2 text-sm">
              <Pill tone={R[r.rating][1]}>{R[r.rating][0]}</Pill><strong>{r.name}</strong> ({r.floorName}) is in the {r.sector === "Centre" ? "centre" : SECTOR_NAMES[r.sector]}. <span className="text-xs text-ink-500">{r.text}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const PRESETS: Array<[string, number, number]> = [["Mar 21", 3, 21], ["Jun 21", 6, 21], ["Sep 23", 9, 23], ["Dec 21", 12, 21]];
export function SunPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [s, setS] = useStored(project.id, "sun", { lat: 20, month: 12, day: 21, hour: 15 });
  const n = dayOfYear(s.month, s.day);
  const pos = sunPosition(s.lat, n, s.hour);
  const svg = useMemo(() => shadowSvg(project, pos, `${s.day}/${s.month} at ${Math.floor(s.hour)}:${s.hour % 1 ? "30" : "00"} solar time, latitude ${s.lat}°`), [project, s, pos]);
  const rep = useMemo(() => sunReport(project, s.lat, n), [project, s.lat, n]);
  const shaded = shadowPolygons(project, pos).length > 0;
  const byRoom = rep.windows.slice().sort((a, b) => b.hours - a.hours);
  return (
    <div className="space-y-4">
      <Card title="Sun and shadow simulation">
        <Prelim>Standard solar-geometry formulas (about 1° accuracy). Neighbouring buildings and trees are not modelled, and times are solar time (12:00 = sun at its highest).</Prelim>
        <div className="my-3 grid gap-3 sm:grid-cols-4">
          <NumberField label="Your latitude (° N positive)" allowEmpty={false} min={-66} step="0.1" value={s.lat} onCommit={(v) => { if (v != null && v <= 66 && v >= -66) setS({ ...s, lat: v }); }} />
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600" htmlFor="sun-hour">Solar time: {Math.floor(s.hour)}:{s.hour % 1 ? "30" : "00"}</label>
            <input id="sun-hour" type="range" min={5} max={19} step={0.5} value={s.hour} onChange={(e) => setS({ ...s, hour: Number(e.target.value) })} className="w-full" />
          </div>
          <Stat label="Sun altitude / azimuth" value={pos.altitude < 0 ? "below horizon" : `${pos.altitude.toFixed(0)}° / ${pos.azimuth.toFixed(0)}°`} />
          <Stat label="Daylight that day" value={`${dayLength(s.lat, n).toFixed(1)} h`} />
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">{PRESETS.map(([l, m, d]) => <Chip key={l} active={s.month === m && s.day === d} onClick={() => setS({ ...s, month: m, day: d })}>{l}</Chip>)}</div>
        {!shaded && <p className="mb-2 text-xs text-ink-600">The sun is below the horizon at this time, so there is no shadow.</p>}
        <SvgView svg={svg} label="Shadow study" />
        <div className="mt-3"><SvgDownloads svg={svg} base="sun-shadow" /></div>
      </Card>
      <Card title="Direct sun on windows (whole day)">
        {rep.notes.map((t, i) => <p key={i} className="mb-1 text-sm text-amber-900">• {t}</p>)}
        <p className="mb-2 text-xs text-ink-600">Facades: {rep.facades.map((f) => `${f.sector} ${f.hours} h`).join(" · ")}</p>
        {byRoom.length === 0 ? <p className="text-sm text-ink-600">No outside windows yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Room</th><th>Faces</th><th>Area (m²)</th><th>Direct sun (h)</th></tr></thead><tbody>
            {byRoom.map((w, i) => <tr key={i} className="border-t border-ink-100"><td className="py-1">{w.room} <span className="text-xs text-ink-500">({w.floorName})</span></td><td>{SECTOR_NAMES[w.sector]}</td><td>{w.area.toFixed(2)}</td><td>{w.hours}</td></tr>)}
          </tbody></table></div>
        )}
      </Card>
    </div>
  );
}

export function WindPage() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const [w, setW] = useStored(project.id, "wind", { from: 225 });
  const [fid, setFid] = useState(activeFloorId);
  const floor = project.floors.find((f) => f.id === fid) ?? project.floors[0];
  const rows = useMemo(() => windAnalysis(project, w.from), [project, w.from]);
  const sum = windSummary(rows);
  const svg = useMemo(() => windSvg(project, floor, w.from), [project, floor, w.from]);
  return (
    <div className="space-y-4">
      <Card title="Wind and ventilation analysis" right={<FloorChips floorId={floor.id} onChange={setFid} />}>
        <Prelim>Rule-based check of opening sizes and wind-facing walls. It is not a wind-tunnel or CFD study. Ask your local weather office or an engineer for the prevailing wind in your area.</Prelim>
        <div className="my-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wind comes from">{SECTORS.map((sct, i) => <Chip key={sct} active={Math.round(w.from / 45) % 8 === i} onClick={() => setW({ from: i * 45 })}>{sct}</Chip>)}</div>
          <div className="w-40"><NumberField label="or exact bearing (°)" allowEmpty={false} min={0} value={w.from} onCommit={(v) => { if (v != null && v <= 360) setW({ from: v }); }} /></div>
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-4"><Stat label="Cross ventilation" value={String(sum.good)} tone="good" /><Stat label="One side only" value={String(sum.fair)} /><Stat label="Too little opening" value={String(sum.poor)} /><Stat label="No outside opening" value={String(sum.none)} tone={sum.none ? "bad" : undefined} /></div>
        <SvgView svg={svg} label="Ventilation map" />
        <div className="mt-3"><SvgDownloads svg={svg} base={`ventilation-${floor.name}`} /></div>
      </Card>
      <Card title="Room by room">
        <ul className="space-y-1.5 text-sm">{rows.map((r) => <li key={r.roomId}><Pill tone={r.rating === "good" ? "good" : r.rating === "fair" ? "warn" : "bad"}>{r.rating === "good" ? "Good" : r.rating === "fair" ? "Fair" : r.rating === "poor" ? "Poor" : "None"}</Pill> <strong>{r.name}</strong> ({r.floorName}) {r.advice}</li>)}</ul>
      </Card>
    </div>
  );
}
export { btn };
