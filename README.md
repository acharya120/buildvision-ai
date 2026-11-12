# BuildVision AI

A browser-based tool for **conceptual** house design: draw a to-scale floor plan, view it in 3D, get dimensioned drawings, and see a **preliminary** quantity estimate. By default it runs entirely in the browser (projects are stored in your browser), with no account, no database and no paid API. Optionally, connect a **Neon** database to turn on registration with email verification, login, cloud-saved projects and an admin-only Settings panel: see [ACCOUNTS_SETUP.md](./ACCOUNTS_SETUP.md).

> **Important:** BuildVision AI provides conceptual design, visualization, and preliminary estimation tools. Outputs are not automatically approved architectural drawings, structural engineering designs, or construction instructions. A qualified architect and structural engineer must review and approve all relevant plans before construction. Soil conditions, foundations, reinforcement, beams, columns, slabs, staircase safety, fire safety, accessibility, setbacks, local building regulations, and other site-specific requirements must be professionally assessed.

BuildVision AI does **not** check compliance with Indian building regulations, municipal bylaws or any other local rules.

---

## Read this first: verification status

This project was written in an environment where the npm registry was blocked, so **`npm install`, `next build`, `next lint` and the real Vitest/Playwright runners were never executed** before delivery. What was verified instead:

| Check | Result |
|---|---|
| TypeScript `strict` on all logic modules (model, geometry, validation, estimate, layout, assistant, export except PDF) | Passed |
| TypeScript on UI code, against hand-written stand-in type stubs for React/Next/Three | Passed (stubs are weaker than the real types) |
| 162 unit tests (`tests/`) | Passed, run with a small stand-in for the Vitest API. The real `vitest run` has not been run |
| Dashboard, plan editor, Auto design tab (generate, apply, undo, infeasible-plot message), estimate (incl. rate presets), drawings and assistant screens, bundled with esbuild and driven in headless Chromium (place/move/resize rooms, numeric edits, undo/redo, walls, doors, zoom, floors, estimate maths, import rejection, form validation) | Passed with **no console errors**. Tailwind styling was not present in that run, so **visual layout has not been checked** |
| SVG plan, elevation and section output | Rendered and inspected visually |
| DXF file opened in a CAD program | **Not done** (only the file structure is unit-tested) |
| 3D viewer (React Three Fiber), including site trees/gates, the new stairs, door leaves, furniture and Interior mode | **Not run.** Written against the library APIs but never rendered. Only the stair and furniture geometry is unit-tested (inside the room, sensible step rise) |
| PDF export (jsPDF) | **Not run** |
| PNG export, file downloads | **Not run** in a real build |
| Structure/detail layers in 3D (columns, beams, footings) | **Not run in WebGL.** Only a render-tree smoke test (no crashes; ~9,000 meshes for a 10-floor hospital with details) and unit tests of the column/beam/grid logic |
| Accounts: register, email code, login, admin Settings, Neon sync | Unit-tested (16 tests) and driven in headless Chromium against the real API route code with an **in-memory database and a fake mailer**. **Never run against a real Neon database or real Gmail**, and the `@neondatabase/serverless` and `nodemailer` packages were not installed here |
| `npm run build`, `npm run lint`, `npm run test`, `npm run test:e2e` | **Not run** |
| Vercel deployment | **Not done** |

