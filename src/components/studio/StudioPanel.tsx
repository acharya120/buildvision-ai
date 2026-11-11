"use client";

import { useState } from "react";
import { Chip } from "./shared";
import ReviewTab from "./ReviewTab";
import InteriorTab from "./InteriorTab";
import ElevationsTab from "./ElevationsTab";
import MaterialsTab from "./MaterialsTab";
import HistoryTab from "./HistoryTab";
import PackTab from "./PackTab";
import AnalysisPanel from "../analysis/AnalysisPanel";
import EngineeringPanel from "../engineering/EngineeringPanel";
import SitePanel from "../sitemgmt/SitePanel";

const PAGES = [["review", "Design review"], ["interior", "Interior"], ["elevations", "Elevations"], ["materials", "Materials & cost"], ["history", "History"], ["pack", "PDF pack"]] as const;
type Page = (typeof PAGES)[number][0];

/** Additional tools built on the same project. Nothing here changes the design unless a button says so. */
export default function StudioPanel() {
  const [page, setPage] = useState<Page>("review");
  const [group, setGroup] = useState<"design" | "analysis" | "engineering" | "site">("design");
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Studio</h2>
        <p className="text-sm text-ink-600">Review, furnish, draw, cost and analyse your design.</p>
        <div role="group" aria-label="Studio group" className="mt-2 flex gap-1.5"><Chip active={group === "design"} onClick={() => setGroup("design")}>Design tools</Chip><Chip active={group === "analysis"} onClick={() => setGroup("analysis")}>Analysis (preliminary)</Chip><Chip active={group === "engineering"} onClick={() => setGroup("engineering")}>Engineering (preliminary)</Chip><Chip active={group === "site"} onClick={() => setGroup("site")}>Site & money</Chip></div>
      </div>
      {group === "analysis" && <AnalysisPanel />}
      {group === "engineering" && <EngineeringPanel />}
      {group === "site" && <SitePanel />}
      {group === "design" && <div role="tablist" aria-label="Studio sections" className="flex gap-1.5 overflow-x-auto pb-1">
        {PAGES.map(([id, label]) => <Chip key={id} active={page === id} onClick={() => setPage(id)}>{label}</Chip>)}
      </div>}
      {group === "design" && page === "review" && <ReviewTab />}
      {group === "design" && page === "interior" && <InteriorTab />}
      {group === "design" && page === "elevations" && <ElevationsTab />}
      {group === "design" && page === "materials" && <MaterialsTab />}
      {group === "design" && page === "history" && <HistoryTab />}
      {group === "design" && page === "pack" && <PackTab />}
    </div>
  );
}
