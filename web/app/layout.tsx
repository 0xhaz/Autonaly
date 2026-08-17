import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Autonaly — crisis briefing review",
  description:
    "Autonomous supply-chain crisis analyst. Gemini reasons, a deterministic engine computes, a human approves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Served from /vendor alongside the MapLibre bundle. Next would rather
            this went through the bundler, but MapLibre's JS deliberately does
            not — see ExposureMap — and the CSS must sit beside it. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/vendor/maplibre/maplibre-gl.css" />
      </head>
      <body>
        <header className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight">Autonaly</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                crisis briefing review
              </span>
            </Link>
            <p className="hidden text-xs sm:block" style={{ color: "var(--muted)" }}>
              Gemini reasons · the engine computes · a human approves
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer
          className="mx-auto max-w-6xl px-6 py-8 text-xs"
          style={{ color: "var(--muted)" }}
        >
          Data: BACI/CEPII (Etalab 2.0) · UN Global Platform; IMF PortWatch. Exposure
          figures use latest-year trade weights and model first-order effects only.
        </footer>
      </body>
    </html>
  );
}
