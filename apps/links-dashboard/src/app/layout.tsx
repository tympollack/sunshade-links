import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "SunShade Links · links.sunshade.icu",
  description: "Universal linking, telemetry, and trust verification engine.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="h-full bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
