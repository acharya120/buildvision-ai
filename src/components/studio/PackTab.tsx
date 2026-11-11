"use client";

import { useState } from "react";
import { DEFAULT_PACK, buildSheetPackPdf, type PackOptions } from "@/lib/studio/pdfPack";
import { downloadBlob, safeFileName } from "@/lib/export/download";
import { useWorkspace } from "@/lib/state/store";
import { btnPrimary } from "../ui/Field";
import { Card } from "./shared";

const ITEMS: Array<[keyof PackOptions, string]> = [["elevations", "Front, rear, left and right elevations"], ["interior", "Interior layout for each floor"], ["site", "Site plan and setbacks"], ["structure", "Structure sheets (columns, footings, section)"], ["materials", "Material estimate and cost"]];

export default function PackTab() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [opt, setOpt] = useState<PackOptions>(DEFAULT_PACK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const none = !Object.values(opt).some(Boolean);
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      downloadBlob(await buildSheetPackPdf(project, opt), `${safeFileName(project.name)}-drawing-pack.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build the PDF in this browser.");
    }
    setBusy(false);
  };
  return (
    <Card title="Detailed drawing pack (PDF)">
      <p className="mb-3 text-xs text-ink-600">An A3 PDF with a cover page, the sheets you tick, and the full notice. The standard plan PDF in the Export tab is unchanged; this pack adds the detailed sheets to it.</p>
      <ul className="mb-3 space-y-1.5">
        {ITEMS.map(([k, label]) => (
          <li key={k}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} /> {label}</label></li>
        ))}
      </ul>
      <button className={btnPrimary} disabled={busy || none} onClick={() => void go()}>{busy ? "Building PDF…" : "Download drawing pack"}</button>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
    </Card>
  );
}
