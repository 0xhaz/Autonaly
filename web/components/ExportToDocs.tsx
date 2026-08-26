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

export type DocsBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraphs"; text: string[]; italic?: boolean }
  | { kind: "table"; headers: string[]; rows: string[][] };

/** Params for the historical reference class, fetched at export time so the
 *  document carries the same rhymes the page showed. */
export interface AnalogueQuery {
  countries: string[];
  baskets: string[];
  chokepoints: string[];
}

/**
 * Does this PNG actually show anything?
 *
 * A WebGL canvas whose drawing buffer was not preserved reads back fully
 * transparent, and a transparent PNG of map dimensions still compresses to
 * ~17KB — so a size threshold passes it, and the document gets an empty box
 * where the map should be. Sampling the alpha channel is the check that
 * actually distinguishes a picture from nothing.
 */
async function hasVisiblePixels(dataUrl: string): Promise<boolean> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img?.width || !img.height) return false;
  const scratch = document.createElement("canvas");
  scratch.width = img.width;
  scratch.height = img.height;
  const ctx = scratch.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  // Every 97th pixel: dense enough to find a map, cheap enough to be free.
  for (let i = 3; i < data.length; i += 4 * 97) {
    if (data[i] > 10) return true;
  }
  return false;
}

export default function ExportToDocs({
  title,
  subtitle,
  narrative,
  table,
  tableCaption,
  facts,
  blocks,
  analogues,
}: {
  title: string;
  subtitle?: string;
  narrative: string;
  table?: DocsTable;
  tableCaption?: string;
  facts?: { label: string; value: string }[];
  blocks?: DocsBlock[];
  analogues?: AnalogueQuery;
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
    // The exposure map is on the page as a WebGL canvas; grab it so the
    // document carries the picture and not just the numbers. Best effort —
    // if the canvas is absent or unreadable the export proceeds without it.
    let mapPng: string | undefined;
    try {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
      const png = canvas?.toDataURL("image/png");
      mapPng = png && (await hasVisiblePixels(png)) ? png : undefined;
    } catch {
      mapPng = undefined;
    }
    // The historical reference class is fetched rather than passed down: the
    // page renders it in its own component, and the document should carry the
    // same evidence rather than a second, drifting copy.
    const composed: DocsBlock[] = [...(blocks ?? [])];
    if (analogues) {
      try {
        const params = new URLSearchParams({
          countries: analogues.countries.join(","),
          baskets: analogues.baskets.join(","),
          chokepoints: analogues.chokepoints.join(","),
        });
        const rows = await fetch(`/api/analogues?${params}`)
          .then((r) => (r.ok ? r.json() : { analogues: [] }))
          .then((d) => d.analogues ?? []);
        if (rows.length) {
          composed.push(
            { kind: "heading", text: "Historical rhymes" },
            {
              kind: "paragraphs",
              italic: true,
              text: [
                "Past crises sharing this scenario's geography or commodities, curated from a century of record. The reference class, not a forecast.",
              ],
            },
            {
              kind: "table",
              headers: ["Crisis", "Years", "What it teaches"],
              rows: rows.map((e: { title: string; year_start: number; year_end: number | null; rhyme: string }) => [
                e.title,
                e.year_end === null
                  ? `${e.year_start}–`
                  : e.year_end !== e.year_start
                    ? `${e.year_start}–${e.year_end}`
                    : String(e.year_start),
                e.rhyme,
              ]),
            },
          );
        }
      } catch {
        // The document is complete without its reference class.
      }
    }

    const response = await fetch("/api/export/docs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, subtitle, narrative, facts, blocks: composed, mapPng }),
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
