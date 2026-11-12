"use client";

import { useState } from "react";
import { Chip } from "../studio/shared";
import { IfcPage, TopoPage, ScanPage, StructuralPage } from "./PagesBim";

const PAGES = [["ifc", "IFC / BIM"], ["topo", "Topography"], ["scan", "Scan to plan"], ["struct", "Structural hand-off"]] as const;
type Page = (typeof PAGES)[number][0];

/** BIM, survey and structural hand-off tools. Everything runs in the browser; files are never uploaded. */
export default function BimPanel() {
  const [page, setPage] = useState<Page>("ifc");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="BIM and survey sections" className="flex gap-1.5 overflow-x-auto pb-1">{PAGES.map(([id, label]) => <Chip key={id} active={page === id} onClick={() => setPage(id)}>{label}</Chip>)}</div>
      {page === "ifc" && <IfcPage />}
      {page === "topo" && <TopoPage />}
      {page === "scan" && <ScanPage />}
      {page === "struct" && <StructuralPage />}
    </div>
  );
}
