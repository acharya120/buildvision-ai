"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DATA_SECTIONS, MATRIX, MEMBER_ROLES, ROLE_LABELS, SECTIONS, SECTION_LABELS, can, type DataSection, type MemberRole } from "@/lib/pm/roles";
import { buildBundle, collectLocal, parseBundle, restorePlan, writeLocal, MAX_BUNDLE_CHARS, type ParsedBundle } from "@/lib/pm/bundle";
import { knownVersion, pmApi, readLocalSection, setKnownVersion, shrinkImage, writeLocalSection } from "@/lib/pm/client";
import { parseProject } from "@/lib/model/schema";
import { newId } from "@/lib/model/ids";
import { saveProject } from "@/lib/storage/local";
import { downloadText, safeFileName } from "@/lib/export/download";
import { btn, btnDanger, btnPrimary, inputCls } from "../ui/Field";
import { Card } from "../studio/shared";
import { Pill } from "../analysis/common";
import { Sel, Txt } from "../sitemgmt/ui";
import { NeedsAccount, Note, useTeam } from "./common";

const when = (t: number) => (t ? new Date(t).toLocaleString() : "never");
const ROLE_NOTE: Record<MemberRole, string> = { architect: "edits the design, inspections and facility register; reads procurement and finance", engineer: "reads the design; records inspections; uploads files", contractor: "records procurement and inspections; reads the design; no finance", client: "read-only: design, inspections, finance, facility register" };

