"use client";

import { AREA_UNITS, SHAPE_LABELS, parseCorners, plotFromArea, plotFromCorners, toSqm, type ShapeKey } from "@/lib/model/plotShapes";
import type { Plot } from "@/lib/model/types";
import { plotArea } from "@/lib/model/plotShapes";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BuildingType, Project, UnitSystem } from "@/lib/model/types";
import { BUILDING_TYPE_LABELS, SUGGESTED_FLOORS } from "@/lib/model/defaults";
import { LIMITS, createProject, setDetail, validateNewProject } from "@/lib/model/ops";
import { DEFAULT_DETAIL } from "@/lib/model/defaults";
import { SAMPLES } from "@/lib/model/samples";
import { parseProjectJson } from "@/lib/model/schema";
import { formatPlotArea, parseLength, unitLabel } from "@/lib/model/units";
import { newId } from "@/lib/model/ids";
import { deleteProject, duplicateProject, isPersistent, listProjects, saveProject } from "@/lib/storage/local";
import { COMMERCIAL_PRESETS, DEFAULT_COMMERCIAL_INPUT, generateCommercialOptions } from "@/lib/layout/autodesignCorridor";
import { generateCorridorWithFit, generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { applyOption, DEFAULT_AUTODESIGN_INPUT, generateOptions } from "@/lib/layout/autodesign";
import { BRAND } from "@/lib/brand";
import { planToSvg } from "@/lib/export/svg";
import { btn, btnDanger, btnPrimary, cardCls, Disclaimer, inputCls, Label } from "../ui/Field";
import AccountMenu from "../auth/AccountMenu";
import { useAuth } from "../auth/AuthGate";
import { IconCube, IconCalc, IconDownload, IconLayers, IconMagic, IconPlan, IconRuler, IconShield, IconTree, IconUpload, Logo } from "../ui/Icons";

function Thumb({ p }: { p: Project }) {
  const svg = useMemo(() => {
    try {
      return planToSvg(p, p.floors[0].id, { showTitleBlock: false, showGrid: false });
    } catch {
      return "";
    }
  }, [p]);
  return (
    <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-ink-50 p-2 [&_svg]:h-full [&_svg]:w-full" aria-hidden>
      {svg ? <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="text-xs text-ink-400">No preview</span>}
    </div>
  );
}

function SampleCard({ info, onOpen }: { info: (typeof SAMPLES)[number]; onOpen: () => void }) {
  const [floor, setFloor] = useState(0);
  const project = useMemo(() => {
    try {
      return info.build();
    } catch {
      return null;
    }
  }, [info]);
  const f = project?.floors[Math.min(floor, (project?.floors.length ?? 1) - 1)];
  const svg = useMemo(() => {
    if (!project || !f) return "";
    try {
      return planToSvg(project, f.id, { showTitleBlock: false, showGrid: false, focusBuilding: true });
    } catch {
      return "";
    }
  }, [project, f]);
  return (
    <li className={`${cardCls} flex flex-col overflow-hidden`}>
      <div className="h-56 bg-ink-50 p-2 sm:h-64" aria-label={`Layout preview of ${info.title}`} role="img">
        {svg ? <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="grid h-full place-items-center text-xs text-ink-400">Preview not available</p>}
      </div>
      {project && project.floors.length > 1 && (
        <div className="flex flex-wrap gap-1 border-t border-ink-100 px-3 py-2" role="group" aria-label="Choose floor to preview">
          {project.floors.map((fl, i) => (
            <button
              key={fl.id}
              type="button"
              onClick={() => setFloor(i)}
              aria-pressed={floor === i}
              className={`min-w-8 rounded-md px-2 py-1 text-xs font-semibold ${floor === i ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}
            >
              {i === 0 ? "G" : i}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4 pt-3">
        <h3 className="text-sm font-semibold text-ink-900">{info.title}</h3>
        {info.facts && <p className="mt-0.5 text-xs font-medium text-brand-700">{info.facts}</p>}
        {f && <p className="mt-0.5 text-xs text-ink-500">Showing {f.name}: {f.rooms.length} rooms</p>}
        <p className="mt-1 text-xs text-ink-500">{info.description}</p>
        <button className={`${btn} mt-3 self-start`} onClick={onOpen}>
          Open as new project
        </button>
      </div>
    </li>
  );
}

const FEATURES: Array<[string, string, () => ReactElement]> = [
  ["Auto design", "Give a plot size and a brief. Get several complete layouts with rooms, doors, windows, stairs and a site plan. Rule-based, not AI.", IconMagic],
  ["Floor plan editor", "Draw to scale, type exact room sizes, add walls, doors, windows and dimensions. Problems are flagged, never silently fixed.", IconPlan],
  ["3D and interior view", "Orbit or walk through a model built from the same plan, with every floor, stairs, furniture and the surroundings.", IconCube],
  ["Estimate", "Quantities come from your plan. You enter the rates, so nothing is guessed for you.", IconCalc],
  ["Site and surroundings", "Gates, paths, garden, trees and a boundary wall, each switchable, plus a north arrow.", IconTree],
  ["Drawings and export", "SVG, PNG, PDF, DXF, CSV and OBJ exports, plus a JSON backup you can re-import.", IconDownload],
];
const STEPS: Array<[string, string]> = [
  ["Enter your plot", "Width, depth, building type and floors. Any size works."],
  ["Review the layout", "Pick from generated options or edit the plan by hand."],
  ["Check and view in 3D", "Read the checks list, then walk through the model."],
  ["Estimate and export", "Add your own rates, then download drawings and a backup."],
];

export default function Dashboard() {
  const auth = useAuth();
  const contactEmail = auth.contact.email || BRAND.email;
  const contactPhone = auth.contact.phone || BRAND.phone;
  const contactPhoneShown = auth.contact.phone || BRAND.phoneDisplay;
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
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="h-10 w-10" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight text-ink-900">BuildVision AI</h1>
              <p className="truncate text-xs font-medium text-brand-700">{BRAND.credit}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className={btn} onClick={() => fileRef.current?.click()} aria-label="Import project (.json)">
              <IconUpload />
              <span className="hidden sm:inline">Import project (.json)</span>
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Import project file" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} />
            <button className={btnPrimary} onClick={() => setShowForm(true)}>
              + New project
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>

      <section className="border-b border-ink-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1.1fr_0.9fr] md:py-14">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
              <IconShield /> {auth.enabled ? "Free, projects are saved to your account" : "Free, runs in your browser, nothing is uploaded"}
            </p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-ink-900 sm:text-4xl">From plot size to plan, 3D model and estimate in minutes.</h2>
            <p className="mt-3 max-w-xl text-base text-ink-600">
              Enter any plot. BuildVision lays out rooms, doors, windows, stairs and the site, then lets you refine every detail. One model drives the plan, the 3D view, the schedules, the drawings and the estimate.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className={`${btnPrimary} !px-5 !py-2.5 !text-base`} onClick={() => setShowForm(true)}>+ New project</button>
              <a className={`${btn} !px-5 !py-2.5 !text-base`} href="#samples-sec">Try a sample</a>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {([
              ["Any plot size", "Enter your plot and start", IconRuler, () => setShowForm(true)],
              ["Up to 100 floors", "Set floors for your building", IconLayers, () => setShowForm(true)],
              ["Auto layouts", "Generate rooms automatically", IconMagic, () => setShowForm(true)],
              ["3D walkthrough", "Open a sample in 3D", IconCube, () => document.getElementById("samples-sec")?.scrollIntoView({ behavior: "smooth" })],
            ] as Array<[string, string, () => ReactElement, () => void]>).map(([t, hint, Icon, go]) => (
              <li key={t}>
                <button type="button" onClick={go} className={`${cardCls} flex w-full items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-4`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-800">{t}</span>
                    <span className="block text-xs text-ink-500">{hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {!persistent && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Your browser is blocking local storage, so projects can only be kept until you close this tab. Use <strong>Download backup</strong> inside a project to save your work.
          </div>
        )}
        {importErrors.length > 0 && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
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
          <h2 id="recent" className="mb-3 text-lg font-bold text-ink-900">
            Your projects
          </h2>
          {projects === null ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center">
              <p className="font-semibold text-ink-900">No projects yet</p>
              <p className="mt-1 text-sm text-ink-500">Create a new project, or open one of the sample projects below to explore.</p>
              <button className={`${btnPrimary} mt-4`} onClick={() => setShowForm(true)}>
                + Create your first design
              </button>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <li key={p.id} className={`${cardCls} flex flex-col gap-3 p-3 transition-shadow hover:shadow-md`}>
                  <Thumb p={p} />
                  <div className="min-w-0">
                    {renaming === p.id ? (
                      <div className="flex gap-2">
                        <input aria-label="Project name" className={inputCls} value={renameText} maxLength={LIMITS.maxNameLength} autoFocus onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitRename(p)} />
                        <button className={btnPrimary} onClick={() => commitRename(p)}>Save</button>
                      </div>
                    ) : (
                      <h3 className="truncate font-semibold text-ink-900">{p.name}</h3>
                    )}
                    <p className="mt-0.5 text-sm text-ink-600">{formatPlotArea(plotArea(p.plot))}</p>
                    <p className="text-xs text-ink-500">
                      {p.floors.length} floor{p.floors.length > 1 ? "s" : ""} · {BUILDING_TYPE_LABELS[p.buildingType]} · {p.unitSystem} · updated {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
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

        <section aria-labelledby="how">
          <h2 id="how" className="mb-3 text-lg font-bold text-ink-900">How it works</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className={`${cardCls} p-4`}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-2 text-sm font-semibold text-ink-900">{t}</h3>
                <p className="mt-1 text-sm text-ink-600">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="samples" id="samples-sec" className="scroll-mt-20">
          <h2 id="samples" className="mb-1 text-lg font-bold text-ink-900">
            Sample projects
          </h2>
          <p className="mb-3 text-sm text-ink-500">{SAMPLES.length} example layouts from 1 to 10 floors. Pick a floor under each plan to preview it, then open it to edit, view in 3D and export. They are illustrative, not architect-designed plans.</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLES.map((s) => (
              <SampleCard key={s.key} info={s} onOpen={() => createSample(s.key)} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="what">
          <h2 id="what" className="mb-3 text-lg font-bold text-ink-900">What you can do</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([t, d, Icon]) => (
              <li key={t} className={`${cardCls} p-4`}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon /></span>
                <h3 className="mt-3 text-sm font-semibold text-ink-900">{t}</h3>
                <p className="mt-1 text-sm text-ink-600">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="contact" className={`${cardCls} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <h2 id="contact" className="text-lg font-bold text-ink-900">Contact</h2>
            <p className="text-sm text-ink-600">Questions, feedback or want a custom feature? Get in touch with {BRAND.owner}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className={btn} href={`mailto:${contactEmail}`}>{contactEmail}</a>
            <a className={btnPrimary} href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}>Call {contactPhoneShown}</a>
          </div>
        </section>

        <Disclaimer compact />
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-4 text-xs text-ink-500">
          <span className="flex items-center gap-2"><Logo className="h-6 w-6" /> <strong className="text-ink-700">{BRAND.product}</strong> {BRAND.credit}</span>
          <span><a className="hover:text-brand-700" href={`mailto:${contactEmail}`}>{contactEmail}</a> · <a className="hover:text-brand-700" href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}>{contactPhoneShown}</a> · {BRAND.tagline} &copy; {new Date().getFullYear()} {BRAND.owner}</span>
        </footer>
      </main>
    </div>
  );
}

function rememberAdjustments(list: string[]) {
  try {
    if (list.length) window.sessionStorage.setItem("buildvision.notice", `Your plot was too small or narrow for the request, so it was adjusted: ${list.join(" ")}`);
  } catch {
    /* ignore */
  }
}

function NewProjectForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("My house");
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [width, setWidth] = useState("15");
  const [depth, setDepth] = useState("15");
  const [type, setType] = useState<BuildingType>("single-floor");
  const [floors, setFloors] = useState("1");
  const [budget, setBudget] = useState("");
  const [auto, setAuto] = useState(true);
  const [details, setDetails] = useState(true);
  const [beds, setBeds] = useState("2");
  const [errors, setErrors] = useState<string[]>([]);
  const [byArea, setByArea] = useState(false);
  const [area, setArea] = useState("1200");
  const [areaUnit, setAreaUnit] = useState("sqft");
  const [otherUnit, setOtherUnit] = useState("1000");
  const [shape, setShape] = useState<ShapeKey>("rectangle");
  const [aspect, setAspect] = useState("1");
  const [corners, setCorners] = useState("0, 0\n12, 0\n12, 6\n6, 6\n6, 12\n0, 12");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let w = parseLength(width, unitSystem);
    let d = parseLength(depth, unitSystem);
    const errs: string[] = [];
    let polygon: Plot["polygon"];
    if (byArea) {
      let res: { plot: Plot } | { error: string };
      if (shape === "custom") {
        const parsed = parseCorners(corners, (v) => parseLength(v, unitSystem));
        res = "error" in parsed ? parsed : plotFromCorners(parsed.points);
      } else {
        const a = Number(area.replace(/,/g, ""));
        if (!(a > 0)) res = { error: "Enter the plot area as a positive number such as 1200." };
        else res = plotFromArea(toSqm(a, areaUnit, Number(otherUnit)), shape, Number(aspect) || 1);
      }
      if ("error" in res) return setErrors([res.error]);
      w = res.plot.width;
      d = res.plot.depth;
      polygon = res.plot.polygon;
    }
    if (!byArea && w == null) errs.push("Plot width must be a positive number such as 25, 25ft or 7.5m.");
    if (!byArea && d == null) errs.push("Plot depth must be a positive number such as 40, 40ft or 12m.");
    const budgetNum = budget.trim() === "" ? null : Number(budget);
    const floorNum = Number(floors);
    if (w != null && d != null) {
      errs.push(...validateNewProject({ name, plotWidth: w, plotDepth: d, unitSystem, buildingType: type, floors: floorNum, targetBudget: budgetNum }));
    } else {
      if (!name.trim()) errs.push("Enter a project name.");
    }
    if (errs.length || w == null || d == null) return setErrors(errs);
    let p = createProject({ name, plotWidth: w, plotDepth: d, unitSystem, buildingType: type, floors: floorNum, targetBudget: budgetNum, ...(polygon ? { plotPolygon: polygon } : {}) });
    const commercial = !["single-floor", "duplex", "triplex", "bungalow", "villa", "apartment", "farmhouse", "custom"].includes(type);
    if (auto && commercial) {
      const res = generateCorridorWithFit(p.plot, { ...DEFAULT_COMMERCIAL_INPUT, ...(COMMERCIAL_PRESETS[type] ?? {}), floors: floorNum });
      if (!res.options.length) return setErrors(res.errors);
      p = applyOption(p, res.options[0]).project;
      rememberAdjustments(res.adjustments);
    } else if (auto) {
      const res = generateHouseWithFit(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, floors: floorNum, bedrooms: Number(beds) });
      if (!res.options.length) return setErrors(res.errors);
      p = applyOption(p, res.options[0]).project;
      rememberAdjustments(res.adjustments);
    }
    if (details) p = setDetail(p, DEFAULT_DETAIL);
    saveProject(p);
    onCreated(p.id);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
    <form onSubmit={submit} role="dialog" aria-modal="true" className="max-h-[100dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6" aria-label="New project">
      <h2 className="mb-3 text-lg font-bold text-ink-900">New project</h2>
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
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="np-mode">Enter the plot by</Label>
          <select id="np-mode" className={inputCls} value={byArea ? "area" : "dims"} onChange={(e) => setByArea(e.target.value === "area")}>
            <option value="dims">Width and depth</option>
            <option value="area">Total area and shape (any area, any unit)</option>
          </select>
        </div>
        {!byArea && (
          <>
            <div>
              <Label htmlFor="np-w">Plot width ({unitLabel(unitSystem)})</Label>
              <input id="np-w" className={inputCls} inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="np-d">Plot depth ({unitLabel(unitSystem)})</Label>
              <input id="np-d" className={inputCls} inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} />
            </div>
          </>
        )}
        {byArea && (
          <>
            <div>
              <Label htmlFor="np-shape">Plot shape</Label>
              <select id="np-shape" className={inputCls} value={shape} onChange={(e) => setShape(e.target.value as ShapeKey)}>
                {(Object.keys(SHAPE_LABELS) as ShapeKey[]).map((k) => <option key={k} value={k}>{SHAPE_LABELS[k]}</option>)}
              </select>
            </div>
            {shape !== "custom" && (
              <>
                <div>
                  <Label htmlFor="np-area">Total plot area</Label>
                  <input id="np-area" className={inputCls} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="np-aunit">Area unit</Label>
                  <select id="np-aunit" className={inputCls} value={areaUnit} onChange={(e) => setAreaUnit(e.target.value)}>
                    {AREA_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                  </select>
                </div>
                {areaUnit === "other" && (
                  <div>
                    <Label htmlFor="np-other">Square feet in one unit</Label>
                    <input id="np-other" className={inputCls} inputMode="decimal" value={otherUnit} onChange={(e) => setOtherUnit(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label htmlFor="np-aspect">Width : depth ratio (optional, 1 = square)</Label>
                  <input id="np-aspect" className={inputCls} inputMode="decimal" value={aspect} onChange={(e) => setAspect(e.target.value)} />
                </div>
              </>
            )}
            {shape === "custom" && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="np-corners">Corners, one per line as x, y in {unitLabel(unitSystem)} (in order around the edge)</Label>
                <textarea id="np-corners" rows={5} className={inputCls} value={corners} onChange={(e) => setCorners(e.target.value)} />
              </div>
            )}
            <p className="text-xs text-ink-500 sm:col-span-2 lg:col-span-3">The layout and 3D model are generated inside the largest rectangle that fits the plot. Corner areas outside it stay as open space.</p>
          </>
        )}
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
      <label htmlFor="np-details" className="mt-3 flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm">
        <input id="np-details" type="checkbox" className="mt-0.5" checked={details} onChange={(e) => setDetails(e.target.checked)} />
        <span>
          <span className="font-medium">Show extra details (optional)</span>
          <span className="block text-xs text-ink-500">Column grid with labels, columns, beams, footings, furniture symbols and stair steps on the plan and in 3D. An indicative layout with placeholder sizes, not a structural design. You can switch it off any time in the project settings.</span>
        </span>
      </label>
      <p className="mt-2 text-xs text-ink-500">Tip: a 25-gaj plot is about 225 sq ft, for example 15 × 15 ft.</p>
      <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-ink-100 bg-white px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:py-0">
        <button type="submit" className={btnPrimary}>Create project</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
    </div>
  );
}
