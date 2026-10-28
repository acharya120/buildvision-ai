# BuildVision AI

A browser-based tool for **conceptual** house design: draw a to-scale floor plan, view it in 3D, get dimensioned drawings, and see a **preliminary** quantity estimate. It runs entirely in the browser (projects are stored in your browser), needs no account, no database and no paid API.

> **Important:** BuildVision AI provides conceptual design, visualization, and preliminary estimation tools. Outputs are not automatically approved architectural drawings, structural engineering designs, or construction instructions. A qualified architect and structural engineer must review and approve all relevant plans before construction. Soil conditions, foundations, reinforcement, beams, columns, slabs, staircase safety, fire safety, accessibility, setbacks, local building regulations, and other site-specific requirements must be professionally assessed.

BuildVision AI does **not** check compliance with Indian building regulations, municipal bylaws or any other local rules.

---

## Read this first: verification status

This project was written in an environment where the npm registry was blocked, so **`npm install`, `next build`, `next lint` and the real Vitest/Playwright runners were never executed** before delivery. What was verified instead:

| Check | Result |
|---|---|
| TypeScript `strict` on all logic modules (model, geometry, validation, estimate, layout, assistant, export except PDF) | Passed |
| TypeScript on UI code, against hand-written stand-in type stubs for React/Next/Three | Passed (stubs are weaker than the real types) |
| 63 unit tests (`tests/`) | Passed, run with a small stand-in for the Vitest API. The real `vitest run` has not been run |
| Dashboard, plan editor, estimate, drawings and assistant screens, bundled with esbuild and driven in headless Chromium (place/move/resize rooms, numeric edits, undo/redo, walls, doors, zoom, floors, estimate maths, import rejection, form validation) | Passed with **no console errors**. Tailwind styling was not present in that run, so **visual layout has not been checked** |
| SVG plan, elevation and section output | Rendered and inspected visually |
| 3D viewer (React Three Fiber) | **Not run.** Written against the library APIs but never rendered |
| PDF export (jsPDF) | **Not run** |
| PNG export, file downloads | **Not run** in a real build |
| `npm run build`, `npm run lint`, `npm run test`, `npm run test:e2e` | **Not run** |
| Vercel deployment | **Not done** |

