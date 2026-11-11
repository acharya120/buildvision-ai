"use client";

import { useState } from "react";
import { Chip } from "../studio/shared";
import { ProcurementPage, QualityPage } from "./PagesProcQc";
import { FinancePage, TwinPage } from "./PagesMoneyTwin";

const PAGES = [["proc", "Procurement"], ["qc", "Site inspections"], ["fin", "Finance & payments"], ["twin", "Facility register"]] as const;
type Page = (typeof PAGES)[number][0];

/** Site and money tools. Records and calculators kept in this browser; nothing is sent or paid from here. */
export default function SitePanel() {
  const [page, setPage] = useState<Page>("proc");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Site and money sections" className="flex gap-1.5 overflow-x-auto pb-1">{PAGES.map(([id, label]) => <Chip key={id} active={page === id} onClick={() => setPage(id)}>{label}</Chip>)}</div>
      {page === "proc" && <ProcurementPage />}
      {page === "qc" && <QualityPage />}
      {page === "fin" && <FinancePage />}
      {page === "twin" && <TwinPage />}
    </div>
  );
}
