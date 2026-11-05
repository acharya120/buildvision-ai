"use client";

import { useState } from "react";
import { arrangeRooms, type ArrangeResult } from "@/lib/layout/arrange";
import { ASSISTANT_HELP, interpret, type Proposal } from "@/lib/assistant/rules";
import { getFloor, replaceRooms } from "@/lib/model/ops";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnPrimary, inputCls, Label } from "../ui/Field";

export default function AssistantPanel() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const floor = getFloor(project, activeFloorId) ?? project.floors[0];
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [arrange, setArrange] = useState<ArrangeResult | null>(null);

  const run = (input: string) => {
    setApplied(null);
    setProposal(interpret(input, ws.getState().project, ws.getState().activeFloorId));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <section aria-labelledby="rb-h" className="rounded-lg border border-ink-200 bg-white p-4">
        <h2 id="rb-h" className="text-lg font-semibold">Rule-based assistant</h2>
        <p className="mt-1 text-sm text-ink-600">
          This understands a small set of fixed phrases using simple pattern matching. <strong>It is not an AI model</strong> and does not connect to any AI service. Every change is previewed before it is applied, and you can undo it.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(text);
          }}
        >
          <div className="flex-1">
            <Label htmlFor="assistant-input">Your request</Label>
            <input id="assistant-input" className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Add a bedroom to the first floor" />
          </div>
          <button type="submit" className={`${btnPrimary} self-end`}>Preview</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ASSISTANT_HELP.map((h) => (
            <button key={h} className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs hover:bg-ink-100" onClick={() => { setText(h); run(h); }}>
              {h}
            </button>
          ))}
        </div>

        {proposal && (
          <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm" role="status">
            <p className="whitespace-pre-line">{proposal.message}</p>
            {proposal.warnings.length > 0 && (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-semibold">Applying this would create problems:</p>
                <ul className="list-disc pl-5">{proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            {proposal.apply && (
              <div className="mt-3 flex gap-2">
                <button
                  className={btnPrimary}
                  onClick={() => {
                    ws.commit(proposal.apply!(ws.getState().project));
                    setApplied("Applied. Use Undo in the Plan tab (or Ctrl+Z) to reverse it.");
                    setProposal(null);
                  }}
                >
                  Apply change
                </button>
                <button className={btn} onClick={() => setProposal(null)}>Discard</button>
              </div>
            )}
          </div>
        )}
        {applied && <p className="mt-3 text-sm text-green-800" role="status">{applied}</p>}
      </section>

      <section aria-labelledby="arr-h" className="rounded-lg border border-ink-200 bg-white p-4">
        <h2 id="arr-h" className="text-lg font-semibold">Auto-arrange rooms ({floor.name})</h2>
        <p className="mt-1 text-sm text-ink-600">
          Packs the existing rooms on this floor into rows from the top-left of the plot, largest first. It never resizes or rotates rooms. <strong>Limitations:</strong> it knows nothing about adjacency, light, ventilation, circulation, or staircase alignment between floors, so treat the result as a starting point.
        </p>
        <button className={`${btn} mt-3`} disabled={floor.rooms.length === 0} onClick={() => setArrange(arrangeRooms(floor.rooms, project.plot))}>
          Preview arrangement
        </button>
        {arrange && (
          <div className="mt-3 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm">
            <p>{arrange.placed.length} room(s) would be repositioned. {arrange.note}</p>
            {arrange.unplaced.length > 0 && <p className="mt-1 text-xs text-amber-900">Make the plot larger, remove a room or reduce room sizes, then try again.</p>}
            <div className="mt-3 flex gap-2">
              <button
                className={btnPrimary}
                onClick={() => {
                  ws.commit(replaceRooms(ws.getState().project, floor.id, arrange.rooms));
                  setArrange(null);
                  ws.notify("Rooms rearranged. Walls were not changed; use Generate walls in the Plan tab.");
                  ws.setTool("select");
                }}
              >
                Apply arrangement
              </button>
              <button className={btn} onClick={() => setArrange(null)}>Discard</button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-600">
        <h2 className="text-base font-semibold text-ink-900">AI-powered editing</h2>
        <p className="mt-1">Not connected in this version. The project model is fully serializable and every edit goes through validated functions, so a server-side AI endpoint can be added later without changing the editor. See the roadmap in the README.</p>
      </section>
    </div>
  );
}
