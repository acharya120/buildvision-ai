"use client";

import { useMemo, useState } from "react";
import { ELEVATION_VIEWS, elevationSvg, type ElevationView } from "@/lib/studio/elevationSheet";
import { useWorkspace } from "@/lib/state/store";
import { Card, Chip, SvgDownloads, SvgView } from "./shared";

export default function ElevationsTab() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [view, setView] = useState<ElevationView>("front");
  const svg = useMemo(() => elevationSvg(project, view), [project, view]);
  return (
    <Card title="Elevations" right={<div className="flex gap-1.5 overflow-x-auto">{ELEVATION_VIEWS.map((v) => <Chip key={v.id} active={v.id === view} onClick={() => setView(v.id)}>{v.label.replace(" elevation", "")}</Chip>)}</div>}>
      <p className="mb-3 text-xs text-ink-600">Drawn from the same plan as everything else, so doors, windows and floor heights always match. Includes levels, plinth, lintels, sills, parapet and overall dimensions.</p>
      <SvgView svg={svg} label={`${view} elevation`} />
      <div className="mt-3"><SvgDownloads svg={svg} base={`elevation-${view}`} /></div>
    </Card>
  );
}
