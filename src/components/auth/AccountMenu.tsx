"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { btn } from "../ui/Field";
import { useAuth } from "./AuthGate";
import AdminSettings from "./AdminSettings";
import ProfileDialog, { PROFILE_EVENT } from "./ProfileDialog";

/** Shows who is logged in, Log out, and (admins only) the Settings panel. Renders nothing when accounts are off. */
export default function AccountMenu() {
  const { enabled, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(false);
  const [first, setFirst] = useState(false);
  const [photo, setPhoto] = useState("");
  const [bare, setBare] = useState(false);
  const loadProfile = useCallback(async () => {
    const r = await api<{ profile: { photo: string }; complete: number; saved: boolean }>("/api/profile");
    if (!r.ok) return;
    setPhoto(r.data.profile.photo);
    setBare(!r.data.saved);
    return r.data.saved;
  }, []);
  const uid = user?.id;
  useEffect(() => {
    if (!enabled || !uid) return;
    void loadProfile().then((saved) => {
      if (saved === false) {
        // first visit after verification: offer the profile once, never blocking
        try {
          if (!localStorage.getItem(`bv_profile_offered_${uid}`)) {
            localStorage.setItem(`bv_profile_offered_${uid}`, "1");
            setFirst(true);
            setProfile(true);
          }
        } catch {
          /* storage blocked: the menu entry still works */
        }
      }
    });
    const again = () => void loadProfile();
    window.addEventListener(PROFILE_EVENT, again);
    return () => window.removeEventListener(PROFILE_EVENT, again);
  }, [enabled, uid, loadProfile]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!enabled || !user) return null;
  const initial = (user.name.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="relative shrink-0" ref={box}>
      <button className={`${btn} !px-2`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${user.name}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initial}</span>
        )}
        <span className="hidden max-w-[8rem] truncate lg:inline">{user.name}</span>
      </button>
      {open && (
        <>
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-ink-200 bg-white p-3 shadow-lg" role="menu">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
            <p className="mb-2 text-[11px] font-medium text-brand-700">{user.role === "admin" ? "Admin" : "Member"}</p>
            <div className="flex flex-col gap-2">
              <button className={btn} role="menuitem" onClick={() => { setOpen(false); setFirst(false); setProfile(true); }}>{bare ? "Complete my profile" : "My profile"}</button>
              {user.role === "admin" && <button className={btn} role="menuitem" onClick={() => { setOpen(false); setSettings(true); }}>Settings</button>}
              <button className={btn} role="menuitem" disabled={busy} onClick={async () => { setBusy(true); await logout(); }}>{busy ? "Logging out…" : "Log out"}</button>
            </div>
          </div>
        </>
      )}
      {profile && <ProfileDialog user={user} firstTime={first} onClose={() => { setProfile(false); setFirst(false); }} />}
      {settings && user.role === "admin" && <AdminSettings myId={user.id} onClose={() => setSettings(false)} />}
    </div>
  );
}
