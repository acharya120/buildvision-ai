"use client";

import { useCallback, useEffect, useState } from "react";
import { isLang, type LabelLang } from "./labels";

const KEY = "buildvision.labelLang";
const EVT = "buildvision-labellang";
let memory: LabelLang = "en";

function read(): LabelLang {
  try { const v = window.localStorage.getItem(KEY); if (isLang(v)) return v; } catch { /* storage may be blocked */ }
  return memory;
}

/** The drawing-label language chosen on this device (kept in this browser only; it is not saved in your project file). */
export function useLabelLang(): [LabelLang, (l: LabelLang) => void] {
  const [lang, setLang] = useState<LabelLang>("en");
  useEffect(() => {
    setLang(read());
    const on = () => setLang(read());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, []);
  const set = useCallback((l: LabelLang) => {
    memory = l;
    try { window.localStorage.setItem(KEY, l); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [lang, set];
}
