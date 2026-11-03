"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import { btn, btnDanger, btnPrimary, inputCls } from "../ui/Field";

interface Overview {
  general: { allowRegistration: boolean; contactEmail: string; contactPhone: string };
  mail: { connected: boolean; host: string; port: number; user: string; fromName: string; source: "database" | "environment" | null; hasPassword: boolean };
  database: { connected: boolean; users: number; projects: number };
  env: { appSecret: boolean; adminEmail: boolean };
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "user";
  verified: boolean;
  disabled: boolean;
  createdAt: number;
  lastLogin: number;
}
type Tab = "general" | "mail" | "users" | "database";
const TABS: Array<[Tab, string]> = [["general", "General"], ["mail", "Email"], ["users", "Users"], ["database", "Database"]];

function Field({ label, value, onChange, type = "text", hint, placeholder, autoComplete }: { label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; placeholder?: string; autoComplete?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-700">{label}</label>
      <input id={id} className={inputCls} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} spellCheck={false} />
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
const Msg = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <p className={`rounded-md border px-3 py-2 text-sm ${ok ? "border-brand-100 bg-brand-50 text-brand-800" : "border-red-200 bg-red-50 text-red-800"}`} role={ok ? "status" : "alert"}>{children}</p>
);
const when = (ms: number) => (ms ? new Date(ms).toLocaleString() : "never");

