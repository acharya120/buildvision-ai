"use client";

import type { ReactNode } from "react";
import { useWorkspace } from "@/lib/state/store";
import { Chip } from "../studio/shared";

export function FloorChips({ floorId, onChange }: { floorId: string; onChange: (id: string) => void }) {
  const { project } = useWorkspace().state;
  return <div className="flex gap-1.5 overflow-x-auto">{project.floors.map((f) => <Chip key={f.id} active={f.id === floorId} onClick={() => onChange(f.id)}>{f.name}</Chip>)}</div>;
}

/** Marks results as estimates produced by rules, not verified by a professional. */
export function Prelim({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Preliminary estimate. </strong>{children}</p>;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`text-base font-bold ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

export const PILL = { good: "bg-green-100 text-green-800", warn: "bg-amber-100 text-amber-900", bad: "bg-red-100 text-red-800", info: "bg-blue-100 text-blue-800", muted: "bg-ink-100 text-ink-600" } as const;
export const Pill = ({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) => <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${PILL[tone]}`}>{children}</span>;
