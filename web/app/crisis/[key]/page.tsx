"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A curated historical crisis as a standalone report: the record, what its
 * commodities look like on today's network, and the door back into the
 * simulator to run the modern version of the same shock.
 */

interface CommodityNow {
  basket: string;
  label: string;
  countries_world_share_now: number;
}

interface RelatedEvent {
  key: string;
  title: string;
  year_start: number;
  year_end: number | null;
  rhyme: string;
}

interface Outcome {
  metric: string;
  move: string;
  window: string;
}

interface CrisisReport {
  key: string;
  outcomes: Outcome[];
  title: string;
  year_start: number;
  year_end: number | null;
  category: string;
  summary: string;
  rhyme: string;
  chokepoints: string[];
  countries_detail: { iso3: string; name: string; custom_eligible: boolean }[];
  commodities_today: CommodityNow[];
  related: RelatedEvent[];
}

const years = (a: number, b: number | null) =>
  b === null ? `${a} – ongoing` : b !== a ? `${a}–${b}` : `${a}`;

export default function CrisisPage() {
  const { key } = useParams<{ key: string }>();
  const [report, setReport] = useState<CrisisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/crisis/${key}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setReport)
      .catch(() => setError("This crisis is not in the curated record."));
  }, [key]);

  if (error) return <p className="py-10 text-sm" style={{ color: "var(--muted)" }}>{error}</p>;
  if (!report) return <p className="py-10 text-sm" style={{ color: "var(--muted)" }}>loading…</p>;

  const eligible = report.countries_detail.filter((c) => c.custom_eligible).map((c) => c.iso3);

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
          Crisis record · {report.category.replace("_", " ")}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">{report.title}</h1>
          <span className="mono text-lg" style={{ color: "var(--accent)" }}>
            {years(report.year_start, report.year_end)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {report.countries_detail.map((c) => (
            <span key={c.iso3} className="chip chip-computed" style={{ textTransform: "none" }}>
              {c.name}
            </span>
          ))}
        </div>
      </header>

      <section className="panel space-y-3 p-5">
        <h2 className="text-sm font-semibold">What happened</h2>
        <p className="text-sm leading-relaxed" style={{ color: "#cdd9e8" }}>
          {report.summary}
        </p>
        <p className="rounded-md p-3 text-sm leading-relaxed" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
          <span style={{ color: "var(--warn)" }}>The rhyme — what it teaches about the next one:</span>{" "}
          {report.rhyme}
        </p>
      </section>

      {report.outcomes.length > 0 && (
        <section className="panel p-5">
          <h2 className="text-sm font-semibold">What actually repriced</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            The documented market response — base rates for the next rhyme, not
            advice.
          </p>
          <ul className="mt-3 space-y-2">
            {report.outcomes.map((o) => (
              <li key={o.metric} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{o.metric}</span>
                <span className="text-xs" style={{ color: "#cdd9e8" }}>
                  {o.move}
                </span>
                <span className="mono shrink-0 text-[11px]" style={{ color: "var(--muted)" }}>
                  {o.window}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.commodities_today.length > 0 && (
        <section className="panel p-5">
          <h2 className="text-sm font-semibold">The same commodities, today&apos;s network</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            The share of world trade the involved countries supply now, from
            latest-year customs data — how much the same shock would matter on
            the current map.
          </p>
          <ul className="mt-3 space-y-1.5">
            {report.commodities_today.map((c) => (
              <li key={c.basket} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{c.label}</span>
                <span className="mono" style={{ color: "var(--text)" }}>
                  {(c.countries_world_share_now * 100).toFixed(1)}% of world trade
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {eligible.length > 0 && (
        <section
          className="panel flex flex-wrap items-center justify-between gap-4 p-5"
          style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
        >
          <div>
            <h2 className="text-sm font-semibold">Run the modern version</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Replay this shock on today&apos;s trade network — the simulator
              derives the disruption channels from current data.
            </p>
          </div>
          <Link
            href={`/simulate?custom=${eligible.slice(0, 3).join(",")}`}
            className="rounded-md px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#04121f" }}
          >
            Run as a scenario today
          </Link>
        </section>
      )}

      {report.related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Related crises</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.related.map((e) => (
              <Link key={e.key} href={`/crisis/${e.key}`} className="block">
                <article className="panel h-full p-4 transition-colors hover:border-[color:var(--accent)]">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{e.title}</h3>
                    <span className="mono shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>
                      {years(e.year_start, e.year_end)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {e.rhyme}
                  </p>
                </article>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Curated historical record · commodity shares recomputed live from
        BACI/CEPII latest-year data · methodology 1.0.0
      </p>
    </div>
  );
}