/** Admin-only panel. The server checks the admin role on every call, so hiding the button is not the only protection. */
export default function AdminSettings({ onClose, myId }: { onClose: () => void; myId: string }) {
  const [tab, setTab] = useState<Tab>("general");
  const [ov, setOv] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<Overview>("/api/admin/overview");
    if (r.ok) setOv(r.data);
    else setLoadErr(r.data.error ?? "Could not load the settings.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // drawn on document.body: the page header uses backdrop-blur, which would otherwise trap a fixed panel inside the header
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Admin settings">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <h2 className="text-base font-bold text-ink-900">Admin settings</h2>
          <button className={btn} onClick={onClose} aria-label="Close settings">Close</button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-ink-200 px-3 pt-2" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-semibold ${tab === k ? "border-b-2 border-brand-600 text-brand-700" : "text-ink-600 hover:text-ink-900"}`}>{label}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loadErr && <Msg ok={false}>{loadErr}</Msg>}
          {!ov && !loadErr && <p className="text-sm text-ink-600">Loading…</p>}
          {ov && tab === "general" && <General ov={ov} reload={load} />}
          {ov && tab === "mail" && <Mail ov={ov} reload={load} />}
          {ov && tab === "users" && <Users myId={myId} />}
          {ov && tab === "database" && <Database ov={ov} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function General({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const [allow, setAllow] = useState(ov.general.allowRegistration);
  const [email, setEmail] = useState(ov.general.contactEmail);
  const [phone, setPhone] = useState(ov.general.contactPhone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setMsg(null);
    const r = await api("/api/admin/general", "PUT", { allowRegistration: allow, contactEmail: email, contactPhone: phone });
    setMsg({ ok: r.ok, text: r.ok ? "Saved." : r.data.error ?? "Could not save." });
    if (r.ok) void reload();
  };
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} /> Allow new people to register</label>
      <p className="text-xs text-ink-500">Turn this off to stop new sign-ups. People who already have an account can still log in.</p>
      <Field label="Contact email shown on the home page" value={email} onChange={setEmail} type="email" placeholder="leave empty to keep the built-in one" />
      <Field label="Contact phone shown on the home page" value={phone} onChange={setPhone} type="tel" placeholder="leave empty to keep the built-in one" />
      <button className={btnPrimary} onClick={() => void save()}>Save</button>
      {msg && <Msg ok={msg.ok}>{msg.text}</Msg>}
    </div>
  );
}

function Mail({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const m = ov.mail;
  const [host, setHost] = useState(m.host);
  const [port, setPort] = useState(String(m.port));
  const [user, setUser] = useState(m.user);
  const [fromName, setFromName] = useState(m.fromName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState("");

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    const r = await api<{ user?: string }>("/api/admin/mail", "PUT", { host, port: Number(port), user, fromName, password });
    setBusy(false);
    if (r.ok) {
      setPassword("");
      setMsg({ ok: true, text: `Connected. Emails will now be sent from ${r.data.user}.` });
      void reload();
    } else setMsg({ ok: false, text: r.data.error ?? "Could not connect." });
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    const r = await api<{ from?: string; to?: string }>("/api/admin/mail-test", "POST", { to });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: `Test email sent from ${r.data.from} to ${r.data.to}. Check that inbox.` } : { ok: false, text: r.data.error ?? "Sending failed." });
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect the mail app? New people will not be able to get verification codes until a mail app is connected again.")) return;
    await api("/api/admin/mail", "DELETE");
    setMsg({ ok: true, text: "Disconnected." });
    void reload();
  };

  return (
    <div className="space-y-3">
      <div className={`rounded-md border px-3 py-2 text-sm ${m.connected ? "border-brand-100 bg-brand-50 text-brand-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {m.connected ? (
          <>Connected. All emails (verification codes, test mails) are sent from <strong>{m.user}</strong>{m.source === "environment" ? " (set in the Vercel environment variables; saving here replaces it)" : ""}.</>
        ) : (
          <>No mail app connected. Nobody can receive a verification code until you paste a key below.</>
        )}
      </div>
      {!ov.env.appSecret && <Msg ok={false}>APP_SECRET is missing in Vercel, so a pasted key cannot be stored safely. Add it first (see the setup guide).</Msg>}
      <Field label="Send mail from (your Gmail address)" value={user} onChange={setUser} type="email" autoComplete="off" />
      <Field label={m.hasPassword ? "App password (security key). Leave empty to keep the saved one" : "App password (security key)"} value={password} onChange={setPassword} type="password" autoComplete="new-password" hint="Gmail: Google Account, Security, 2-Step Verification, App passwords. Paste the 16 characters (spaces are fine)." />
      <details className="rounded-md border border-ink-200 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-ink-700">Other mail providers and sender name</summary>
        <div className="mt-2 space-y-3">
          <Field label="Sender name" value={fromName} onChange={setFromName} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mail server" value={host} onChange={setHost} hint="Gmail: smtp.gmail.com" />
            <Field label="Port" value={port} onChange={setPort} hint="465 (recommended) or 587" />
          </div>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy} onClick={() => void connect()}>{busy ? "Checking…" : "Save and connect"}</button>
        {m.connected && m.source === "database" && <button className={btnDanger} disabled={busy} onClick={() => void disconnect()}>Disconnect</button>}
      </div>
      <p className="text-[11px] text-ink-500">The key is checked with the mail server first and is only saved if the login works. It is stored encrypted and is never shown again.</p>
      {m.connected && (
        <div className="space-y-2 border-t border-ink-200 pt-3">
          <Field label="Send a test email to" value={to} onChange={setTo} type="email" placeholder="leave empty to send to yourself" />
          <button className={btn} disabled={busy} onClick={() => void test()}>Send test email</button>
        </div>
      )}
      {msg && <Msg ok={msg.ok}>{msg.text}</Msg>}
    </div>
  );
}

function Users({ myId }: { myId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await api<{ users?: UserRow[] }>("/api/admin/users");
    if (r.ok) setUsers(r.data.users ?? []);
    else setMsg(r.data.error ?? "Could not load users.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (id: string, action: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const r = await api("/api/admin/users", "POST", { id, action });
    setMsg(r.ok ? "" : r.data.error ?? "That did not work.");
    void load();
  };
  if (!users) return <p className="text-sm text-ink-600">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-2">
      {msg && <Msg ok={false}>{msg}</Msg>}
      <p className="text-xs text-ink-500">{users.length} account(s)</p>
      <ul className="divide-y divide-ink-200 rounded-md border border-ink-200">
        {users.map((u) => (
          <li key={u.id} className="space-y-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-ink-900">{u.name}</strong>
              {u.role === "admin" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Admin</span>}
              {!u.verified && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Email not verified</span>}
              {u.disabled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">Disabled</span>}
            </div>
            <p className="break-all text-xs text-ink-600">{u.email} · {u.phone}</p>
            <p className="text-[11px] text-ink-500">Joined {when(u.createdAt)} · Last login {when(u.lastLogin)}</p>
            {u.id !== myId && (
              <div className="flex flex-wrap gap-2 pt-1">
                {u.disabled ? <button className={btn} onClick={() => void act(u.id, "enable")}>Enable</button> : <button className={btn} onClick={() => void act(u.id, "disable", `Disable ${u.name}? They will be logged out and cannot log in.`)}>Disable</button>}
                {u.role === "admin" ? <button className={btn} onClick={() => void act(u.id, "removeAdmin", `Remove admin rights from ${u.name}?`)}>Remove admin</button> : <button className={btn} onClick={() => void act(u.id, "makeAdmin", `Make ${u.name} an admin? Admins can see and change all settings and users.`)}>Make admin</button>}
                <button className={btnDanger} onClick={() => void act(u.id, "delete", `Delete ${u.name} and all their saved projects? This cannot be undone.`)}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Database({ ov }: { ov: Overview }) {
  const row = (k: string, v: string, ok?: boolean) => (
    <div className="flex justify-between gap-3 border-b border-ink-100 py-1.5 text-sm"><span>{k}</span><span className={`font-semibold ${ok === false ? "text-red-700" : ok ? "text-brand-700" : "text-ink-900"}`}>{v}</span></div>
  );
  return (
    <div className="space-y-3">
      <div>
        {row("Neon database", ov.database.connected ? "Connected" : "Not connected", ov.database.connected)}
        {row("Registered users", String(ov.database.users))}
        {row("Saved projects", String(ov.database.projects))}
        {row("APP_SECRET (encrypts the mail key)", ov.env.appSecret ? "Set" : "Missing", ov.env.appSecret)}
        {row("ADMIN_EMAIL (who becomes admin)", ov.env.adminEmail ? "Set" : "Not set: first account is admin", ov.env.adminEmail)}
      </div>
      <p className="text-xs text-ink-500">Tables are created automatically the first time the site talks to the database. The connection string (DATABASE_URL) is set in Vercel and is never shown here. Saved: accounts, projects, room library, rate presets and these settings.</p>
    </div>
  );
}
