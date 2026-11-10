"use client";

import { useEffect, useState } from "react";
import { BRAND, defaultPublicBrand, type PublicBrand } from "../brand";
import { api } from "./api";

let cache: PublicBrand | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(b: PublicBrand) => void>();

function apply(b: PublicBrand) {
  cache = b;
  try {
    if (b.name !== BRAND.product) document.title = `${b.name} - ${b.tagline || "house design, 3D visualization and estimation"}`;
  } catch {
    /* no document */
  }
  listeners.forEach((l) => l(b));
}

/** Loads the owner's system profile (name, logo, ...). Falls back to the built-in values whenever it is not available. */
export function refreshBrand(): Promise<void> {
  inflight = api<{ brand?: PublicBrand }>("/api/public").then((r) => {
    const b = r.ok ? r.data.brand : undefined;
    apply(b && typeof b.name === "string" ? { ...defaultPublicBrand(), ...b } : defaultPublicBrand());
  });
  return inflight;
}

export function useBrand(): PublicBrand {
  const [b, setB] = useState<PublicBrand>(cache ?? defaultPublicBrand());
  useEffect(() => {
    listeners.add(setB);
    if (cache) setB(cache);
    else if (!inflight) void refreshBrand();
    return () => void listeners.delete(setB);
  }, []);
  return b;
}
