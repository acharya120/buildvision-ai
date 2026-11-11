"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { applyWindowFix, reviewProject, reviewSummary, type ReviewFinding } from "@/lib/review/review";
import type { AiReview } from "@/lib/ai/review";
import { addSnapshot } from "@/lib/history/history";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnPrimary } from "../ui/Field";
import { Card } from "./shared";

const LEVEL = { attention: ["Needs attention", "bg-red-100 text-red-800"], advice: ["Advice", "bg-amber-100 text-amber-900"], good: ["All clear", "bg-green-100 text-green-800"] } as const;
const PRIO = { high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-900", low: "bg-blue-100 text-blue-800" } as const;

export default function ReviewTab() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const findings = useMemo(() => reviewProject(project), [project]);
  const sum = reviewSummary(findings);
  const [ai, setAi] = useState<{ enabled: boolean; providers: Array<{ id: string; label: string }>; defaultProvider: string } | null>(null);
  const [why, setWhy] = useState("Checking whether an AI service is connected…");
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<(AiReview & { provider: string; model: string }) | null>(null);

  useEffect(() => {
    let live = true;
    void api<{ enabled: boolean; providers: Array<{ id: string; label: string }>; defaultProvider: string }>("/api/ai/status").then((r) => {
      if (!live) return;
      if (r.ok && r.data.enabled) {
        setAi(r.data);
        setProvider(r.data.defaultProvider);
      } else if (r.ok) setWhy("No AI service is connected yet. The owner can connect one in Settings > AI mode. The built-in checks above work without it.");
      else if (r.status === 401) setWhy("Log in to ask the AI for more suggestions. The built-in checks above work without it.");
      else setWhy(r.data.error ?? "AI is not available right now. The built-in checks above still work.");
    });
    return () => {
      live = false;
    };
  }, []);

  const fixOne = (f: ReviewFinding) => {
    if (!f.fix) return;
    const r = applyWindowFix(project, f.fix.floorId, f.fix.roomId);
    if ("error" in r) return ws.notify(r.error, "error");
    addSnapshot(project, "Before review fix", f.message.slice(0, 120), true);
    ws.commit(r.project);
    ws.notify("Window added. Use Undo if you do not want it.");
  };

  const askAi = async () => {
    setBusy(true);
    setErr("");
    const r = await api<AiReview & { provider: string; model: string }>("/api/ai/review", "POST", { project, provider, findings: findings.filter((f) => f.level !== "good").map((f) => f.message) });
    setBusy(false);
    if (r.ok) setRes(r.data);
    else setErr(r.data.error ?? "The AI request failed.");
  };

  return (
    <div className="space-y-4">
      <Card title="Design review" right={<span className="text-xs text-ink-600">{sum.attention} need attention · {sum.advice} advice</span>}>
        <p className="mb-3 text-xs text-ink-600">Rule-of-thumb checks on daylight, ventilation, room size, stairs, entrance and bathrooms. They only point things out: nothing changes until you press a fix button, and every fix can be undone.</p>
        {findings.length === 0 && <p className="text-sm text-ink-600">Add some rooms to the plan to get a review.</p>}
        <ul className="space-y-2">
          {findings.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-ink-100 p-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL[f.level][1]}`}>{LEVEL[f.level][0]}</span>
                <span className="text-[11px] font-medium text-ink-500">{f.rule}</span>
                <p className="mt-1 text-ink-800">{f.message}</p>
              </div>
              <div className="flex gap-2">
                {f.floorId && f.roomId && <button className={btn} onClick={() => { ws.setActiveFloor(f.floorId!); ws.select({ kind: "room", id: f.roomId! }); ws.notify("Room selected. Open the Plan tab to see it."); }}>Select</button>}
                {f.fix && <button className={btnPrimary} onClick={() => fixOne(f)}>{f.fix.label}</button>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Ask the AI for more suggestions">
        {!ai ? (
          <p className="text-sm text-ink-600">{why}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-600">Sends only the room names, types and sizes of this plan (no personal data) to the AI service you choose. Counts toward your daily AI limit.</p>
            <div className="flex flex-wrap items-center gap-2">
              {ai.providers.length > 1 && (
                <select aria-label="AI service" value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm">
                  {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              )}
              <button className={btnPrimary} disabled={busy || !project.floors.some((f) => f.rooms.length)} onClick={() => void askAi()}>{busy ? "Asking the AI…" : "Get AI suggestions"}</button>
            </div>
            {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
            {res && (
              <div className="mt-3 space-y-2">
                {res.summary && <p className="text-sm text-ink-800">{res.summary}</p>}
                <ul className="space-y-2">
                  {res.suggestions.map((s, i) => (
                    <li key={i} className="rounded-lg border border-ink-100 p-2.5 text-sm">
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRIO[s.priority]}`}>{s.priority}</span>
                      <strong>{s.title}</strong>
                      <p className="mt-1 text-ink-700">{s.detail}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-500">Suggested by {res.provider} ({res.model}). Advice only; it has not changed your plan. Check it with a qualified architect.</p>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
