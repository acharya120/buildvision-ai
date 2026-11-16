"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { planSheetSvg } from "@/lib/export/sheet";
import { downloadBlob, downloadText, safeFileName, svgToPngBlob } from "@/lib/export/download";
import { useLabelLang } from "@/lib/i18n/useLabelLang";
import { btn, btnPrimary } from "../ui/Field";
import LanguageSelect from "./LanguageSelect";

/**
 * Optional detailed sheet: every floor on one picture with big names in your language, width and depth arrows inside each
 * room, areas, stair UP / DOWN. Download as SVG or PNG, or print / save as PDF from the browser (which draws all scripts
 * correctly). Preliminary concept, not an approved drawing.
 */
export default function DetailedSheetCard() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [lang] = useLabelLang();
  const [style, setStyle] = useState<"bright" | "classic">("bright");
  const [detailed, setDetailed] = useState(true);
  const [furniture, setFurniture] = useState(false);
  const [show, setShow] = useState(false);
  const hasRooms = project.floors.some((f) => f.rooms.length > 0);
  const svg = useMemo(() => (show && hasRooms ? planSheetSvg(project, { lang, style, detailed, furniture }) : ""), [show, hasRooms, project, lang, style, detailed, furniture]);
  const base = safeFileName(`${project.name}-all-floors-${lang}`);
  const build = () => planSheetSvg(project, { lang, style, detailed, furniture });

  const png = async () => {
    try { downloadBlob(await svgToPngBlob(build(), 2), `${base}.png`); }
    catch { ws.notify("Could not make the PNG in this browser. Download the SVG instead."); }
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { ws.notify("The browser blocked the new window. Allow pop-ups for this site, then try again."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${base}</title><style>@page{size:A3 landscape;margin:8mm}body{margin:0}svg{width:100%;height:auto}</style></head><body>${build()}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="ds-h">
      <h2 id="ds-h" className="mb-1 font-semibold">Detailed sheet: all floors, in your language</h2>
      <p className="mb-2 text-sm text-ink-600">
        Every floor on one sheet with large room names, the width and depth of each room drawn inside it, areas, and stair UP / DOWN. Choose the language of the names; numbers and units stay the same, and room names you typed yourself are not changed.
        The translations are common everyday terms; please have a native speaker check them before the drawing is used officially. The disclaimer and scale text stay in English.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <LanguageSelect id="sheet-lang" />
        <label className="flex items-center gap-1 text-xs">Look
          <select className="rounded border border-ink-300 bg-white px-1.5 py-1 text-xs" value={style} onChange={(e) => setStyle(e.target.value === "classic" ? "classic" : "bright")}>
            <option value="bright">Bright (yellow walls, blue names)</option>
            <option value="classic">Classic (dark walls)</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} /> Dimensions inside every room</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={furniture} onChange={(e) => setFurniture(e.target.checked)} /> Furniture symbols</label>
      </div>
      {!hasRooms && <p className="mt-2 text-sm text-ink-600">Add rooms (or use Auto design) to see the sheet.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={!hasRooms} onClick={() => setShow((v) => !v)}>{show ? "Hide preview" : "Preview sheet"}</button>
        <button className={btn} disabled={!hasRooms} onClick={() => downloadText(build(), `${base}.svg`, "image/svg+xml")}>Download SVG</button>
        <button className={btn} disabled={!hasRooms} onClick={png}>Download PNG</button>
        <button className={btn} disabled={!hasRooms} onClick={print}>Print / save as PDF</button>
      </div>
      {svg && <div className="mt-3 max-h-[70vh] overflow-auto rounded border border-ink-200 bg-white [&_svg]:h-auto [&_svg]:max-w-none" data-testid="sheet-preview" dangerouslySetInnerHTML={{ __html: svg }} />}
    </section>
  );
}
