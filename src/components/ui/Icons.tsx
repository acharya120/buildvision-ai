import type { ReactNode } from "react";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const I = (children: ReactNode) => <svg {...base}>{children}</svg>;

export const IconPlan = () => I(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h9M12 3v9M12 17h9M17 12v9" /></>);
export const IconMagic = () => I(<><path d="M5 19 19 5" /><path d="m14 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1zM5 5l.7 1.3L7 7l-1.3.7L5 9l-.7-1.3L3 7l1.3-.7z" /></>);
export const IconCube = () => I(<><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>);
export const IconCalc = () => I(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0" /></>);
export const IconDownload = () => I(<><path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 19h16" /></>);
export const IconChat = () => I(<><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></>);
export const IconCheck = () => I(<path d="m5 12 4.5 4.5L19 7" />);
export const IconHome = () => I(<><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>);
export const IconPlus = () => I(<path d="M12 5v14M5 12h14" />);
export const IconUpload = () => I(<><path d="M12 16V5m0 0-4 4m4-4 4 4" /><path d="M4 19h16" /></>);
export const IconLayers = () => I(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>);
export const IconRuler = () => I(<><rect x="2" y="8" width="20" height="8" rx="1.5" /><path d="M6 8v3M10 8v4M14 8v3M18 8v4" /></>);
export const IconTree = () => I(<><circle cx="12" cy="9" r="5.5" /><path d="M12 14.5V21" /></>);
export const IconShield = () => I(<><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>);

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span aria-hidden className={`relative grid place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ${className}`}>
      <svg viewBox="0 0 40 40" className="h-full w-full" fill="none">
        <path d="M6 18 20 6l14 12" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="20" y="31" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="15" fontWeight="800" fill="#fff" letterSpacing="-0.5">NA</text>
      </svg>
    </span>
  );
}
