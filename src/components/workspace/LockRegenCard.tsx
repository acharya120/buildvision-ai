"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { planToSvg } from "@/lib/export/svg";
import { applyRegen, regenerateUnlocked, type RegenResult } from "@/lib/layout/engine/regen";
import { validateProject } from "@/lib/validation/validate";
import { btn, btnPrimary } from "../ui/Field";

/**
 * OPTIONAL "Lock and regenerate": rooms you lock (tick "Locked" in the room panel) stay exactly where they are;
 * the other rooms of the ACTIVE floor are rearranged in the remaining space. Applying it is one undo step.
 */
export default function LockRegenCard({ onApplied }: { onApplied: () => void }) {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const floor = project.floors.find((f) => f.id === activeFloorId) ?? project.floors[0];
  const [res, setRes] = useState<RegenResult | null>(null);
  const locked = floor.rooms.filter((r) => r.locked).length;

  const previews = useMemo(() => {
    if (!res) return [];
    return res.options.map((o) => {
      const a = applyRegen(project, floor.id, o);
      const issues = validateProject(a.project);
      return { o, p: a.project, failed: a.failed, errors: issues.filter((i) => i.severity === "error").length };
    });
  }, [res, project, floor.id]);

  const run = () => setRes(regenerateUnlocked(project, floor.id, { northAngle: project.northAngle ?? 0 }));
  const use = (i: number) => {
    if (!window.confirm(`This rearranges the unlocked rooms of "${floor.name}" and regenerates that floor's walls, doors and windows. Locked rooms stay as they are. You can undo it with Ctrl+Z. Continue?`)) return;
    const pv = previews[i];
    ws.commit(applyRegen(ws.getState().project, floor.id, pv.o).project);
    ws.notify(pv.failed.length ? `Arrangement applied, but ${pv.failed.length} opening(s) could not be placed.` : "Arrangement applied. Undo restores the previous floor.");
    onApplied();
  };

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="lr-h">
      <h2 id="lr-h" className="text-base font-semibold">Lock and regenerate (optional)</h2>
      <p className="mt-1 text-sm text-ink-600">
        Tick <strong>Locked</strong> on the rooms you like (select a room, then the right panel). Then rearrange only the other rooms of the floor you are viewing ({floor.name}).
        Locked rooms never move. The floor&apos;s walls, doors and windows are re-planned. The result is a preliminary concept.
      </p>
      <p className="mt-2 text-sm" data-testid="lr-count">{locked} locked room(s) on {floor.name}; {floor.rooms.length - locked} will be rearranged.</p>
      <div className="mt-2"><button className={btnPrimary} onClick={run} disabled={floor.rooms.length === 0}>Rearrange unlocked rooms</button></div>
      {res && res.errors.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-red-700" role="alert">{res.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {previews.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {previews.map((pv, i) => (
            <div key={pv.o.id} className="rounded border border-ink-200 p-2">
              <div className="text-sm font-semibold">{pv.o.label}</div>
              <div className="text-xs text-ink-600">{pv.o.summary}</div>
              <div className="my-2 overflow-hidden rounded border border-ink-100 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: planToSvg(pv.p, floor.id, { showTitleBlock: false }) }} />
              <ul className="mb-2 list-disc pl-4 text-xs text-ink-600">{pv.o.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>
              <div className="text-xs">{pv.errors === 0 ? "No validation errors." : `${pv.errors} validation error(s).`}</div>
              <button className={`${btn} mt-2`} onClick={() => use(i)}>Use this arrangement</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
