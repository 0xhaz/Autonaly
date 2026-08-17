"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import CountryPanel from "@/components/CountryPanel";
import GlobalMap, { type MapEvent } from "@/components/GlobalMap";
import { formatKusd, formatPercent, type Briefing } from "@/lib/types";

/**
 * The landing dashboard.
 *
 * Leads with the world rather than the review queue: which countries are exposed
 * right now, where the events are, and what any country's trade position looks
 * like. The queue is still here — a human has to approve everything — but it is
 * a column beside the map, not the front door.
 */

function StatTile({ label, value, sub, accent }: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="mono mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: accent ? "#e8a33d" : "var(--text)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function QueueCard({ briefing }: { briefing: Briefing }) {
  const r = briefing.rankings;
  return (
    <Link href={`/briefing/${briefing.id}`} className="block">
      <article className="panel p-3 transition-colors hover:border-[color:var(--accent)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`chip chip-${briefing.status}`}>{briefing.status}</span>
          <span className={`chip chip-${briefing.scoring}`}>{briefing.scoring}</span>
        </div>
        <h3 className="mt-2 text-sm font-semibold leading-snug">{briefing.title}</h3>
        {r ? (
          <p className="mono mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
            {r.largest_absolute_exposure ?? "—"} largest · {r.affected.length} ranked
          </p>
        ) : (
          <p className="mt-1 text-[11px]" style={{ color: "var(--warn)" }}>
            unscored — severity not established
          </p>
        )}
      </article>
    </Link>
  );
}

export default function GlobalDashboard({
  briefings,
  events,
}: {
  briefings: Briefing[];
  events: MapEvent[];
}) {
  // Peak exposure per country across every current event. A max, not a sum:
  // two unrelated crises scoring 30 each do not make a 60.
  const { scores, byCountry, totalAtRisk, worstCountry } = useMemo(() => {
    const scores: Record<string, number> = {};
    const byCountry: Record<string, { event: Briefing; score: number; ddr: number | null }[]> = {};
    let totalAtRisk = 0;

    for (const b of briefings) {
      for (const a of b.rankings?.affected ?? []) {
        const score = a.score ?? 0;
        scores[a.country] = Math.max(scores[a.country] ?? 0, score);
        (byCountry[a.country] ??= []).push({ event: b, score, ddr: a.ddr });
        totalAtRisk += a.value_at_risk_kusd ?? 0;
      }
    }
    const worstCountry =
      Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { scores, byCountry, totalAtRisk, worstCountry };
  }, [briefings]);

  const [selected, setSelected] = useState<string | null>(worstCountry);

  const pending = briefings.filter((b) => b.status === "pending");
  const unscored = briefings.filter((b) => b.scoring === "curated");

  // The panel needs a basket set; use the widest one any event covers so an
  // arbitrary country still has something meaningful to show.
  const { baskets, sources } = useMemo(() => {
    const events = briefings.filter((b) => b.rankings?.baskets?.length);
    const widest = events.sort(
      (a, b) => (b.rankings!.baskets!.length) - (a.rankings!.baskets!.length),
    )[0];
    return {
      baskets: widest?.rankings?.baskets ?? ["crude_oil"],
      sources: widest?.rankings?.sources ?? [],
    };
  }, [briefings]);

  const selectedEvents = selected ? (byCountry[selected] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Exposure under watch"
          value={formatKusd(totalAtRisk)}
          sub={`${Object.keys(scores).length} countries across ${briefings.length} events`}
          accent
        />
        <StatTile
          label="Awaiting approval"
          value={String(pending.length)}
          sub="nothing publishes without a human"
        />
        <StatTile
          label="Peak exposure"
          value={worstCountry ?? "—"}
          sub={worstCountry ? `${scores[worstCountry].toFixed(1)}/100` : undefined}
        />
        <StatTile
          label="Unscored"
          value={String(unscored.length)}
          sub={unscored.length ? "data quality blocked scoring" : "all events scored"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <GlobalMap
          scores={scores}
          events={events}
          selected={selected}
          onSelect={setSelected}
        />

        <div className="space-y-3">
          <section>
            <h2
              className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Review queue · {pending.length} pending
            </h2>
            <div className="space-y-2">
              {briefings.map((b) => (
                <QueueCard key={b.id} briefing={b} />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <CountryPanel
          country={selected}
          baskets={baskets}
          sources={sources}
          exposure={undefined}
        />

        <section className="panel p-4">
          <h2 className="text-sm font-semibold">
            {selected ? `Events affecting ${selected}` : "Select a country"}
          </h2>
          {selectedEvents.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              {selected
                ? "No current event ranks this country. Its trade profile is still shown on the left — that is the point of a knowledge base."
                : "Click a country on the map."}
            </p>
          ) : (
            <table className="rank mt-2">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Score</th>
                  <th>Dependency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedEvents
                  .sort((a, b) => b.score - a.score)
                  .map(({ event, score, ddr }) => (
                    <tr key={event.id}>
                      <td>
                        <Link href={`/briefing/${event.id}`} style={{ color: "var(--accent)" }}>
                          {event.title}
                        </Link>
                      </td>
                      <td className="mono">{score.toFixed(1)}</td>
                      <td className="mono">{formatPercent(ddr)}</td>
                      <td>
                        <span className={`chip chip-${event.status}`}>{event.status}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
