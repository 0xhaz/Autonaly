"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AnalystBuilder from "@/components/AnalystBuilder";
import GoogleDocsCard from "@/components/GoogleDocsCard";
import type { Briefing } from "@/lib/types";

/**
 * The user's own desk: their analyst, and its reading of every current event.
 *
 * The general briefing answers "who is exposed". The personal note answers "am
 * I" — generated on demand by the analyst the user configured, cached until
 * they ask again. A "no impact for you" is rendered as proudly as a hit,
 * because an analyst that only ever cries wolf is not one worth having.
 */

interface SavedScenario {
  id: string;
  mode: "chokepoint" | "port" | "conflict";
  label: string;
  headline: string;
  brief: string | null;
  created_at: string;
}

interface Profile {
  analyst_name: string;
  baskets: string[];
  countries: string[];
  chokepoints: string[];
}

interface Report {
  narrative: string;
  generated_at: string;
  provenance_verified: boolean;
}

function renderNote(text: string) {
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return null;
    const parts = t.replace(/^\*\*(.+?)\*\*\s*/, "§$1§").split("§");
    if (parts.length === 3) {
      return (
        <p key={i} className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
          <strong style={{ color: "var(--text)" }}>{parts[1]}</strong>{" "}
          {parts[2]}
        </p>
      );
    }
    return (
      <p key={i} className="mt-1.5 text-sm" style={{ color: "var(--text-soft)" }}>
        {t.replace(/\*\*/g, "")}
      </p>
    );
  });
}

function EventCard({ briefing, autoGenerate }: { briefing: Briefing; autoGenerate?: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/personalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefing_id: briefing.id, force }),
      });
      setLoading(false);
      if (!response.ok) {
        setError("Your analyst could not complete this note.");
        return;
      }
      const body = await response.json();
      setReport(body.report);
    },
    [briefing.id],
  );

  // Show a cached note if one exists — peek never spends a generation. The
  // one exception is the hire moment: the newest event's note is generated
  // immediately, so the analyst's first read is waiting before it's asked for.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/personalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ briefing_id: briefing.id, peek: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (body?.cached) setReport(body.report);
        else if (autoGenerate) void generate(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
     
  }, [briefing.id, autoGenerate, generate]);

  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`chip chip-${briefing.status}`}>{briefing.status}</span>
          <span className={`chip chip-${briefing.scoring}`}>{briefing.scoring}</span>
        </div>
        <Link href={`/briefing/${briefing.id}`} className="text-xs" style={{ color: "var(--accent)" }}>
          full briefing →
        </Link>
      </div>
      <h3 className="mt-2 text-sm font-semibold">{briefing.title}</h3>

      {report ? (
        <div
          className="mt-3 rounded-md p-3"
          style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
        >
          {renderNote(report.narrative)}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {report.provenance_verified ? "every figure engine-verified" : "unverified"}
            </span>
            <button type="button" onClick={() => generate(true)} disabled={loading}
              className="text-[11px]" style={{ color: "var(--muted)" }}>
              {loading ? "regenerating…" : "regenerate"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => generate(false)} disabled={loading}
          className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Your analyst is reading…" : "What does this mean for me?"}
        </button>
      )}
      {error && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
    </article>
  );
}