export function SharingPage() {
  const { status, shared, access, project, refresh } = useTeam();
  const [members, setMembers] = useState<Array<{ email: string; role: string; createdAt: number }>>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("client");
  const [msg, setMsg] = useState("");
  const owner = access?.role === "owner";
  const load = useCallback(async () => {
    if (!owner) return;
    const r = await pmApi<{ members: typeof members }>("GET", `members?project=${encodeURIComponent(project.id)}`);
    if (r.ok) setMembers(r.data.members); else setMsg(r.status === 404 ? "This project is not in your account yet. It is saved to your account automatically a moment after you edit it; make a small change and try again." : r.error);
  }, [owner, project.id]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    setMsg("");
    const r = await pmApi("POST", "members", { projectId: project.id, email, role });
    if (r.ok) { setEmail(""); await load(); } else setMsg(r.error);
  };
  const remove = async (e: string) => { if (!window.confirm(`Remove ${e}? They lose access at once.`)) return; const r = await pmApi("DELETE", `members?project=${encodeURIComponent(project.id)}&email=${encodeURIComponent(e)}`); if (r.ok) await load(); else setMsg(r.error); };
  const copy = async (s: (typeof shared)[number]) => {
    const r = await pmApi<{ data: string }>("GET", `project?owner=${encodeURIComponent(s.ownerId)}&project=${encodeURIComponent(s.projectId)}`);
    if (!r.ok) { setMsg(r.error); return; }
    let p; try { p = parseProject(JSON.parse(r.data.data)); } catch { setMsg("The shared project could not be read."); return; }
    if (!p.ok) { setMsg("The shared project is not valid: " + p.errors[0]); return; }
    if (!window.confirm("Save this as a copy in your browser? If you already have an earlier copy, it is replaced.")) return;
    saveProject(p.project); setMsg(`Saved "${p.project.name}" to this browser. Open it from your projects list.`);
  };
  const publish = async () => {
    if (!access) return;
    if (!window.confirm("Replace the shared project with your current version? Others will get it the next time they fetch a copy.")) return;
    const r = await pmApi("PUT", "project", { ownerId: access!.ownerId, projectId: project.id, project });
    setMsg(r.ok ? "Published to the shared project." : r.error);
  };
  return (
    <div className="space-y-4">
      <NeedsAccount status={status}>
        <Card title="Share this project">
          <Note>People you add can open this project with the permissions of their role. They must have an account with the same, verified e-mail. There is no live co-editing: members get copies, and the owner or an architect publishes changes.</Note>
          {access?.shared && <p className="mt-2 text-sm">This project was shared with you as <Pill tone="info">{ROLE_LABELS[access.role]}</Pill>. Only the owner can manage members.</p>}
          {owner && (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                <Txt label="E-mail of the person" value={email} onChange={setEmail} max={200} />
                <Sel label="Role" value={role} options={MEMBER_ROLES.map((r): [MemberRole, string] => [r, ROLE_LABELS[r]])} onChange={setRole} />
                <button className={`${btnPrimary} self-end`} onClick={() => void add()} disabled={!email.trim()}>Add</button>
              </div>
              <p className="mt-1 text-xs text-ink-600">{ROLE_LABELS[role]}: {ROLE_NOTE[role]}.</p>
              <ul className="mt-3 divide-y divide-ink-100 text-sm">
                {members.length === 0 && <li className="py-2 text-ink-600">Nobody yet.</li>}
                {members.map((m) => <li key={m.email} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{m.email} <Pill tone="info">{ROLE_LABELS[m.role as MemberRole] ?? m.role}</Pill></span><button className={btnDanger} onClick={() => void remove(m.email)}>Remove</button></li>)}
              </ul>
            </>
          )}
          {access && can(access.role, "design", "w") && access.shared && <div className="mt-3"><button className={btn} onClick={() => void publish()}>Publish my version to the shared project</button></div>}
          {msg && <p role="status" className="mt-2 text-sm text-ink-700">{msg}</p>}
        </Card>
        <Card title="Shared with me" right={<button className={btn} onClick={refresh}>Refresh</button>}>
          {shared.length === 0 ? <p className="text-sm text-ink-600">Nothing has been shared with you.</p> : (
            <ul className="divide-y divide-ink-100 text-sm">{shared.map((s) => <li key={s.ownerId + s.projectId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{s.name}</strong> <Pill tone="info">{ROLE_LABELS[s.role as MemberRole] ?? s.role}</Pill></span><button className={btn} onClick={() => void copy(s)}>Get a copy</button></li>)}</ul>
          )}
        </Card>
        <Card title="Who can do what">
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Section</th>{(["owner", ...MEMBER_ROLES] as const).map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead><tbody>{SECTIONS.map((s) => <tr key={s} className="border-t border-ink-100"><td className="py-1">{SECTION_LABELS[s]}</td>{(["owner", ...MEMBER_ROLES] as const).map((r) => <td key={r}>{MATRIX[r][s] === "rw" ? "edit" : MATRIX[r][s] === "r" ? "view" : "–"}</td>)}</tr>)}</tbody></table></div>
          <p className="mt-2 text-xs text-ink-600">Managing members, server backups and the activity log are for the owner only. The server enforces these rules; the buttons you see are only a convenience.</p>
        </Card>
      </NeedsAccount>
    </div>
  );
}

export function SyncPage() {
  const { status, access, project } = useTeam();
  const [info, setInfo] = useState<Record<string, { version: number; updatedAt: number; updatedBy: string; allowed: boolean }>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const load = useCallback(async () => {
    if (!access) return;
    const out: typeof info = {};
    for (const s of DATA_SECTIONS) {
      const r = await pmApi<{ version: number; updatedAt: number; updatedBy: string }>("GET", `data?owner=${encodeURIComponent(access.ownerId)}&project=${encodeURIComponent(project.id)}&section=${s}`);
      out[s] = r.ok ? { ...r.data, allowed: true } : { version: 0, updatedAt: 0, updatedBy: "", allowed: false };
    }
    setInfo(out);
  }, [access, project.id]);
  useEffect(() => { void load(); }, [load, tick]);
  const push = async (s: DataSection, overwrite = false) => {
    if (!access) return;
    const local = readLocalSection(project.id, s);
    if (!local) { setMsg(`There is no ${SECTION_LABELS[s]} data in this browser to send.`); return; }
    setBusy(s); setMsg("");
    let expected = knownVersion(project.id, s);
    if (overwrite) { const cur = await pmApi<{ version: number }>("GET", `data?owner=${encodeURIComponent(access.ownerId)}&project=${encodeURIComponent(project.id)}&section=${s}`); if (cur.ok) expected = cur.data.version; }
    const r = await pmApi<{ version: number }>("PUT", "data", { ownerId: access.ownerId, projectId: project.id, section: s, value: local, expectedVersion: expected });
    if (r.ok) { setKnownVersion(project.id, s, r.data.version); setMsg(`${SECTION_LABELS[s]} sent (version ${r.data.version}).`); }
    else if (r.status === 409) setMsg(`${SECTION_LABELS[s]}: someone saved a newer version (v${r.conflict?.current}). Get it first, or choose "Overwrite cloud" if yours should win.`);
    else setMsg(r.error);
    setBusy(""); setTick((t) => t + 1);
  };
  const pull = async (s: DataSection) => {
    if (!access) return;
    if (readLocalSection(project.id, s) && !window.confirm(`Replace the ${SECTION_LABELS[s]} data in this browser with the cloud version?`)) return;
    setBusy(s); setMsg("");
    const r = await pmApi<{ value: string | null; version: number }>("GET", `data?owner=${encodeURIComponent(access.ownerId)}&project=${encodeURIComponent(project.id)}&section=${s}`);
    if (!r.ok) setMsg(r.error);
    else if (r.data.value == null) setMsg(`There is nothing in the cloud for ${SECTION_LABELS[s]} yet.`);
    else if (!writeLocalSection(project.id, s, r.data.value)) setMsg("The browser refused to store it (storage full or blocked).");
    else { setKnownVersion(project.id, s, r.data.version); setMsg(`${SECTION_LABELS[s]} loaded. Open its page again to see it.`); }
    setBusy("");
  };
  return (
    <NeedsAccount status={status}>
      <Card title="Central project database" right={<button className={btn} onClick={() => setTick((t) => t + 1)}>Refresh</button>}>
        <Note>Your site records (procurement, inspections, finance, facility register, revisions) live in this browser. Here you send them to the shared database or load the shared copy. Nothing syncs by itself, and a save is refused if someone else saved first, so no one overwrites another person silently.</Note>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Section</th><th>In the cloud</th><th>Last saved by</th><th /></tr></thead><tbody>
          {DATA_SECTIONS.map((s) => { const i = info[s]; const w = access ? can(access.role, s, "w") : false; return (
            <tr key={s} className="border-t border-ink-100 align-top">
              <td className="py-1.5">{SECTION_LABELS[s]}</td>
              <td>{!i ? "…" : !i.allowed ? <span className="text-ink-500">no access</span> : i.version ? `version ${i.version}` : "empty"}</td>
              <td className="text-xs">{i?.updatedBy ? `${i.updatedBy}, ${when(i.updatedAt)}` : ""}</td>
              <td><div className="flex flex-wrap gap-1.5">
                <button className={btn} disabled={!i?.allowed || busy === s} onClick={() => void pull(s)}>Get from cloud</button>
                <button className={btn} disabled={!w || busy === s} onClick={() => void push(s)}>Send mine</button>
                <button className={btn} disabled={!w || busy === s} onClick={() => { if (window.confirm("Replace the cloud version with yours, discarding what others saved?")) void push(s, true); }}>Overwrite cloud</button>
              </div></td>
            </tr>); })}
        </tbody></table></div>
        {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
      </Card>
    </NeedsAccount>
  );
}

interface Meta { id: string; label: string; createdAt: number; size: number }
export function BackupPage() {
  const { status, access, project } = useTeam();
  const [list, setList] = useState<Meta[]>([]);
  const [msg, setMsg] = useState("");
  const [parsed, setParsed] = useState<Extract<ParsedBundle, { ok: true }> | null>(null);
  const [created, setCreated] = useState("");
  const owner = access?.role === "owner";
  const load = useCallback(async () => {
    if (!owner) return;
    const r = await pmApi<{ backups: Meta[] }>("GET", `backups?project=${encodeURIComponent(project.id)}`);
    if (r.ok) setList(r.data.backups);
  }, [owner, project.id]);
  useEffect(() => { void load(); }, [load]);
  const bundleText = () => { const l = collectLocal(project.id); return JSON.stringify(buildBundle(project, l.stored, l.history)); };
  const toFile = () => { downloadText(bundleText(), `${safeFileName(project.name)}-backup.json`, "application/json"); setMsg("Backup file downloaded. Keep it somewhere safe, outside this browser."); };
  const toServer = async () => {
    const text = bundleText();
    if (text.length > MAX_BUNDLE_CHARS) { setMsg("This project is too large for server storage (3.5 MB). Use the backup file instead."); return; }
    const r = await pmApi("POST", "backups", { projectId: project.id, label: "", bundle: text });
    setMsg(r.ok ? "Backup saved on the server." : r.status === 404 ? "This project is not in your account yet. It saves automatically a moment after you edit it; try again shortly." : r.error);
    await load();
  };
  const read = async (text: string) => {
    setCreated(""); const p = parseBundle(text);
    if (!p.ok) { setParsed(null); setMsg(p.error); return; }
    setMsg(""); setParsed(p);
  };
  const fromServer = async (id: string) => { const r = await pmApi<{ data: string }>("GET", `backup?id=${encodeURIComponent(id)}`); if (r.ok) await read(r.data.data); else setMsg(r.error); };
  const restore = () => {
    if (!parsed) return;
    const id = newId("proj");
    const plan = restorePlan(parsed.bundle, parsed.project, id);
    saveProject(plan.project);
    const ok = writeLocal(id, plan.stored, plan.history);
    setCreated(id);
    setMsg(ok ? "Restored as a new project. Your existing projects were not changed." : "Restored the plan, but the browser would not store all the extra settings (storage full).");
  };
  return (
    <div className="space-y-4">
      <Card title="Backup file (works without an account)">
        <Note>The file holds this project plus its settings, records and History, so you can recover from a lost browser, a mistake or a move to another computer. Restoring always creates a NEW project; it never overwrites an existing one.</Note>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button className={btnPrimary} onClick={toFile}>Download backup file</button>
          <label className="text-sm">Restore from a backup file<input type="file" accept=".json,application/json" className={inputCls} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await read(await f.text()); }} /></label>
        </div>
      </Card>
      {parsed && (
        <Card title="Ready to restore">
          <p className="text-sm"><strong>{parsed.project.name}</strong>: {parsed.project.floors.length} floor(s), {parsed.project.floors.reduce((s, f) => s + f.rooms.length, 0)} room(s), {Object.keys(parsed.bundle.stored).length} saved setting(s){parsed.bundle.history ? `, ${JSON.parse(parsed.bundle.history).length} History snapshot(s)` : ""}. Backed up {parsed.bundle.createdAt ? new Date(parsed.bundle.createdAt).toLocaleString() : "(date unknown)"}.</p>
          <div className="mt-2 flex gap-2"><button className={btnPrimary} onClick={restore}>Restore as a new project</button><button className={btn} onClick={() => setParsed(null)}>Cancel</button></div>
          {created && <p role="status" className="mt-2 text-sm">Done. <a className="font-medium text-brand-700 underline" href={`/project/${created}`}>Open the restored project</a>.</p>}
        </Card>
      )}
      <NeedsAccount status={status}>
        {owner ? (
          <Card title="Server backups" right={<button className={btnPrimary} onClick={() => void toServer()}>Back up now</button>}>
            <p className="mb-2 text-xs text-ink-600">The newest 20 are kept. Only you can see them.</p>
            {list.length === 0 ? <p className="text-sm text-ink-600">No server backups yet.</p> : (
              <ul className="divide-y divide-ink-100 text-sm">{list.map((b) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{b.label} <span className="text-xs text-ink-500">{(b.size / 1024).toFixed(0)} KB</span></span><span className="flex gap-1.5"><button className={btn} onClick={() => void fromServer(b.id)}>Review / restore</button><button className={btnDanger} onClick={async () => { if (window.confirm("Delete this server backup?")) { await pmApi("DELETE", `backup?id=${encodeURIComponent(b.id)}`); await load(); } }}>Delete</button></span></li>)}</ul>
            )}
          </Card>
        ) : <Note>Server backups are kept by the project owner.</Note>}
      </NeedsAccount>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}

interface FileMeta { id: string; name: string; mime: string; size: number; uploadedBy: string; uploadedById: string; createdAt: number }
export function FilesPage() {
  const { status, access, project } = useTeam();
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!access) return;
    const r = await pmApi<{ files: FileMeta[] }>("GET", `files?owner=${encodeURIComponent(access.ownerId)}&project=${encodeURIComponent(project.id)}`);
    if (r.ok) setFiles(r.data.files);
  }, [access, project.id]);
  useEffect(() => { void load(); }, [load]);
  const canWrite = access ? can(access.role, "files", "w") : false;
  const upload = async (f: File | undefined) => {
    if (!f || !access) return;
    setBusy(true); setMsg("");
    const g = await shrinkImage(f);
    try {
      const res = await fetch(`/api/pm/file?owner=${encodeURIComponent(access.ownerId)}&project=${encodeURIComponent(project.id)}&name=${encodeURIComponent(g.name)}`, { method: "POST", credentials: "same-origin", body: g });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? `${g.name} uploaded.` : d.error ?? "Upload failed.");
    } catch { setMsg("Could not reach the server."); }
    setBusy(false); await load();
  };
  return (
    <NeedsAccount status={status}>
      {!status?.blob ? (
        <Note tone="warn">File storage is not set up. In Vercel, open your project, choose Storage, create a Blob store and connect it; Vercel adds BLOB_READ_WRITE_TOKEN, then redeploy. This part could not be tested by the person who built it and needs your first real upload to confirm.</Note>
      ) : (
        <Card title="Project files (photos, PDFs, scans, IFC)">
          <Note>Up to 4 MB per file (a hosting limit); big photos are shrunk in your browser first. Files are checked by type, only people with access to this project can download them, and addresses are never shown. Allowed: jpg, png, webp, pdf, csv, txt, ifc, dxf, xyz, pts.</Note>
          {canWrite && <label className="mt-3 block text-sm">Add a file<input type="file" disabled={busy} className={inputCls} accept=".jpg,.jpeg,.png,.webp,.pdf,.csv,.txt,.ifc,.dxf,.xyz,.pts" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>}
          {busy && <p role="status" className="mt-2 text-sm">Uploading…</p>}
          {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
          <ul className="mt-3 divide-y divide-ink-100 text-sm">
            {files.length === 0 && <li className="py-2 text-ink-600">No files yet.</li>}
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
                {/^image\//.test(f.mime) && <a href={`/api/pm/file?id=${f.id}`} target="_blank" rel="noreferrer"><img src={`/api/pm/file?id=${f.id}`} alt={f.name} className="h-12 w-12 rounded object-cover" /></a>}
                <span className="min-w-0 flex-1"><a className="font-medium text-brand-700 underline" href={`/api/pm/file?id=${f.id}`} target="_blank" rel="noreferrer">{f.name}</a><br /><span className="text-xs text-ink-600">{(f.size / 1024).toFixed(0)} KB · {f.uploadedBy} · {when(f.createdAt)}</span></span>
                {canWrite && (access?.role === "owner" || f.uploadedById === status?.userId) && <button className={btnDanger} onClick={async () => { if (window.confirm(`Delete ${f.name}?`)) { await pmApi("DELETE", `file?id=${encodeURIComponent(f.id)}`); await load(); } }}>Delete</button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </NeedsAccount>
  );
}

export function ActivityPage() {
  const { status, access, project } = useTeam();
  const [rows, setRows] = useState<Array<{ at: number; actor: string; action: string; detail: string }>>([]);
  const [err, setErr] = useState("");
  const owner = access?.role === "owner";
  useEffect(() => { if (!owner) return; void pmApi<{ entries: typeof rows }>("GET", `activity?project=${encodeURIComponent(project.id)}`).then((r) => { if (r.ok) setRows(r.data.entries); else setErr(r.error); }); }, [owner, project.id]);
  const text = useMemo(() => rows.map((r) => `${when(r.at)}\t${r.actor}\t${r.action}\t${r.detail}`).join("\n"), [rows]);
  return (
    <NeedsAccount status={status}>
      {!owner ? <Note>The activity log is visible to the project owner.</Note> : (
        <Card title="Activity log" right={rows.length ? <button className={btn} onClick={() => downloadText(text, `${safeFileName(project.name)}-activity.txt`, "text/plain")}>Download</button> : undefined}>
          <p className="mb-2 text-xs text-ink-600">Shows changes made through the sharing features: members, saves to the shared database, published designs, backups and files. The newest 100 are shown.</p>
          {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
          {rows.length === 0 ? <p className="text-sm text-ink-600">Nothing recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-ink-100"><td className="py-1 pr-2 text-xs text-ink-600">{when(r.at)}</td><td className="pr-2">{r.actor}</td><td className="pr-2 font-medium">{r.action}</td><td>{r.detail}</td></tr>)}</tbody></table></div>}
        </Card>
      )}
    </NeedsAccount>
  );
}
