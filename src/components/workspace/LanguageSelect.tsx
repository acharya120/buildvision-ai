"use client";

import { LANGS, isLang } from "@/lib/i18n/labels";
import { useLabelLang } from "@/lib/i18n/useLabelLang";

/** Chooses the language of the names shown on the plan, in 3D and in the detailed sheet. Kept on this device only. */
export default function LanguageSelect({ id = "label-lang", compact = false }: { id?: string; compact?: boolean }) {
  const [lang, setLang] = useLabelLang();
  return (
    <label className="flex items-center gap-1 text-xs text-ink-700" htmlFor={id}>
      {!compact && <span className="font-medium">Label language</span>}
      <select id={id} className="rounded border border-ink-300 bg-white px-1.5 py-1 text-xs" value={lang} aria-label="Label language" onChange={(e) => { const v = e.target.value; if (isLang(v)) setLang(v); }}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}{l.code !== "en" ? ` (${l.english})` : ""}</option>)}
      </select>
    </label>
  );
}
