"use client";

import { useCallback, useEffect, useState } from "react";

/** Small per-project setting kept in this browser (not in the project file). Falls back to memory when storage is blocked. */
export function useStored<T>(projectId: string, name: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const key = `bv_an_${projectId}_${name}`;
  const [val, setVal] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setVal(typeof initial === "object" && initial !== null && !Array.isArray(initial) ? { ...initial, ...parsed } : parsed);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setVal((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key],
  );
  return [val, set];
}

/** Non-hook read of a setting saved by useStored (for reports). */
export function readStored<T>(projectId: string, name: string, initial: T): T {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(`bv_an_${projectId}_${name}`) : null;
    if (!raw) return initial;
    const v = JSON.parse(raw);
    return typeof initial === "object" && initial !== null && !Array.isArray(initial) ? { ...initial, ...v } : v;
  } catch {
    return initial;
  }
}
