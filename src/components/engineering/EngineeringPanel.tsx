"use client";

import { useState } from "react";
import { Chip } from "../studio/shared";
import { CarbonPage, EnergyPage, AccessibilityPage, FirePage, ClashPage } from "./PagesE1";
import { RenovationPage, RevisionsPage, ReportsPage } from "./PagesE2";

const PAGES = [["carbon", "Carbon"], ["energy", "Energy & solar"], ["access", "Accessibility"], ["fire", "Fire safety"], ["clash", "Clashes"], ["reno", "Renovation"], ["rev", "Revisions"], ["report", "Reports"]] as const;
type Page = (typeof PAGES)[number][0];

/** Preliminary engineering tools. Results are rule-based estimates, never certified calculations. */
export default function EngineeringPanel() {
  const [page, setPage] = useState<Page>("carbon");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Engineering sections" className="flex gap-1.5 overflow-x-auto pb-1">
        {PAGES.map(([id, label]) => <Chip key={id} active={page === id} onClick={() => setPage(id)}>{label}</Chip>)}
      </div>
      {page === "carbon" && <CarbonPage />}
      {page === "energy" && <EnergyPage />}
      {page === "access" && <AccessibilityPage />}
      {page === "fire" && <FirePage />}
      {page === "clash" && <ClashPage />}
      {page === "reno" && <RenovationPage />}
      {page === "rev" && <RevisionsPage />}
      {page === "report" && <ReportsPage />}
    </div>
  );
}
