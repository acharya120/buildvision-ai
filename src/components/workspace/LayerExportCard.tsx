"use client";

import { useState } from "react";
import { getFloor } from "@/lib/model/ops";
import { planToSvg } from "@/lib/export/svg";
import { buildDxf } from "@/lib/export/dxf";
import { DEFAULT_LAYERS, type ExportLayers } from "@/lib/export/layers";
import { downloadText, safeFileName } from "@/lib/export/download";
import { useWorkspace } from "@/lib/state/store";
import { btn } from "../ui/Field";

/** Optional layered export: choose Grid, Dimensions and Furniture, then download SVG (named groups) or DXF (named layers). */
export default function LayerExportCard() {
  const { project, activeFloorId } = useWorkspace().state;
  const floor = getFloor(project, activeFloorId) ?? project.floors[0];
  const [layers, setLayers] = useState<ExportLayers>(DEFAULT_LAYERS);
  const name = safeFileName(project.name);
  const box = (k: keyof ExportLayers, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} /> {label}</label>
  );
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="lx-h">
      <h2 id="lx-h" className="mb-1 font-semibold">Layered export (SVG and DXF)</h2>
      <p className="mb-2 text-sm text-ink-600">
        Choose what goes in. The SVG keeps every kind of content in its own named group (GRID, PLOT, ROOMS, WALLS, OPENINGS, FURNITURE, GRID_STRUCTURAL, STAIRS_LOADS, LABELS, DIMENSIONS, ANNOTATION) so a vector editor can show or hide them.
        The DXF has one layer per kind (PLOT, ROOMS, WALLS, DOORS, WINDOWS, TEXT, plus the GRID, DIMENSIONS and FURNITURE you tick). Furniture sizes are indicative. Both files are marked as a preliminary concept.
      </p>
      <div className="flex flex-wrap gap-4">{box("grid", "Grid")}{box("dimensions", "Dimensions")}{box("furniture", "Furniture")}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={() => downloadText(planToSvg(project, floor.id, { layers, layered: true }), `${name}-${safeFileName(floor.name)}-layered.svg`, "image/svg+xml")}>Download layered SVG ({floor.name})</button>
        <button className={btn} onClick={() => downloadText(buildDxf(project, { layers }), `${name}-layered.dxf`, "application/dxf")}>Download layered DXF (all floors)</button>
      </div>
    </section>
  );
}