function SavedScenarios() {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const load = useCallback(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((body) => setScenarios(body.scenarios ?? []))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const remove = async (id: string) => {
    await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    setScenarios(scenarios.filter((s) => s.id !== id));
  };

  if (scenarios.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        Saved scenarios · your speculation, replayable
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {scenarios.map((s) => (
          <div key={s.id} className="panel space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="chip chip-computed" style={{ textTransform: "none" }}>
                  {s.mode === "conflict" ? "Conflict" : s.mode === "port" ? "Port blockage" : "Chokepoint"}
                </span>
                {s.brief && (
                  <span className="chip chip-curated ml-1.5" style={{ textTransform: "none" }}>
                    desk brief
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="text-xs"
                style={{ color: "var(--muted)" }}
                title="Delete"
              >
                ✕
              </button>
            </div>
            <div>
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                {s.headline}
                {s.headline ? " · " : ""}
                saved {s.created_at.slice(0, 10)}
              </div>
            </div>
            <Link
              href={`/simulate?saved=${s.id}`}
              className="inline-block rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ border: "1px solid var(--line)", color: "var(--text)" }}
            >
              Reopen — replays on the live engine
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function WatchedCountries({
  countries,
  names,
  onChanged,
}: {
  countries: string[];
  names: Record<string, string>;
  onChanged: () => void;
}) {
  const unwatch = async (iso3: string) => {
    await fetch("/api/profile/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: iso3 }),
    });
    onChanged();
  };

  if (countries.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        Watched countries · live data, not bookmarks
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {countries.map((iso3) => (
          <div key={iso3} className="panel flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{names[iso3] ?? iso3}</div>
                <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                  {iso3}
                </div>
              </div>
              <button
                type="button"
                onClick={() => unwatch(iso3)}
                className="text-xs"
                style={{ color: "var(--muted)" }}
                title="Remove from watchlist"
              >
                ✕
              </button>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link
                href={`/country/${iso3}`}
                className="rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                Full profile
              </Link>
              <Link
                href={`/?country=${iso3}`}
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
              >
                Atlas
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PersonalDashboard({ briefings }: { briefings: Briefing[] }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [justHired, setJustHired] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [chokeLabels, setChokeLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/country-names.json")
      .then((r) => r.json())
      .then(setNames)
      .catch(() => {});
    fetch("/api/meta")
      .then((r) => r.json())
      .then((meta) => {
        const map: Record<string, string> = {};
        for (const c of meta.chokepoints ?? []) map[c.key] = c.label;
        setChokeLabels(map);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((body) => setProfile(body.profile ?? null))
      .catch(() => setProfile(null));
  }, []);

  useEffect(load, [load]);

  if (profile === undefined) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>loading…</p>;
  }

  if (profile === null || editing) {
    return (
      <div className="space-y-8">
        <AnalystBuilder
          initial={profile}
          onSaved={() => {
            // A first hire earns instant gratification: the newest event's
            // personal note generates unprompted. Edits don't re-spend.
            if (profile === null) setJustHired(true);
            setEditing(false);
            load();
          }}
        />
        {/* Saved work and the Docs connection exist independently of the
            analyst — someone who speculated, or who wants to export a brief,
            must still find them before hiring one. */}
        <div className="mx-auto max-w-4xl space-y-6">
          <GoogleDocsCard />
          <SavedScenarios />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{profile.analyst_name}</h1>
          <p className="mono mt-1 text-xs" style={{ color: "var(--muted)" }}>
            watching {profile.baskets.length} commodities ·{" "}
            {profile.countries.length} countr{profile.countries.length === 1 ? "y" : "ies"} ·{" "}
            {profile.chokepoints.length === 0
              ? "no chokepoints"
              : profile.chokepoints.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ", "}
                    <Link
                      href={`/simulate?chokepoint=${k}`}
                      title="Simulate a closure here"
                      style={{ color: "var(--accent)" }}
                    >
                      {chokeLabels[k] ?? k}
                    </Link>
                  </span>
                ))}
          </p>
        </div>
        {/* The desk brings you events; a scenario is the thing you start
            yourself, so it gets the header's one action. Named for where it
            goes — "New research" read as "define what this analyst
            researches", and sent people to the wrong page. Editing the
            watchlist lives beside the reads it governs, further down. */}
        <Link
          href={
            profile.chokepoints.length
              ? `/simulate?chokepoint=${profile.chokepoints[0]}`
              : "/simulate"
          }
          className="rounded-md px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          New scenario
        </Link>
      </header>

      <GoogleDocsCard />

      <WatchedCountries countries={profile.countries} names={names} onChanged={load} />

      <SavedScenarios />

      <section className="space-y-3">
        {/* This is where the watchlist shows its work — every note below is the
            criteria applied to an event — so it is where you change it. In the
            header it sat next to New scenario and read as a second way to start
            something, rather than a way to adjust what already runs. */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Current events · your analyst&apos;s read
          </h2>
          <button type="button" onClick={() => setEditing(true)}
            className="shrink-0 rounded-md px-3 py-1.5 text-xs"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}>
            Edit watchlist
          </button>
        </div>
        <p className="-mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Briefings the desk has filed from incoming signals, each read against
          your watchlist. These arrive on their own — to ask a question of your
          own, run a new scenario.
        </p>
        {briefings.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No events on the desk yet. Your analyst reads them as they arrive —
            meanwhile, run a scenario of your own.
          </p>
        ) : (
          briefings.map((b, i) => (
            <EventCard key={b.id} briefing={b} autoGenerate={justHired && i === 0} />
          ))
        )}
      </section>
    </div>
  );
}
