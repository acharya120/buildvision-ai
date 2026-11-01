import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `BuildVision AI ${BRAND.credit} - house design, 3D visualization and estimation`,
  authors: [{ name: BRAND.owner }],
  creator: BRAND.owner,
  description:
    "Create conceptual house plans, view them in 3D and get a preliminary quantity estimate. Works in your browser, no account needed.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#178263",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
