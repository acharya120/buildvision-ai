"use client";

import { Logo } from "./Icons";
import { useBrand } from "@/lib/client/brand";

/** The owner's uploaded logo, or the built-in mark when none was uploaded. */
export default function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  const b = useBrand();
  // eslint-disable-next-line @next/next/no-img-element
  return b.logoUrl ? <img src={b.logoUrl} alt="" className={`${className} rounded-lg bg-white object-contain`} /> : <Logo className={className} />;
}
