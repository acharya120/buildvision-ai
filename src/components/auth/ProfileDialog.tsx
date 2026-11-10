"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import { pictureToDataUrl } from "@/lib/client/image";
import { btn, btnPrimary, inputCls } from "../ui/Field";
import type { AccountUser } from "./AuthGate";

export interface ProfileData {
  profession: string; organisation: string; addressLine: string; city: string; state: string; postalCode: string; country: string; website: string; bio: string; photo: string; updatedAt: number;
}
export const PROFILE_EVENT = "bv-profile-changed";

function Txt({ label, value, onChange, placeholder, max = 100, type = "text", auto }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; type?: string; auto?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-700">{label}</label>
      <input id={id} className={inputCls} type={type} value={value} maxLength={max} placeholder={placeholder} autoComplete={auto} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Lets a logged-in person add their profession, address and photo. Nothing here is required. */
export default function ProfileDialog({ user, onClose, firstTime: firstTimeProp }: { user: AccountUser; onClose: () => void; firstTime?: boolean }) {
  const [savedOnce, setSavedOnce] = useState(false);
  const firstTime = firstTimeProp && !savedOnce;
  const [p, setP] = useState<ProfileData | null>(null);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ profile: ProfileData }>("/api/profile").then((r) => (r.ok ? setP(r.data.profile) : setMsg({ ok: false, text: r.data.error ?? "Could not load your profile." })));
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const set = (k: keyof ProfileData) => (v: string) => p && setP({ ...p, [k]: v });
  const shown = photo === undefined ? p?.photo ?? "" : photo;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const r = await pictureToDataUrl(file, { maxSide: 256, type: "image/jpeg", maxChars: 150_000, square: true });
    if (r.ok) {
      setPhoto(r.url);
      setMsg(null);
    } else setMsg({ ok: false, text: r.error });
  };
  const save = async () => {
    if (!p) return;
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { ...p };
    delete body.photo;
    if (photo !== undefined) body.photo = photo === "" ? null : photo;
    const r = await api<{ profile: ProfileData }>("/api/profile", "PUT", body);
    setBusy(false);
    if (r.ok) {
      setP(r.data.profile);
      setPhoto(undefined);
      window.dispatchEvent(new Event(PROFILE_EVENT));
      setSavedOnce(true);
      setMsg({ ok: true, text: "Profile saved." });
    } else setMsg({ ok: false, text: r.data.error ?? "Could not save." });
  };
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="My profile">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <h2 className="text-base font-bold text-ink-900">{firstTime ? "Welcome! Complete your profile" : "My profile"}</h2>
          <button className={btn} onClick={onClose} aria-label={firstTime ? "Skip for now" : "Close profile"}>{firstTime ? "Skip for now" : "Close"}</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {firstTime && <p className="text-sm text-ink-600">Your email is verified. Add a few more details about yourself. Everything here is optional and you can change it any time from the account menu.</p>}
          {!p && !msg && <p className="text-sm text-ink-600">Loading…</p>}
          {p && (
            <>
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {shown ? <img src={shown} alt="Your photo" className="h-20 w-20 rounded-full border border-ink-200 object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">{(user.name.trim()[0] ?? "?").toUpperCase()}</div>}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-ink-700" htmlFor="pf-photo">Profile picture (PNG, JPEG or WebP)</label>
                  <input id="pf-photo" type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
                  {shown && <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => setPhoto("")}>Remove picture</button>}
                </div>
              </div>
              <div className="rounded-md bg-ink-50 p-3 text-sm text-ink-700">
                <p><span className="font-semibold">{user.name}</span> · {user.email}{user.phone ? ` · ${user.phone}` : ""}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Txt label="Profession" value={p.profession} onChange={set("profession")} placeholder="Example: Architect, Civil engineer, Home owner" max={80} />
                <Txt label="Company / organisation" value={p.organisation} onChange={set("organisation")} max={100} auto="organization" />
              </div>
              <Txt label="Address" value={p.addressLine} onChange={set("addressLine")} max={200} auto="street-address" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Txt label="City" value={p.city} onChange={set("city")} max={80} auto="address-level2" />
                <Txt label="State / region" value={p.state} onChange={set("state")} max={80} auto="address-level1" />
                <Txt label="Postal code" value={p.postalCode} onChange={set("postalCode")} max={20} auto="postal-code" />
                <Txt label="Country" value={p.country} onChange={set("country")} max={80} auto="country-name" />
              </div>
              <Txt label="Website" value={p.website} onChange={set("website")} placeholder="https://" max={200} type="url" auto="url" />
              <div>
                <label htmlFor="pf-bio" className="mb-1 block text-xs font-semibold text-ink-700">About you (max 500 characters)</label>
                <textarea id="pf-bio" rows={3} maxLength={500} className={inputCls} value={p.bio} onChange={(e) => set("bio")(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save profile"}</button>
                {firstTime && <button className={btn} onClick={onClose}>Do this later</button>}
              </div>
            </>
          )}
          {msg && <p className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? "border-brand-100 bg-brand-50 text-brand-800" : "border-red-200 bg-red-50 text-red-800"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
