"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AnalystBuilder from "@/components/AnalystBuilder";
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
        <p key={i} className="mt-2 text-sm" style={{ color: "#cdd9e8" }}>
          <strong style={{ color: "var(--text)" }}>{parts[1]}</strong>{" "}
          {parts[2]}
        </p>
      );
    }
    return (
      <p key={i} className="mt-1.5 text-sm" style={{ color: "#cdd9e8" }}>
        {t.replace(/\*\*/g, "")}
      </p>
    );
  });
}

function EventCard({ briefing }: { briefing: Briefing }) {
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

  // Show a cached note if one exists; never auto-spend a generation.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/personalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ briefing_id: briefing.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body?.cached) setReport(body.report);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
     
  }, [briefing.id]);

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
          style={{ background: "var(--accent)", color: "#04121f", opacity: loading ? 0.6 : 1 }}>
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

export default function PersonalDashboard({ briefings }: { briefings: Briefing[] }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

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
            setEditing(false);
            load();
          }}
        />
        {/* Saved simulator work exists independently of the analyst — a user
            who speculated before hiring one must still find it here. */}
        <div className="mx-auto max-w-4xl">
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
            watching {profile.baskets.length} commodities · {profile.countries.join(", ") || "no countries"} ·{" "}
            {profile.chokepoints.join(", ") || "no chokepoints"}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)}
          className="rounded-md px-3 py-1.5 text-xs"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}>
          Edit watchlist
        </button>
      </header>

      <SavedScenarios />

      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Current events · your analyst&apos;s read
        </h2>
        {briefings.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No events on the desk.</p>
        ) : (
          briefings.map((b) => <EventCard key={b.id} briefing={b} />)
        )}
      </section>
    </div>
  );
}
