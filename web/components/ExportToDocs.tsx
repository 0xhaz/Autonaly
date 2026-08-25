"use client";

import { useEffect, useState } from "react";

/**
 * Export a desk brief to Google Docs.
 *
 * Three states, because the honest failure here is "you have not connected
 * Google yet" rather than an error: unconfigured (hidden), not connected
 * (offers the consent flow), connected (exports and links the document).
 */

export interface DocsTable {
  headers: string[];
  rows: string[][];
}

export default function ExportToDocs({
  title,
  subtitle,
  narrative,
  table,
  tableCaption,
}: {
  title: string;
  subtitle?: string;
  narrative: string;
  table?: DocsTable;
  tableCaption?: string;
}) {
  const [state, setState] = useState<"loading" | "off" | "disconnected" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/google/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body?.configured) return setState("off");
        setState(body.connected ? "ready" : "disconnected");
      })
      .catch(() => setState("off"));
  }, []);

  const exportDoc = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/export/docs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, subtitle, narrative, table, tableCaption }),
    });
    setBusy(false);
    if (response.status === 409) return setState("disconnected");
    if (!response.ok) return setError("Export failed. Try reconnecting Google.");
    setUrl((await response.json()).url);
  };

  if (state === "loading" || state === "off") return null;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-md px-4 py-2 text-sm font-semibold"
        style={{ background: "var(--ok)", color: "var(--accent-contrast)" }}
      >
        Open in Google Docs →
      </a>
    );
  }

  if (state === "disconnected") {
    return (
      <a
        href="/api/google/authorize"
        className="rounded-md px-4 py-2 text-sm font-medium"
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        title="Grants access only to documents Autonaly creates"
      >
        Connect Google Docs
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={exportDoc}
        disabled={busy}
        className="rounded-md px-4 py-2 text-sm font-medium"
        style={{ border: "1px solid var(--line)", color: "var(--text)", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Writing document…" : "Export to Google Docs"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
