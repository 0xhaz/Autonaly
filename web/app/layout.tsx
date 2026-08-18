// Core 3: SignedIn/SignedOut are replaced by <Show when="...">.
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
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
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#3987e5",
              colorBackground: "#121821",
              colorForeground: "#e6edf6",
              colorMutedForeground: "#8b9bb4",
              colorInput: "#172030",
              colorInputForeground: "#e6edf6",
              borderRadius: "8px",
            },
          }}
        >
        <header className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto flex max-w-[1700px] items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight">Autonaly</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                crisis briefing review
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/simulate" className="text-xs" style={{ color: "var(--muted)" }}>
                Simulator
              </Link>
              <p className="hidden text-xs lg:block" style={{ color: "var(--muted)" }}>
                Gemini reasons · the engine computes · a human approves
              </p>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    className="rounded-md px-3 py-1.5 text-xs font-medium"
                    style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                  >
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button
                    className="rounded-md px-3 py-1.5 text-xs font-semibold"
                    style={{ background: "var(--accent)", color: "#04121f" }}
                  >
                    Build your analyst
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <Link
                  href="/dashboard"
                  className="text-xs font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  My analyst
                </Link>
                <Link
                  href="/review"
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  Review
                </Link>
                <UserButton />
              </Show>
            </div>
          </div>
        </header>
        {/* No max-width here: the landing page is a map and wants the room.
            Text-heavy pages set their own reading measure. */}
        <main className="mx-auto max-w-[1700px] px-5 py-5">{children}</main>
        <footer
          className="mx-auto max-w-[1700px] px-5 py-6 text-xs"
          style={{ color: "var(--muted)" }}
        >
          Data: BACI/CEPII (Etalab 2.0) · UN Global Platform; IMF PortWatch. Exposure
          figures use latest-year trade weights and model first-order effects only.
        </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
