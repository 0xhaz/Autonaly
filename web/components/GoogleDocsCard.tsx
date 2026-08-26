"use client";

import { useEffect, useState } from "react";

/**
 * Manage the Google Docs connection.
 *
 * Hidden entirely when OAuth is not configured for the deployment, so a fork
 * without credentials shows no dead button.
 */
interface ExportedDoc {
  title: string;
  url: string;
  created_at: string;
}

export default function GoogleDocsCard() {
  const [state, setState] = useState<"loading" | "off" | "disconnected" | "ready">("loading");
  const [exports, setExports] = useState<ExportedDoc[]>([]);
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
        setExports(body.exports ?? []);
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
    <section className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      </div>

      {state === "ready" && (
        exports.length > 0 ? (
          <div className="rounded-md p-3" style={{ background: "var(--panel-2)" }}>
            <div className="mb-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Exported documents
            </div>
            <ul className="space-y-1">
              {exports.map((doc) => (
                <li key={doc.url} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    {doc.title}
                  </a>
                  <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                    {doc.created_at.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
              These also sit in your Google Drive under{" "}
              <a
                href="https://drive.google.com/drive/my-drive"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)" }}
              >
                My Drive
              </a>
              , searchable by title.
            </p>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            No exports yet. Run a scenario, ask the desk, then choose{" "}
            <span style={{ color: "var(--text)" }}>Export to Google Docs</span> —
            documents will be listed here and in your Drive.
          </p>
        )
      )}
    </section>
  );
}
