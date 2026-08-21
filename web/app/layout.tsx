// Core 3: SignedIn/SignedOut are replaced by <Show when="...">.
import {
  Show,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import Providers from "@/components/Providers";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Autonaly — crisis briefing review",
  description:
    "Autonomous supply-chain crisis analyst. Gemini reasons, a deterministic engine computes, a human approves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the beforeInteractive script stamps data-theme
    // before hydration, so the attribute legitimately differs from the server
    // render.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Served from /vendor alongside the MapLibre bundle. Next would rather
            this went through the bundler, but MapLibre's JS deliberately does
            not — see ExposureMap — and the CSS must sit beside it. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/vendor/maplibre/maplibre-gl.css" />
      </head>
      <body>
        {/* Stamp the stored theme before hydration so light users never flash
            dark; Providers re-syncs as a safety net on loads that skip this. */}
        <Script id="autonaly-theme-init" strategy="beforeInteractive">
          {'try{if(localStorage.getItem("autonaly-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}'}
        </Script>
        <Providers>
        {/* Navigation lives in the sidebar, which belongs to the session:
            signed-out visitors get the atlas edge to edge and find their way
            through the footer links. */}
        <div className="flex min-h-screen">
          <Show when="signed-in">
            <Sidebar />
          </Show>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-b" style={{ borderColor: "var(--line)" }}>
              <div className="mx-auto flex w-full max-w-[1700px] items-center justify-between px-5 py-3">
                <Link href="/" className="flex items-baseline gap-3">
                  <span className="text-lg font-semibold tracking-tight">Autonaly</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    crisis briefing review
                  </span>
                </Link>
                <div className="flex items-center gap-4">
                  <ThemeToggle />
                  <Show when="signed-out">
                    <SignInButton mode="modal">
                      <button
                        className="rounded-md px-3 py-1.5 text-xs font-semibold"
                        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                      >
                        Sign in
                      </button>
                    </SignInButton>
                  </Show>
                  <Show when="signed-in">
                    <Link
                      href="/dashboard"
                      className="text-xs font-medium"
                      style={{ color: "var(--accent)" }}
                    >
                      My analyst
                    </Link>
                    <UserButton />
                  </Show>
                </div>
              </div>
            </header>
            {/* No max-width here: the landing page is a map and wants the room.
                Text-heavy pages set their own reading measure. */}
            <main className="mx-auto w-full max-w-[1700px] flex-1 px-5 py-5">{children}</main>
            <footer
              className="mx-auto w-full max-w-[1700px] px-5 py-6 text-xs"
              style={{ color: "var(--muted)" }}
            >
              Data: BACI/CEPII (Etalab 2.0) · UN Global Platform; IMF PortWatch. Exposure
              figures use latest-year trade weights and model first-order effects only ·{" "}
              <Link href="/simulate" style={{ color: "var(--accent)" }}>
                simulator
              </Link>{" "}
              ·{" "}
              <Link href="/about" style={{ color: "var(--accent)" }}>
                about
              </Link>{" "}
              ·{" "}
              <Link href="/methodology" style={{ color: "var(--accent)" }}>
                methodology
              </Link>
            </footer>
          </div>
        </div>
        </Providers>
      </body>
    </html>
  );
}
