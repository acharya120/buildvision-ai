"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BuildingType, Project, UnitSystem } from "@/lib/model/types";
import { BUILDING_TYPE_LABELS, SUGGESTED_FLOORS } from "@/lib/model/defaults";
import { LIMITS, createProject, validateNewProject } from "@/lib/model/ops";
import { SAMPLES } from "@/lib/model/samples";
import { parseProjectJson } from "@/lib/model/schema";
import { formatPlotArea, parseLength, unitLabel } from "@/lib/model/units";
import { newId } from "@/lib/model/ids";
import { deleteProject, duplicateProject, isPersistent, listProjects, saveProject } from "@/lib/storage/local";
import { COMMERCIAL_PRESETS, DEFAULT_COMMERCIAL_INPUT, generateCommercialOptions } from "@/lib/layout/autodesignCorridor";
import { applyOption, DEFAULT_AUTODESIGN_INPUT, generateOptions } from "@/lib/layout/autodesign";
import { btn, btnDanger, btnPrimary, Disclaimer, inputCls, Label } from "../ui/Field";

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setProjects(listProjects());
  useEffect(() => {
    refresh();
    setPersistent(isPersistent());
  }, []);

  const open = (id: string) => router.push(`/project/${id}`);

  const createSample = (key: string) => {
    const sample = SAMPLES.find((s) => s.key === key);
    if (!sample) return;
    const p = sample.build();
    saveProject(p);
    open(p.id);
  };

  const onImport = async (file: File | undefined) => {
    setImportErrors([]);
    if (!file) return;
    const text = await file.text();
    const res = parseProjectJson(text);
    if (!res.ok) {
      setImportErrors(res.errors);
      return;
    }
    const now = new Date().toISOString();
    const p: Project = { ...res.project, id: newId("proj"), updatedAt: now };
    saveProject(p);
    open(p.id);
  };

  const remove = (p: Project) => {
    if (window.confirm(`Delete "${p.name}"? This cannot be undone. Download a JSON backup first if you may need it.`)) {
      deleteProject(p.id);
      refresh();
    }
  };

  const commitRename = (p: Project) => {
    const name = renameText.trim().slice(0, LIMITS.maxNameLength);
    if (name) saveProject({ ...p, name, updatedAt: new Date().toISOString() });
    setRenaming(null);
    refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">B</div>
            <div>
              <h1 className="text-lg font-bold leading-tight">BuildVision AI</h1>
              <p className="text-xs text-ink-500">Conceptual house plans, 3D view and preliminary estimates</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => fileRef.current?.click()}>
              Import project (.json)
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Import project file" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} />
            <button className={btnPrimary} onClick={() => setShowForm(true)}>
              + New project
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {!persistent && (
          <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Your browser is blocking local storage, so projects can only be kept until you close this tab. Use <strong>Download backup</strong> inside a project to save your work.
          </div>
        )}
        {importErrors.length > 0 && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">That file could not be imported:</p>
            <ul className="mt-1 list-disc pl-5">
              {importErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {showForm && <NewProjectForm onCancel={() => setShowForm(false)} onCreated={open} />}

        <section aria-labelledby="recent">
          <h2 id="recent" className="mb-3 text-base font-semibold">
            Your projects
          </h2>
          {projects === null ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-300 bg-white p-8 text-center">
              <p className="font-medium">No projects yet</p>
              <p className="mt-1 text-sm text-ink-500">Create a new project, or open one of the sample projects below to explore.</p>
              <button className={`${btnPrimary} mt-4`} onClick={() => setShowForm(true)}>
                + Create your first design
              </button>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <li key={p.id} className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
                  {renaming === p.id ? (
                    <div className="flex gap-2">
                      <input aria-label="Project name" className={inputCls} value={renameText} maxLength={LIMITS.maxNameLength} autoFocus onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitRename(p)} />
                      <button className={btnPrimary} onClick={() => commitRename(p)}>Save</button>
                    </div>
                  ) : (
                    <h3 className="truncate font-semibold">{p.name}</h3>
                  )}
                  <p className="mt-1 text-sm text-ink-600">
                    {formatPlotArea(p.plot.width * p.plot.depth)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {p.floors.length} floor{p.floors.length > 1 ? "s" : ""} · {BUILDING_TYPE_LABELS[p.buildingType]} · {p.unitSystem} · updated {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={btnPrimary} onClick={() => open(p.id)}>Open</button>
                    <button className={btn} onClick={() => { setRenaming(p.id); setRenameText(p.name); }}>Rename</button>
                    <button className={btn} onClick={() => { duplicateProject(p.id); refresh(); }}>Duplicate</button>
                    <button className={btnDanger} onClick={() => remove(p)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="samples">
          <h2 id="samples" className="mb-1 text-base font-semibold">
            Sample projects
          </h2>
          <p className="mb-3 text-sm text-ink-500">Illustrative example layouts to explore the tools. They are not architect-designed plans.</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {SAMPLES.map((s) => (
              <li key={s.key} className="rounded-lg border border-ink-200 bg-white p-4">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <p className="mt-1 text-xs text-ink-500">{s.description}</p>
                <button className={`${btn} mt-3`} onClick={() => createSample(s.key)}>
                  Open as new project
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="what">
          <h2 id="what" className="mb-3 text-base font-semibold">What you can do</h2>
          <ul className="grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-lg border border-ink-200 bg-white p-4"><strong>Floor plan</strong><br />Draw rooms to scale, edit exact sizes, add walls, doors and windows, and see problems flagged.</li>
            <li className="rounded-lg border border-ink-200 bg-white p-4"><strong>3D view</strong><br />Orbit a model built from the same plan. Show or hide floors, walls and roof.</li>
            <li className="rounded-lg border border-ink-200 bg-white p-4"><strong>Estimate</strong><br />Quantities come from your plan. You enter the rates; nothing is guessed for you.</li>
          </ul>
        </section>

        <Disclaimer compact />
      </main>
    </div>
  );
}

function NewProjectForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("My house");
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [width, setWidth] = useState("15");
  const [depth, setDepth] = useState("15");
  const [type, setType] = useState<BuildingType>("single-floor");
  const [floors, setFloors] = useState("1");
  const [budget, setBudget] = useState("");
  const [auto, setAuto] = useState(false);
  const [beds, setBeds] = useState("2");
  const [errors, setErrors] = useState<string[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseLength(width, unitSystem);
    const d = parseLength(depth, unitSystem);
    const errs: string[] = [];
    if (w == null) errs.push("Plot width must be a positive number such as 25, 25ft or 7.5m.");
    if (d == null) errs.push("Plot depth must be a positive number such as 40, 40ft or 12m.");
    const budgetNum = budget.trim() === "" ? null : Number(budget);
    const floorNum = Number(floors);
    if (w != null && d != null) {
      errs.push(...validateNewProject({ name, plotWidth: w, plotDepth: d, unitSystem, buildingType: type, floors: floorNum, targetBudget: budgetNum }));
    } else {
      if (!name.trim()) errs.push("Enter a project name.");
    }
    if (errs.length || w == null || d == null) return setErrors(errs);
    let p = createProject({ name, plotWidth: w, plotDepth: d, unitSystem, buildingType: type, floors: floorNum, targetBudget: budgetNum });
    const commercial = !["single-floor", "duplex", "triplex", "bungalow", "villa", "apartment", "farmhouse", "custom"].includes(type);
    if (auto && commercial) {
      const res = generateCommercialOptions(p.plot, { ...DEFAULT_COMMERCIAL_INPUT, ...(COMMERCIAL_PRESETS[type] ?? {}), floors: floorNum });
      if (!res.options.length) return setErrors(res.errors);
      p = applyOption(p, res.options[0]).project;
    } else if (auto) {
      const res = generateOptions(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, floors: floorNum, bedrooms: Number(beds) });
      if (!res.options.length) return setErrors(res.errors);
      p = applyOption(p, res.options[0]).project;
    }
    saveProject(p);
    onCreated(p.id);
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-brand-500 bg-white p-4 shadow-sm" aria-label="New project">
      <h2 className="mb-3 text-base font-semibold">New project</h2>
      {errors.length > 0 && (
        <ul role="alert" className="mb-3 list-disc rounded-md border border-red-300 bg-red-50 p-3 pl-7 text-sm text-red-800">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="np-name">Project name</Label>
          <input id="np-name" className={inputCls} value={name} maxLength={LIMITS.maxNameLength} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="np-units">Units</Label>
          <select id="np-units" className={inputCls} value={unitSystem} onChange={(e) => setUnitSystem(e.target.value as UnitSystem)}>
            <option value="imperial">Imperial (feet / inches)</option>
            <option value="metric">Metric (meters)</option>
          </select>
        </div>
        <div>
          <Label htmlFor="np-type">Building type</Label>
          <select
            id="np-type"
            className={inputCls}
            value={type}
            onChange={(e) => {
              const t = e.target.value as BuildingType;
              setType(t);
              setFloors(String(SUGGESTED_FLOORS[t]));
            }}
          >
            {(Object.keys(BUILDING_TYPE_LABELS) as BuildingType[]).map((t) => (
              <option key={t} value={t}>{BUILDING_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="np-w">Plot width ({unitLabel(unitSystem)})</Label>
          <input id="np-w" className={inputCls} inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="np-d">Plot depth ({unitLabel(unitSystem)})</Label>
          <input id="np-d" className={inputCls} inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="np-floors">Number of floors (1–{LIMITS.maxFloors})</Label>
          <input id="np-floors" className={inputCls} type="number" min={1} max={LIMITS.maxFloors} value={floors} onChange={(e) => setFloors(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="np-budget">Target budget (optional)</Label>
          <input id="np-budget" className={inputCls} inputMode="decimal" value={budget} placeholder="e.g. 2500000" onChange={(e) => setBudget(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-ink-50 p-3">
        <label htmlFor="np-auto" className="flex items-center gap-2 text-sm font-medium">
          <input id="np-auto" type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Generate a starting layout automatically (rule-based, not AI)
        </label>
        {auto && (
          <span className="flex items-center gap-2 text-sm">
            <label htmlFor="np-beds">Bedrooms</label>
            <input id="np-beds" className="w-16 rounded-md border border-ink-300 px-2 py-1" type="number" min={1} max={5} value={beds} onChange={(e) => setBeds(e.target.value)} />
            <span className="text-xs text-ink-500">Rooms, walls, doors and windows are created for you to edit. More choices are in the Auto design tab.</span>
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-500">Tip: a 25-gaj plot is about 225 sq ft, for example 15 × 15 ft.</p>
      <div className="mt-4 flex gap-2">
        <button type="submit" className={btnPrimary}>Create project</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
