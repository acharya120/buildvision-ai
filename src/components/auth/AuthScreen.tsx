"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/client/api";
import { BRAND } from "@/lib/brand";
import { btnPrimary, inputCls } from "../ui/Field";
import { Logo } from "../ui/Icons";
import type { AccountUser } from "./AuthGate";

type Mode = "login" | "register" | "verify";

function Input({ label, type = "text", value, onChange, autoComplete, hint, inputMode, maxLength }: { label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; hint?: string; inputMode?: "numeric" | "tel" | "email"; maxLength?: number }) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-700">{label}</label>
      <div className="relative">
        <input id={id} className={`${inputCls} ${isPw ? "pr-16" : ""}`} type={isPw && show ? "text" : type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} required />
        {isPw && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

export default function AuthScreen({ allowRegistration, onLoggedIn }: { allowRegistration: boolean; onLoggedIn: (u: AccountUser) => void }) {
  const [mode, setMode] = useState<Mode>(allowRegistration ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const go = (m: Mode, message = "") => {
    setMode(m);
    setError("");
    setInfo(message);
    setCode("");
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api("/api/auth/register", "POST", { name, email, phone, password });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Could not create the account.");
    setWait(60);
    go("verify", `We sent a 6 digit code to ${email.trim()}. Enter it below. It works for 10 minutes.`);
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api("/api/auth/verify", "POST", { email, code });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "That code did not work.");
    setPassword("");
    go("login", "Email verified. Now log in with your email and password.");
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api<{ user?: AccountUser; needsVerification?: boolean; email?: string }>("/api/auth/login", "POST", { email, password });
    setBusy(false);
    if (r.ok && r.data.user) return onLoggedIn(r.data.user);
    if (r.data.needsVerification) {
      setWait(60);
      return go("verify", "Your email is not verified yet. We sent a new 6 digit code to your email.");
    }
    setError(r.data.error ?? "Could not log in.");
  };

  const resend = async () => {
    setError("");
    const r = await api("/api/auth/resend", "POST", { email });
    if (!r.ok) return setError(r.data.error ?? "Could not send a new code.");
    setWait(60);
    setInfo(`A new code was sent to ${email.trim()}.`);
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-brand-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-3">
          <Logo className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-bold leading-tight text-ink-900">{BRAND.product}</h1>
            <p className="text-xs font-medium text-brand-700">{BRAND.credit}</p>
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
          {mode !== "verify" && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1 text-sm font-semibold" role="tablist">
              <button role="tab" aria-selected={mode === "login"} className={`rounded-md py-1.5 ${mode === "login" ? "bg-white text-ink-900 shadow-sm" : "text-ink-600"}`} onClick={() => go("login")}>Log in</button>
              <button role="tab" aria-selected={mode === "register"} className={`rounded-md py-1.5 ${mode === "register" ? "bg-white text-ink-900 shadow-sm" : "text-ink-600"}`} onClick={() => go("register")}>Register</button>
            </div>
          )}
          {info && <p className="mb-3 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800" role="status">{info}</p>}
          {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}

          {mode === "register" && (
            <form className="space-y-3" onSubmit={submitRegister}>
              <h2 className="text-base font-semibold text-ink-900">Create your account</h2>
              {!allowRegistration && <p className="text-sm text-amber-800">New registrations are closed right now.</p>}
              <Input label="Full name" value={name} onChange={setName} autoComplete="name" maxLength={80} />
              <Input label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
              <Input label="Phone number" type="tel" value={phone} onChange={setPhone} autoComplete="tel" inputMode="tel" hint="For example +91 98765 43210" />
              <Input label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters, with a letter and a number." />
              <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "Sending code…" : "Register and send code"}</button>
              <p className="text-center text-xs text-ink-500">We will email you a 6 digit code to confirm your address.</p>
            </form>
          )}

          {mode === "verify" && (
            <form className="space-y-3" onSubmit={submitVerify}>
              <h2 className="text-base font-semibold text-ink-900">Check your email</h2>
              <Input label="6 digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              <button className={`${btnPrimary} w-full`} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify email"}</button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" className="font-medium text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline" disabled={wait > 0} onClick={() => void resend()}>
                  {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
                </button>
                <button type="button" className="font-medium text-ink-600 hover:underline" onClick={() => go("register")}>Wrong email? Go back</button>
              </div>
              <p className="text-[11px] text-ink-500">Cannot see it? Look in your spam folder.</p>
            </form>
          )}

          {mode === "login" && (
            <form className="space-y-3" onSubmit={submitLogin}>
              <h2 className="text-base font-semibold text-ink-900">Welcome back</h2>
              <Input label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
              <Input label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
              <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
              {allowRegistration && <p className="text-center text-xs text-ink-500">First time here? <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => go("register")}>Register</button></p>}
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-ink-500">Conceptual design tool. Not an approved architectural or structural drawing.</p>
      </div>
    </main>
  );
}
