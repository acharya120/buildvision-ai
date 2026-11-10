"use client";

import BrandLogo from "../ui/BrandLogo";
import { useBrand } from "@/lib/client/brand";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { flushCloud, startCloud, stopCloud } from "@/lib/client/cloud";
import { BRAND } from "@/lib/brand";
import { btn, btnPrimary } from "../ui/Field";
import { Logo } from "../ui/Icons";
import AuthScreen from "./AuthScreen";

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "user";
}
interface AuthValue {
  /** true when the database is connected, so accounts and cloud saving are on */
  enabled: boolean;
  user: AccountUser | null;
  /** contact details the owner set in Settings (empty = use the built-in ones) */
  contact: { email: string; phone: string };
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthValue>({ enabled: false, user: null, contact: { email: "", phone: "" }, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

interface MeResponse {
  configured: boolean;
  user: AccountUser | null;
  allowRegistration?: boolean;
  contact?: { email: string; phone: string };
  error?: string;
}

type Phase = "loading" | "off" | "out" | "syncing" | "in" | "problem";

/**
 * Wraps the whole app. If no database is connected the app works as before (no login).
 * With a database, nobody gets in without registering, verifying their email and logging in.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const brand = useBrand();
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [allowReg, setAllowReg] = useState(true);
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [problem, setProblem] = useState("");
  const [tries, setTries] = useState(0);

  const begin = useCallback(async (u: AccountUser) => {
    setUser(u);
    setPhase("syncing");
    const r = await startCloud(u.id);
    if (!r.ok) {
      setProblem(r.error ?? "Could not load your saved projects.");
      setPhase("problem");
      return;
    }
    setPhase("in");
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await api<MeResponse>("/api/auth/me");
      if (!live) return;
      if (!r.ok) {
        // the account system itself is not reachable (for example offline): keep the app usable, without accounts
        setProblem(r.data.error ?? "Could not reach the server.");
        setPhase("problem");
        return;
      }
      const d = r.data;
      if (!d.configured) return setPhase("off");
      if (d.error) {
        setProblem(d.error);
        return setPhase("problem");
      }
      setAllowReg(d.allowRegistration !== false);
      setContact(d.contact ?? { email: "", phone: "" });
      if (d.user) void begin(d.user);
      else setPhase("out");
    })();
    return () => {
      live = false;
    };
  }, [begin, tries]);

  useEffect(() => {
    if (phase !== "in") return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushCloud();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [phase]);

  const logout = useCallback(async () => {
    await stopCloud();
    await api("/api/auth/logout", "POST");
    setUser(null);
    setPhase("out");
  }, []);

  const value = useMemo<AuthValue>(() => ({ enabled: phase === "in", user: phase === "in" ? user : null, contact, logout }), [phase, user, contact, logout]);

  if (phase === "off") return <>{children}</>;
  if (phase === "in") return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  if (phase === "out") return <AuthScreen allowRegistration={allowReg} onLoggedIn={(u) => void begin(u)} />;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-ink-200 bg-white p-6 text-center shadow-sm">
        <BrandLogo className="mx-auto h-12 w-12" />
        <p className="mt-3 text-sm font-semibold text-ink-900">{brand.name}</p>
        {phase === "problem" ? (
          <>
            <p className="mt-3 text-sm text-red-700" role="alert">{problem}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button className={btnPrimary} onClick={() => { setPhase("loading"); setTries((t) => t + 1); }}>Try again</button>
              {user && <button className={btn} onClick={() => void logout()}>Log out</button>}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-600" role="status">{phase === "syncing" ? "Loading your projects…" : "Loading…"}</p>
        )}
      </div>
    </main>
  );
}
