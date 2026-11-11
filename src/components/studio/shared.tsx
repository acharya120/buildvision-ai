"use client";

import type { ReactNode } from "react";
import { downloadBlob, downloadText, safeFileName, svgToPngBlob } from "@/lib/export/download";
import { btn } from "../ui/Field";
import { useWorkspace } from "@/lib/state/store";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function SvgView({ svg, label }: { svg: string; label: string }) {
  return <div role="img" aria-label={label} className="overflow-auto rounded-lg border border-ink-200 bg-white [&>svg]:h-auto [&>svg]:min-w-[640px] [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Download buttons for one SVG sheet. */
export function SvgDownloads({ svg, base }: { svg: string; base: string }) {
  const ws = useWorkspace();
  const name = safeFileName(ws.state.project.name);
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} onClick={() => downloadText(svg, `${name}-${base}.svg`, "image/svg+xml")}>Download SVG</button>
      <button
        className={btn}
        onClick={() => {
          svgToPngBlob(svg, 2).then((b) => downloadBlob(b, `${name}-${base}.png`)).catch(() => ws.notify("Could not make the PNG in this browser. Use the SVG instead.", "error"));
        }}
      >
        Download PNG
      </button>
    </div>
  );
}

export const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} aria-pressed={active} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
    {children}
  </button>
);