So the first real build happens on your machine or on Vercel. If it fails, the error text in the build log tells exactly what to fix: copy it and ask for help. See *Troubleshooting* in [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## What works

**Projects**
- Create a project: name, plot width/depth, metric or imperial, building type, floors, optional budget. Invalid, zero, negative and unreasonable values are rejected with readable messages.
- Save automatically in the browser; reopen, rename, duplicate, delete (with confirmation) from the dashboard.
- Three clearly labelled sample projects (25-gaj compact home, 30 x 40 ft duplex, narrow 12 x 50 ft plot).
- JSON backup download and import. Imports are fully validated; malformed files are rejected with a list of problems.
- Reset design (with confirmation, undoable).

**2D floor-plan editor** (SVG, real coordinates in metres)
- Plot boundary, grid, scale-correct drawing, pan and zoom (wheel, buttons, Fit).
- Add rooms from a library of 15 room types with editable default sizes; select, move (drag), resize (drag corners), rename, delete, and edit width, depth and position numerically. Length boxes accept `12`, `12'6"`, `3.5m`, `350cm`.
- Draw walls, generate walls from room edges (shared edges merge into one wall), add doors and windows on walls, add dimension lines.
- Multiple floors: add, remove, rename, set floor height, switch floors, see the floor below as a dashed outline, footprint comparison table.
- Undo / redo (also Ctrl+Z / Ctrl+Y), Delete key, Esc to return to Select.
- Room schedule always reflects the real geometry.

**Geometry checks** (never change your design, only report):
rooms outside the plot, overlapping rooms, zero/negative sizes, openings that do not fit or overlap or have lost their wall, upper-floor overhangs, staircase misalignment, multi-floor building without stairs; optional warning for rooms with no neighbour (off by default, because gaps are often intentional). Errors, warnings and information are shown separately.

**3D view** (built from the same model): orbit/pan/zoom, perspective/top/front presets, reset camera, per-floor visibility, walls (with real door and window gaps), window glass, simple flat roof slab, room labels, wall-height cut-away slider, exploded-floor slider, click a floor slab to select a room.

**Drawings and export**
- Dimensioned plan SVG with plot dimensions, room sizes/areas, door swings, scale bar, title block, date, units and disclaimer.
- Basic elevations (4 sides) and sections (any cut line).
- Room schedule and door/window schedule.
- Downloads: SVG, PNG, CSV (rooms, openings, estimate), PDF (vector A3 sheets, one per floor, plus schedules, estimate and full disclaimer), JSON backup, OBJ 3D model.

**Estimate**: quantities from the model (areas, wall length/area with opening deductions, plaster, paint, masonry volume, assumed slab concrete, door/window counts). **You enter every rate**; no prices are pre-filled. Each line shows quantity, unit, your rate, amount and the calculation basis, labelled Measured / Calculated / Assumption. Foundations, beams, columns, reinforcement and finishes are explicitly listed as *not estimated*.

**Assistant**: a *rule-based* (not AI) assistant understanding five phrase patterns (add a room to a floor, make a room wider/deeper, change the plot size, total room area, flooring estimate). Changes are previewed with any new problems listed, then applied only on confirmation, and can be undone. A deterministic *auto-arrange* packs rooms into rows with a stated list of limitations.

## Known limitations

- Rooms are axis-aligned rectangles. No L-shaped or curved rooms. Walls drawn with the wall tool may be at any angle, but generated walls follow room edges.
- Plot is a rectangle (no corner or irregular plot outlines yet).
- Stairs are only a room type (a labelled rectangle); no stair geometry, headroom or flight calculation.
- No roof design (flat slab only), no site levels, no materials in elevations/sections.
- Touch screens: single-finger drag works; pinch-zoom on the 2D plan is not implemented (use the +/- buttons). The 3D view uses the library's built-in touch controls.
- Projects and the room library are stored per browser; clearing browser data deletes them, so download backups.
- The estimate rates are per m², m³ or piece regardless of the display unit system.
- No AI-powered editing and no cloud storage/login in this version (see roadmap).
- Dependency versions use ranges and there is no lockfile, because npm was unavailable when this was generated; the first install creates one.

## Roadmap (not implemented)

1. Run and fix the first real build/lint/test cycle; commit `package-lock.json`.
2. Pinch-zoom and touch polish on the 2D plan; keyboard nudging of selected rooms.
3. L-shaped rooms, irregular / corner plots, setbacks as user-entered rules.
4. Stair geometry and floor-to-floor opening cut-outs.
5. Roof types, GLB export, cutaway sections in 3D.
6. Optional server-side AI assistant (`/api/assistant`) that returns structured edits, validated with the same functions, previewed and undoable.
7. Optional cloud projects and sign-in with proper row-level access control.
8. Region-specific rule checks, only after being implemented from authoritative sources with stated limits.

## Project layout

```
src/app/                 Next.js App Router pages (dashboard, /project/[id])
src/components/          Dashboard, workspace panels, 2D editor, 3D viewer, forms
src/lib/model/           types (the canonical model), units, defaults, ops, schema (import validation), samples
src/lib/geometry/        rectangle maths, wall generation, wall/opening splitting
src/lib/validation/      geometry checks
src/lib/estimate/        quantity estimation
src/lib/layout/          deterministic auto-arrange
src/lib/assistant/       rule-based assistant
src/lib/export/          SVG, drawings, CSV, OBJ, PDF, download helpers
src/lib/storage/         browser storage (projects, room library)
src/lib/state/           undo/redo store
tests/                   Vitest unit tests    e2e/  Playwright journey
```

**One model:** the 2D editor, schedules, validation, 3D scene, drawings, estimate and every export read the same `Project` object. **Coordinates:** metres, origin at the plot's top-left, +x right, +y down the plan; 3D maps plan y to three.js z. See the header of `src/lib/model/types.ts`.

## Scripts

```
npm install        install dependencies
npm run dev        local development server (http://localhost:3000)
npm run build      production build (what Vercel runs)
npm run typecheck  TypeScript check
npm run lint       ESLint (not part of the Vercel build)
npm test           unit tests
npm run test:e2e   browser tests (run `npx playwright install chromium` once)
```

You do not need to run any of these to deploy: Vercel runs `npm install` and `npm run build` for you. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Environment variables

None are required. `.env.example` only documents optional future integrations; never commit real keys.
