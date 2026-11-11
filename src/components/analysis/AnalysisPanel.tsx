"use client";

import { useState } from "react";
import { Chip } from "../studio/shared";
import { VastuPage, SunPage, WindPage } from "./PagesA";
import { ServicesPage, TimelinePage } from "./PagesB";
import { RoiPage, CompliancePage, ComparePage } from "./PagesC";

const PAGES = [["compliance", "Regulation check"], ["sun", "Sun & shadow"], ["wind", "Ventilation"], ["vastu", "Vastu"], ["services", "Electrical & plumbing"], ["timeline", "Timeline"], ["roi", "ROI"], ["compare", "Compare designs"]] as const;
type Page = (typeof PAGES)[number][0];

/** Preliminary analysis tools. Results are estimates from rules and your inputs, never professional approvals. */
export default function AnalysisPanel() {
  const [page, setPage] = useState<Page>("compliance");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Analysis sections" className="flex gap-1.5 overflow-x-auto pb-1">
        {PAGES.map(([id, label]) => <Chip key={id} active={page === id} onClick={() => setPage(id)}>{label}</Chip>)}
      </div>
      {page === "compliance" && <CompliancePage />}
      {page === "sun" && <SunPage />}
      {page === "wind" && <WindPage />}
      {page === "vastu" && <VastuPage />}
      {page === "services" && <ServicesPage />}
      {page === "timeline" && <TimelinePage />}
      {page === "roi" && <RoiPage />}
      {page === "compare" && <ComparePage />}
    </div>
  );
}
