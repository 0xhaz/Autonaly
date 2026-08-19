"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The reference class for a hypothetical: curated past crises that rhyme with
 * the scenario's geography and commodities. History doesn't repeat, but it
 * rhymes — the analyst speculating about the next crisis deserves the last
 * five that looked like it.
 */

interface Analogue {
  key: string;
  title: string;
  year_start: number;
  year_end: number | null;
  category: string;
  summary: string;
  rhyme: string;
}

export default function HistoricalRhymes({
  countries,
  baskets,
  chokepoints,
}: {
  countries: string[];
  baskets: string[];
  chokepoints: string[];
}) {
  const [rows, setRows] = useState<Analogue[]>([]);
  const query = [countries.join(","), baskets.join(","), chokepoints.join(",")].join("|");

  useEffect(() => {
    const [c, b, k] = query.split("|");
    const params = new URLSearchParams({ countries: c, baskets: b, chokepoints: k });
    fetch(`/api/analogues?${params}`)
      .then((r) => r.json())
      .then((d) => setRows(d.analogues ?? []))
      .catch(() => setRows([]));
  }, [query]);

  if (rows.length === 0) return null;

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold">Historical rhymes</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Past crises that share this scenario&apos;s geography or commodities —
        curated from a century of record, not generated. The reference class for
        your speculation.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {rows.map((e) => (
          <Link key={e.key} href={`/crisis/${e.key}`} className="block rounded-md p-3 transition-colors hover:border-[color:var(--accent)]" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">{e.title}</span>
              <span className="mono shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>
                {e.year_start}
                {e.year_end === null ? "–" : e.year_end !== e.year_start ? `–${e.year_end}` : ""}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#cdd9e8" }}>
              {e.summary}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
              <span style={{ color: "var(--warn)" }}>Rhyme:</span> {e.rhyme}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
