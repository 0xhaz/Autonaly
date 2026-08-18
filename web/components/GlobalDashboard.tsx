"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import CountryDrawer from "@/components/CountryDrawer";
import GlobalMap, { type MapEvent } from "@/components/GlobalMap";
import { formatKusd, type Briefing } from "@/lib/types";

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
  const { scores, totalAtRisk, worstCountry } = useMemo(() => {
    const scores: Record<string, number> = {};
    let totalAtRisk = 0;

    for (const b of briefings) {
      for (const a of b.rankings?.affected ?? []) {
        // Peak, not sum: two unrelated crises scoring 30 each are not a 60.
        scores[a.country] = Math.max(scores[a.country] ?? 0, a.score ?? 0);
        totalAtRisk += a.value_at_risk_kusd ?? 0;
      }
    }
    const worstCountry = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { scores, totalAtRisk, worstCountry };
  }, [briefings]);

  // Starts closed: the map is the page, and the drawer is something the
  // reader opens, not a panel that is always half-covering it.
  const [selected, setSelected] = useState<string | null>(null);

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

  // The drawer's exposure block wants this country's row from whichever event
  // ranks it worst — the same event the map colour is showing.
  const exposureFor = (iso3: string) => {
    return briefings
      .flatMap((b) => b.rankings?.affected ?? [])
      .filter((a) => a.country === iso3)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  };

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

      <GlobalMap
        scores={scores}
        events={events}
        selected={selected}
        onSelect={setSelected}
      />

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Review queue · {pending.length} pending
          </h2>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            nothing publishes without a human
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {briefings.map((b) => (
            <QueueCard key={b.id} briefing={b} />
          ))}
        </div>
      </section>

      <CountryDrawer
        country={selected}
        baskets={baskets}
        sources={sources}
        exposure={selected ? exposureFor(selected) : undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