So the first real build happens on your machine or on Vercel. If it fails, the error text in the build log tells exactly what to fix: copy it and ask for help. See *Troubleshooting* in [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## What works

**Projects**
- Create a project: name, plot width/depth, metric or imperial, building type, floors, optional budget. Invalid, zero, negative and unreasonable values are rejected with readable messages.
- Save automatically in the browser; reopen, rename, duplicate, delete (with confirmation) from the dashboard.
- Ten labelled sample projects, each previewed on the home page with a floor switcher: 25-gaj compact home, 30 x 40 ft duplex, narrow 12 x 50 ft plot, 3-bedroom villa, triplex, 5-floor apartment block, 5-floor hotel, 3-floor school, 10-floor office tower, 10-floor hospital block. The last seven come from the Auto design generators and have no validation errors or warnings.
- JSON backup download and import. Imports are fully validated; malformed files are rejected with a list of problems.
- Reset design (with confirmation, undoable).

**2D floor-plan editor** (SVG, real coordinates in metres)
- Plot boundary, grid, scale-correct drawing, pan and zoom (wheel, buttons, Fit).
- **Add room with exact size**: choose any of the 15 room types (bedroom, balcony, study, etc.), type its name, width and depth, and either place it automatically in free space or give its position. Oversized rooms and full floors give a clear message instead of a silent change; the panel also shows how much of the plot the floor already uses.
- Add rooms from a library of 15 room types with editable default sizes; select, move (drag), resize (drag corners), rename, delete, and edit width, depth and position numerically. Length boxes accept `12`, `12'6"`, `3.5m`, `350cm`.
- Draw walls, generate walls from room edges (shared edges merge into one wall), add doors and windows on walls, add dimension lines.
- Multiple floors: add, remove, rename, set floor height, switch floors, see the floor below as a dashed outline, footprint comparison table.
- Undo / redo (also Ctrl+Z / Ctrl+Y), Delete key, Esc to return to Select.
- Room schedule always reflects the real geometry.

**Geometry checks** (never change your design, only report):
rooms outside the plot, overlapping rooms, zero/negative sizes, openings that do not fit or overlap or have lost their wall, upper-floor overhangs, staircase misalignment, multi-floor building without stairs; optional warning for rooms with no neighbour (off by default, because gaps are often intentional). Errors, warnings and information are shown separately.

**3D view** (built from the same model): orbit/pan/zoom, perspective/top/front presets, reset camera, per-floor visibility, walls (with real door and window gaps), window glass, door leaves, a visual two-flight stair in every staircase room (with an open stairwell in the floor above, so stairs are visible on all floors), optional placeholder furniture by room type, an **Interior (all floors)** mode (roof hidden, walls cut to ~60%, floors separated, furniture on) and an interior camera angle, simple flat roof slab, room labels, wall-height cut-away slider, exploded-floor slider, click a floor slab to select a room.

**Drawings and export**
- Dimensioned plan SVG with plot dimensions, room sizes/areas, door swings, scale bar, title block, date, units and disclaimer.
- Basic elevations (4 sides) and sections (any cut line).
- Room schedule and door/window schedule.
- Downloads: SVG, PNG, CSV (rooms, openings, estimate), PDF (vector A3 sheets, one per floor, plus schedules, estimate and full disclaimer), JSON backup, OBJ 3D model.

**Estimate**: quantities from the model (areas, wall length/area with opening deductions, plaster, paint, masonry volume, assumed slab concrete, door/window counts). **You enter every rate**; no prices are pre-filled. Each line shows quantity, unit, your rate, amount and the calculation basis, labelled Measured / Calculated / Assumption. Foundations, beams, columns, reinforcement and finishes are explicitly listed as *not estimated*.

**Auto design** (new tab, also available when creating a project): a deterministic, rule-based concept generator. Give it floors, bedrooms, optional garage/study/balcony/utility/dining, the street side, your own setbacks, and a room-size preference. It returns up to three layouts built from fixed rules: rooms in bands, a stair and bathroom core at the same place on every floor, a hall where several bedrooms need one, doors so that every room can be entered (checked by a reachability search), a main entrance, and windows on outside walls. Each option is previewed with the normal validator's results, and "Use this design" replaces the current design in one undoable step. If nothing fits (for example after large setbacks) it says so instead of forcing a broken layout. **It is not AI and not an architect:** it knows nothing about orientation, ventilation, structure, fire or local rules, and the stair is only a footprint allocation.

**Any plot size**: Auto design never just gives up. If your brief does not fit the plot it relaxes it step by step (drops optional rooms, adds floors up to 4, reduces bedrooms) and, for very small or narrow plots (from about 4.2 x 1.8 m of buildable area), produces a compact studio with its own bathroom and kitchen. Everything it changed is listed in plain words (also shown when you create a project from the dashboard). On huge plots the house stays a normal size and is centred, and the exported drawing is cropped around the building (the full plot size stays in the title block; the editor still shows the whole plot). Only land that is genuinely too small for any room (about 2 x 3 m or less after setbacks) gets an honest "cannot fit" message. New projects from the dashboard now generate a starting layout by default; untick the box for a blank plan.

**North direction, DXF and comparison**: set which way north points (Properties panel, degrees clockwise from the top of the plan). A north arrow appears in the editor and on exported drawings, and Auto design adds a note and ranks lower any living room, bedroom or study whose windows all face west. The Drawings tab can export a **DXF** CAD file (plot, rooms, walls, doors, windows and labels on separate layers, floors side by side, metres) for AutoCAD-style tools; it is conceptual geometry, and the DXF has not been opened in real CAD software here. Auto design shows a table comparing the generated options.

**Site surroundings (optional)**: in the Plan tab, Site section, switch on lawn, boundary wall, entrance gate, exit gate, paths/driveway and trees (none / a few / many). The entrance gate is placed on the plot edge in front of your main door (a separate vehicle entry appears if there is a garage door), the exit gate on the opposite side, with arrows and labels. Everything is derived from your plan and doors, drawn in the 2D plan, the exported SVG/PNG/PDF ground-floor sheet, and the 3D view (trees, wall, gate posts, labels). It appears automatically after Auto design and can be turned off. It only works where there is free space on the plot, and it is **not** a landscape, drainage or traffic design and ignores local gate, drive and tree rules.

**Any kind of building, much larger limits**: besides houses there are building types for farmhouse, shop, office, restaurant, hotel, school, hospital, warehouse, factory, mall, mixed-use and community hall, and room types such as office, reception, meeting room, classroom, ward, shop unit, hall, warehouse, workshop, laboratory, corridor, lift, parking and pantry. Plots up to 5,000 m per side, up to 100 floors and floor heights up to 30 m are accepted (these are sanity limits against typos, not design rules). In Auto design, the "Office, hotel, school, hospital, shop, warehouse…" mode generates corridor buildings (rooms on both sides of a corridor, stair, lift and toilets at one end, reception on the ground floor, custom floor height). Presets fill sensible starting sizes; every number is editable.

**Realism upgrades**: generated walls are thicker on the outside (default 0.23 m) than inside (0.115 m), room sizes are measured to wall centre-lines, and the validator now also warns about rooms with no door, habitable rooms with no window (only when the floor has windows at all), rooms far below the usual starting size and very long, narrow rooms. These are practical hints, **not code-compliance checks**.

**Estimate rate presets**: save the rates you typed under a name (stored in this browser) and re-apply them to other projects.

**Assistant**: a *rule-based* (not AI) assistant understanding five phrase patterns (add a room to a floor, make a room wider/deeper, change the plot size, total room area, flooring estimate). Changes are previewed with any new problems listed, then applied only on confirmation, and can be undone. A deterministic *auto-arrange* packs rooms into rows with a stated list of limitations.

### 3D look and colours
The 3D view draws a hip roof (when the top floor is close to a rectangle), white window sills, floor bands, soft shadows, a sky gradient, a boundary wall with pillars and caps, hedge and flower-bed shrubs along the wall, multi-part trees, barred gates, a pavement and a road with a dashed centre line. Five colour presets and individual colour pickers (walls, roof, windows, lawn, boundary wall, sky, road) are in the 3D tab; the choice is remembered in the browser. Shadows are switched off automatically for very large buildings (more than 120 rooms) to keep the view smooth. The geometry helpers (roof, shrubs, pillars, road, colour validation) are unit-tested; the WebGL drawing itself has not been looked at in a real browser by me.

### Branding
Owner branding ("by Natwar Acharya", the NA logo, tagline and credit) lives in `src/lib/brand.ts` and `src/components/ui/Icons.tsx` (Logo). It appears in the header, footer, browser tab title, tab icon (`src/app/icon.svg`), SVG title block and PDF footer. The safety disclaimer text is unchanged.

### Mobile and layout
- Phones and tablets (under 768 px): a fixed bottom bar switches between Plan, Auto, 3D, Cost, Export and Help. The floor-plan screen splits into Canvas, Rooms & floors and Properties & checks.
- Desktop: top tabs and the three-column plan editor.
- A "Next step" hint on the Floor plan tab points to the next sensible action.
- The home screen shows plan thumbnails of your projects. New project opens as a full-screen sheet on phones.
- Checked in a headless browser at 360, 390 and 1280 px wide: no horizontal overflow and no console errors. Not tried on real phones, Safari or iOS. Styling was previewed with Tailwind v4 locally; the real Tailwind v3 build has not been run.

## Details layer (optional): structure, furniture, stairs

Turn on **Details** in the right panel (or tick "Show extra details" when creating a project). Nothing changes when it is off. When on, the 2D plan, SVG/PNG/PDF exports and the 3D view also show:

- column grid lines with bubbles (1, 2, 3… and A, B, C…) and spacings
- columns at wall corners/junctions (plus extra ones where a wall run exceeds your "longest span")
- beams between columns and footings under the ground-floor columns
- furniture outlines and stair steps with UP/DN labels

In 3D use **Structural view (x-ray)** to hide walls, roof and furniture and see only the frame.

**This is indicative only.** Column, beam and footing sizes are placeholders you can edit; they are not calculated from loads, soil or codes and must never be used for construction. A licensed structural engineer must design the real structure. Validation results are unaffected by this layer.

### Areas, FAR and load distribution (optional)

- **Areas and FAR** (right panel, always shown, changes nothing): plot area, built-up area per floor, total built-up, FAR (total built-up / plot area), ground coverage and open area. Built-up is the union of the rooms grown by half the outside wall thickness, every floor counted in full. Local rules often exempt stairs, parking or balconies and set their own limits, so check with your authority.
- **Load distribution** (inside Details, switched off by default): slab load (self weight + finishes + live load) is shared between columns by grid area, wall weight goes to the end columns of each beam, column self weight is added, and each floor's load is carried down to the nearest column below. The panel lists the heaviest columns with the soil pressure under your footing size and the footing side that would be needed, and the plan shows a kN figure beside each column. Footings are only reported, never resized.
- The starting loads (1.5 finish, 2.0 live, 1.5 roof, 19 kN/m³ walls, 150 kN/m² soil) are **placeholders, not from any code**. Service loads only: no load factors, wind, earthquake, continuity, stairs, openings or soil investigation. It explains how load travels; it is **not a structural design** and must not be used to size or build anything. A licensed structural engineer must do that.
- Verified by unit tests (load is conserved down to the ground, bigger live load gives bigger result, JSON round trip, validation unchanged) and a headless browser run. Not viewed in a real 3D/WebGL browser; the load figures are 2D only.

### Structure and site sheets (Drawings tab)

Six extra sheets, all drawn automatically from your own values (walls, floor heights and the Details numbers; Details does not need to be switched on, defaults are used): **Column layout** (grid, column marks C1/C2/C3 by how many beams meet, column schedule), **Beam layout** (beam marks B1.. by span, beam schedule, per floor), **Foundation plan** (footings, tie beams, footing schedule with a soil-pressure check), **Structural section** (footing, plinth, columns, beams, slabs, parapet, levels and callouts), **3D frame (isometric)** and **Site plan** (plot, building, road, distances to the plot edges, area statement and FAR, north arrow). Each downloads as SVG or PNG. Very tall buildings skip middle floors in the section and isometric sheets so the file stays light, and say so on the sheet.

New Details inputs: foundation depth, footing thickness, plinth height and parapet height.

**These sheets are indicative, not a structural design.** Sizes are the numbers you typed, loads are placeholders unless you set them, and a footing marked over-limit is only reported, never resized. Reinforcement, soil investigation, wind and earthquake are not covered. A licensed structural engineer must design the real structure. Not added to the PDF export yet.

## Known limitations

- Corridor-building mode makes one simple shape (rectangular, double-loaded corridor); no fire exits, accessibility, lift sizing or occupancy rules are modelled, and very large or complex buildings (malls, hospitals, factories) need a real design team. Very tall or very large projects may be slow in the 3D view.
- Auto design (house mode) fills the buildable rectangle with banded layouts only; it cannot produce L-shapes, courtyards or orientation-aware plans, and its stair is not designed (no rise/going/headroom).
- Rooms are axis-aligned rectangles. No L-shaped or curved rooms. Walls drawn with the wall tool may be at any angle, but generated walls follow room edges.
- Plot is a rectangle (no corner or irregular plot outlines yet).
- Stairs are a room type plus a simple visual two-flight stair in 3D; rise, going, headroom and landings are not designed or checked. Furniture is generic placeholder boxes that ignore door positions. Door leaves are drawn closed.
- No roof design (flat slab only), no site levels, no materials in elevations/sections.
- Touch screens: single-finger drag works; pinch-zoom on the 2D plan is not implemented (use the +/- buttons). The 3D view uses the library's built-in touch controls.
- Without a database, projects and the room library are stored per browser; clearing browser data deletes them, so download backups. With accounts on they are also saved to Neon.
- The estimate rates are per m², m³ or piece regardless of the display unit system.
- No AI-powered editing. Accounts (optional) have no forgot-password, no change-email and no two-factor login yet.
- Dependency versions use ranges and there is no lockfile, because npm was unavailable when this was generated; the first install creates one.

## Roadmap (not implemented)

1. Run and fix the first real build/lint/test cycle; commit `package-lock.json`.
2. Pinch-zoom and touch polish on the 2D plan; keyboard nudging of selected rooms.
3. L-shaped rooms, irregular / corner plots.
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
src/server/              accounts, email codes, mail, Neon storage (server only)
src/app/api/             API routes for login, projects, admin settings
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


## Any plot area and shape (optional)

- **New project > "Enter the plot by" > Total area and shape.** Type any area in square feet, square metres, gaj / square yard, marla, kanal, cent, guntha, acre, hectare, or "Other" (you give square feet per unit). Pick a shape: rectangle, L, T, trapezoid, triangle, right triangle, corner plot, slanted, or type your own corners (one "x, y" per line, in order around the edge). The area you type is the exact area of the plot drawn. Width and depth entry still works exactly as before.
- **Layout, drawings and 3D.** The rule-based generator places the layout in the largest rectangle that fits inside the plot (a note on each option says so). The plan, site plan, structure/site sheets, DXF, PDF, SVG and 3D ground and boundary wall follow the plot outline. Gates and the road are placed where a straight line from the building meets the outline.
- **Change later.** Project settings > "Plot shape and area" replaces the plot by a shape of a new area. Rooms never move; anything outside is flagged.
- **Local limits (optional).** Project settings > "Local limits": type a maximum FAR, ground coverage % and building height from your local rules and the checks list warns when the design goes over.
- Plot sides are limited to 5 km and area to 2000 hectares.

Verification notes: unit tests (170) cover units, all shapes from 30 m2 to 20 ha, designs inside each shape, site/sheet/DXF output, limits and save/load; the browser plan, site sheet and new-project form were rendered and looked at. The 3D ground for shaped plots and a real `npm run build` were not run in this environment, so check them after deploying.


## AI mode (optional)

Admin Settings has an **AI mode** tab with a separate key box for ChatGPT, Gemini, Claude, Mistral, Groq, DeepSeek, Grok and OpenRouter. Paste a key, press Save and connect, and customers get an "AI mode" card in Auto design that suggests a floor plan from the form data. Everything the AI returns is checked and then drawn like any other design. Setup, safety rules and costs: see AI_SETUP.md. Needs the accounts/database setup. Without it nothing changes.

Verification notes: 183 unit tests (including mocked calls in each provider's request format, key secrecy, repair loop, daily limit, shaped plots) and a browser run of the admin box and the customer card against the real route code with a mocked AI service. No real ChatGPT, Gemini or Claude account was used, so the exact request/response formats and default model names are untested against the live services; if the connection test reports a problem, the message tells you what to change.


## Professional emails, system profile and user profiles

- **Emails.** Every email (verification code, test email) now uses one designed layout: coloured header with your logo, system name and tagline, a large code box, and a footer with your purpose, owner, address, website and note. A plain-text version is sent too.
- **Settings > System profile (admin only).** Set system name, tagline, purpose, owner/company, website, address, email footer note, email colour and logo. They appear on the login page, the app headers, the browser tab and in emails. Nothing saved means the old look. The construction-safety disclaimer is not editable. The logo is shown in emails when the public site address is known (read from Vercel automatically, or set APP_URL).
- **My profile (every logged-in user).** After the first login a profile window opens once (Skip is allowed); afterwards it is in the account menu. Fields: profile picture, profession, organisation, address, city, state, postal code, country, website, about. All optional, stored per user in the database.
- Pictures: PNG, JPEG or WebP only (SVG refused), shrunk in the browser (logo 256 px, profile 256 px square) and checked on the server.

Verification notes: 190 unit tests; browser run with the real route code: admin saves a logo and name, the header and tab title change, a new member receives the designed email, is offered the profile once, saves details and photo, and cannot reach admin routes. The look of the email in Gmail/Outlook was checked only as an image rendered in Chromium, and the logo-in-email path needs a deployed public address, so please send yourself a test email after deploying.

## Studio tab (optional additions)

A new **Studio** tab sits beside the existing tabs. Nothing in the existing tabs was changed, and the Studio only changes your design when you press a button that says so (every such change can be undone).

- **Design review**: rule-of-thumb checks for daylight (window area about 10% of floor), cross ventilation, bathroom ventilation, room size and proportion, stairs lining up between floors, a ground-floor entrance, bathrooms per bedroom and kitchen position. "Add a window" buttons fix the window findings. With an AI service connected, **Get AI suggestions** asks the AI for extra advice (only room names, types and sizes are sent; it counts towards the daily AI limit; it never edits the plan).
- **Interior**: furniture placed by rules (against walls, outside door swings, tall pieces away from windows, walking space kept), room-by-room tips, an interior sheet per floor (SVG/PNG) and a furniture schedule (CSV).
- **Elevations**: detailed front, rear, left and right elevations with levels, plinth, lintels, sills, parapet and overall dimensions (SVG/PNG). The front is the bottom edge of the plan.
- **Materials & cost**: bricks, cement, sand, aggregate, steel, tiles, paint, waterproofing, doors and windows. Quantities come from the plan plus editable rule-of-thumb factors (marked "assumption"). **No prices are pre-filled**; you enter your own rates, plus labour, contingency and tax percentages. CSV download. The factors are saved in an optional `materials` field of the project; projects without it work exactly as before.
- **History**: named versions of the design kept in this browser (up to 20 per project), compare with now, restore (a copy of the current design is taken first, and Undo works), and **Duplicate this project**.
- **PDF pack**: a separate A3 PDF with a cover page, the sheets you tick (elevations, interior, site, structure, materials) and the full notice. The standard PDF in the Export tab is unchanged.

No database changes or migrations are needed. Versions are stored in the browser only.

Verification for this part: 12 new unit tests (202 in total, all passing); the Studio screens were run in a real browser at desktop and phone width (no overflow, buttons clicked). **Not verified**: the real `next build`, the jsPDF drawing-pack PDF itself (jsPDF is not installed in the test setup), and AI suggestions against a real AI service. Please run `npm run build` / deploy and try those once.

## Studio > Analysis (optional, preliminary)

Open **Studio**, then **Analysis (preliminary)**. Everything here is an estimate made by rules and the numbers you type. None of it is a professionally verified calculation or an approval, and each page says so. No page changes your design.

| Page | What it does | Basis |
| --- | --- | --- |
| Regulation check | Compares your plan with limits **you** enter: setbacks (with road side), FAR, coverage, height, minimum room sizes, ceiling height, window share. "Fill example values" loads commonly cited minimums as editable examples. | Your numbers; not a building approval |
| Sun & shadow | Sun position by latitude, date and solar time; ground shadows of every room block; direct-sun hours per window and facade; heat/winter-sun notes. | Textbook solar formulas (about 1°); neighbours and trees not modelled |
| Ventilation | Wind-from direction; which openings are windward/leeward; opening area vs floor area; cross-ventilation rating per room. | Rule of thumb; not CFD |
| Vastu | Optional: rooms and entrance by compass sector using the plan's north angle. | Traditional guideline, not scientific or engineering |
| Electrical & plumbing | Lights, fans, sockets, switches, AC, exhaust, geyser points; WC, basin, shower, sink fixtures; stack and straight-run pipe lengths; connected load; water use and tank size. SVG per floor. | Rule-based placement; a licensed electrician/plumber must design it |
| Timeline | Phase-by-phase Gantt chart with dates from a start date, crew factor, weather buffer and 5/6-day week. | Rule-of-thumb productivity; replace with the contractor's programme |
| ROI | EMI, loan balance, rental yield, payback, IRR (with and without loan), NPV, yearly cash flow. | Only the numbers you type |
| Compare designs | Side by side: current design, saved versions, other local projects; areas, rooms, windows, circulation/wet/habitable shares, review and Vastu counts, cost if you entered rates; space-use hints. | Same project data |

Settings typed on these pages (latitude, wind, rules, ROI inputs, timeline) are kept in this browser per project, not in the project file. No database changes.

**Not included in this release** (they could not be tested here, or need new server tables): AR preview, realistic interior rendering, client collaboration/sharing, and full CAD editing tools. Structural layout, landscape, setback display, BOQ and the AI assistant already existed and were not duplicated.

Verification: 221 automated tests pass (22 new for this part, including solar geometry against known values, loan/IRR maths, and checks that every generated drawing is valid). All eight screens were opened in a real browser at desktop and 360 px width without overflow or errors. Not verified: the real `next build` on your machine and a phone/print check of the downloaded SVG/PNG files.

## Studio > Engineering (preliminary)

A third group inside the Studio tab. Nothing existing was changed; no database change; all settings live in your browser.

| Page | What it really calculates |
|---|---|
| Carbon | Material quantities from the estimate × editable factors; what-if cuts; operational carbon from your own kWh and grid factor |
| Energy & solar | Envelope heat gain by facade, hourly solar through glass, improved-envelope comparison, roof PV potential |
| Accessibility | Door/corridor/stair/lift/ramp checks against values you can edit |
| Fire safety | Shortest walking route from every room to an exit (doors and room centres), exits per floor, extinguisher and detector counts, evacuation drawing |
| Clashes | Geometric checks: overlapping openings, columns/beams vs openings, unsupported walls, overhangs, drains through living rooms |
| Renovation | Baseline vs current plan: demolition/new wall lengths and volumes, cost from rates you enter |
| Revisions | Revision register (A, B, C…) with snapshot per issue and change list |
| Reports | Combined HTML/CSV report and charts |

**All results are preliminary rule-based estimates, not certified.** They are not structural, fire-safety or regulatory approvals. Fire, accessibility and carbon limits and factors are YOURS to enter or confirm for your country. A licensed architect/engineer and the local authority must verify before construction.

Limits: fire load, fire-rated elements, sprinklers, smoke control and equipment/people heat gains are not modelled. The clash structural grid is the app's indicative layout.

## Studio > Site & money

A fourth group inside the Studio tab. Everything is stored in your browser (per project); there is no database change and nothing is sent or paid from here.

| Page | What it does |
|---|---|
| Procurement | Suppliers; purchase list filled from your material take-off; quotes per supplier; cheapest-quote pick; order, delivery and late tracking; committed vs delivered value; purchase-order draft CSV per supplier |
| Site inspections | Stage checklists (generic prompts), pass/fail/pending, snag list with fix-by dates and closing, pass rate, CSV log |
| Finance & payments | Budget, contracts, variations, cumulative progress claims, certificates (earned value − retention − pro-rata advance recovery), payments recorded, overpayment and over-budget warnings, forecast final cost including procurement |
| Facility register | Assets linked to rooms (suggested from your plan), warranty end, next-service dates, maintenance log, plan view with status-coloured pins, CSV |

Limits, stated plainly:
- Rates, quotes, retention and all money values are entered by you. Taxes, penalties and contract terms are not applied.
- Inspection checklists are generic; your drawings, specification and local code decide acceptance.
- The facility register is not a live digital twin: real sensors or a building management system need outside hardware and a paid/custom service.
- Photos and shared access (architect / engineer / contractor / client) need file storage and database tables, planned for Phase 4. Data is per browser until then; use "Download backup" and the CSV exports to keep copies.

## Studio > BIM & survey

A fifth group inside the Studio tab. Everything runs in your browser; files are never uploaded. No database change.

| Page | What it does |
|---|---|
| IFC / BIM | Exports IFC4 (storeys, walls, doors, windows with openings, floor slabs, room spaces, optional indicative columns/beams) with an in-app structural self-check. Limited import: rooms and walls drawn as simple extruded rectangles become a NEW project |
| Topography | Spot levels (typed or CSV) to contour map, slope bands, and cut/fill against a formation level for the building pad and the whole plot |
| Scan to plan | ASCII XYZ / CSV / ASCII PLY point cloud to rectangular rooms (auto-rotates the plan, closes door gaps); creates a NEW project |
| Structural hand-off | Indicative frame to STAAD input text and CSV; single-beam hand-check (simple, fixed, propped, cantilever) with deflection limit |

Limits, stated plainly:
- **IFC:** an independent IFC validator could not be installed where this was built. The export passes this app's own structural check (header, ids, references, attribute counts) and re-imports correctly, but it has not been opened in a third-party IFC viewer. Check it in BIMvision, FreeCAD or BlenderBIM before sharing. Import reads only simple extruded-rectangle geometry; Revit/ArchiCAD files will often import partially. Doors and windows are not imported.
- **Topography:** interpolated from your spot levels, not a survey. Automatic ground levels from a map service need an outside API and are not included. Volumes ignore topsoil, swell and excavation slopes.
- **Scan to plan:** tested on synthetic scans only (rotated, Y-up, with door gaps), not on real scanner data. Binary PLY is not supported. Phone/LiDAR capture itself is outside this app. Curved or angled walls and heavy clutter reduce accuracy.
- **Structural:** the frame is the app's indicative layout, not an engineered one. The STAAD text follows the standard command layout but was not opened in STAAD. ETABS/SAP2000: CSV with manual mapping only. The beam check is an elastic textbook hand-check, not a reinforced-concrete design. A licensed structural engineer must design the structure.

## Studio > Team & backup (Phase 4)

A sixth group inside the Studio tab. Everything here is ADDITIVE: existing tables, routes and screens are unchanged, and the app still runs without `DATABASE_URL`.

| Page | What it does | Needs |
|---|---|---|
| Sharing & roles | Owner adds people by e-mail as architect, engineer, contractor or client; members get copies, the owner or an architect publishes changes | Database + login |
| Central database | Send / get the site records (procurement, inspections, finance, facility register, revisions) to a shared copy, with a refusal if someone else saved first | Database + login |
| Backup & recovery | Download a backup file (project + settings + History); restore as a NEW project; up to 20 server backups | File backup: nothing. Server backups: database + login |
| Files | Photos, PDFs, scans, IFC up to 4 MB, checked by type and permission, never exposed by address | Vercel Blob |
| Activity | Who changed what through the sharing features (owner only) | Database + login |

**Roles** (enforced on the server; the screen only hides buttons): owner edits everything; architect edits design, revisions, inspections, facility register, files and reads procurement and finance; engineer reads the design and records inspections and files; contractor records procurement, inspections and files and reads the design; client reads design, inspections, finance and facility register. Managing members, server backups and the activity log are owner-only.

**New database tables** (created automatically, `CREATE TABLE IF NOT EXISTS`, nothing existing altered): `bvx_members`, `bvx_data`, `bvx_backups`, `bvx_files`, `bvx_audit`. The existing tables are only read, except that an architect/owner "Publish" writes the shared project into the owner's existing `bv_projects` row through the same validation as an import.

**New API**: one catch-all route, `/api/pm/...`, all behind login and the same-origin check.

**To turn on Files (Vercel Blob)**: in Vercel open your project, choose Storage, create a Blob store and connect it to the project. Vercel adds `BLOB_READ_WRITE_TOKEN`; redeploy. The `@vercel/blob` package is listed in `package.json`, so Vercel installs it on the next build.

Limits, stated plainly:
- **Not tested against live services.** The new tables, the Neon queries and Vercel Blob could not be run in the build environment. The logic is tested with an in-memory database and a fake blob store; the first real use on your site is the real test. Please try: add a member, save a section, make a server backup, upload one photo.
- No live co-editing. Members work on copies; changes are shared by Publish and by the central database buttons. Two people editing the same section at once get a "newer version" message instead of a silent overwrite.
- A shared project's design is copied by "Get a copy" and published back by an architect or the owner; other members' copies do not update by themselves.
- Uploads are limited to 4 MB per file by the hosting platform. Blob links are unguessable but public at the storage level; the app never shows them and serves files only through a permission check.
- Members are matched by the verified e-mail of their account. Anyone who controls that e-mail address gets that access.
- No automatic scheduled backups: server backups happen when you press the button.
- Contractors cannot see finance (they cannot enter their own claims); claims are entered by the owner.
