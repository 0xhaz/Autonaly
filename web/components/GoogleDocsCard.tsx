"use client";

import { useEffect, useState } from "react";

/**
 * Manage the Google Docs connection.
 *
 * Hidden entirely when OAuth is not configured for the deployment, so a fork
 * without credentials shows no dead button.
 */
export default function GoogleDocsCard() {
  const [state, setState] = useState<"loading" | "off" | "disconnected" | "ready">("loading");
  // Read from the URL during initialisation rather than in an effect: the
  // callback's ?docs= value is known before first paint.
  const [flash, setFlash] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const status = new URLSearchParams(window.location.search).get("docs");
    if (!status) return null;
    if (status === "connected") return "Google Docs connected.";
    if (status === "denied") return "Connection cancelled.";
    return "Connection failed — try again.";
  });

  useEffect(() => {
    fetch("/api/google/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body?.configured) return setState("off");
        setState(body.connected ? "ready" : "disconnected");
      })
      .catch(() => setState("off"));
  }, []);

  const disconnect = async () => {
    await fetch("/api/google/status", { method: "DELETE" });
    setState("disconnected");
    setFlash("Disconnected.");
  };

  if (state === "loading" || state === "off") return null;

  return (
    <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Google Docs</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {state === "ready"
            ? "Desk briefs export as formatted documents — headings, an exposure table, and the provenance footer."
            : "Connect once to export desk briefs straight into your Drive."}{" "}
          Autonaly can only touch documents it creates.
          {flash && <span style={{ color: "var(--ok)" }}> {flash}</span>}
        </p>
      </div>
      {state === "ready" ? (
        <button
          type="button"
          onClick={disconnect}
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          Disconnect
        </button>
      ) : (
        <a
          href="/api/google/authorize"
          className="rounded-md px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          Connect Google Docs
        </a>
      )}
    </section>
  );
}
