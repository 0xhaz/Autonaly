import AgentTrailStrip from "@/components/AgentTrailStrip";
import Link from "next/link";
import { notFound } from "next/navigation";

import { approve, reject } from "@/app/actions";
import BriefingWorkspace from "@/components/BriefingWorkspace";
import CiteLine from "@/components/CiteLine";
import { getBriefing } from "@/lib/firestore";
import { formatPercent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Minimal markdown rendering — the composer emits headings, bullets and bold. */
function renderNarrative(text: string) {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed === "---") return <hr key={i} />;

    const bolded = trimmed
      .replace(/^#{2,4}\s*/, "")
      .replace(/^[-*]\s+/, "")
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
      .map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={j} className="mono">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={j}>{part}</span>;
      });

    if (/^#{2,4}\s/.test(trimmed)) return <h3 key={i}>{bolded}</h3>;
    if (/^[-*]\s/.test(trimmed)) return <li key={i}>{bolded}</li>;
    return <p key={i}>{bolded}</p>;
  });
}

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const briefing = await getBriefing(id);
  if (!briefing) notFound();

  const rankings = briefing.rankings;

  // The composer ends with a single quotable claim. Split it out so it can be
  // presented as a citation rather than buried as the last line of prose.
  const citeMatch = briefing.narrative.match(/^CITE:\s*(.+)$/m);
  const claim = citeMatch?.[1]?.trim() ?? null;
  const body = citeMatch
    ? briefing.narrative.replace(citeMatch[0], "").trimEnd()
    : briefing.narrative;
  const isPending = briefing.status === "pending";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/" className="text-sm" style={{ color: "var(--accent)" }}>
        ← review queue
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip chip-${briefing.status}`}>{briefing.status}</span>
          <span className={`chip chip-${briefing.scoring}`}>{briefing.scoring}</span>
          {briefing.draft?.route && (
            <span className="chip" style={{ color: "var(--muted)" }}>
              route: {briefing.draft.route}
            </span>
          )}
          {briefing.draft?.confidence != null && (
            <span className="chip" style={{ color: "var(--muted)" }}>
              confidence {formatPercent(briefing.draft.confidence)}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{briefing.title}</h1>
        <p className="mono text-xs" style={{ color: "var(--muted)" }}>
          {briefing.event_key}
          {rankings ? ` · severity: ${rankings.severity_label} · methodology ${rankings.methodology_version}` : ""}
        </p>
      </header>

      <AgentTrailStrip trail={briefing.trail} />

      {briefing.review_note && (
        <div
          className="panel p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--warn) 45%, transparent)",
            background: "color-mix(in srgb, var(--warn) 8%, transparent)",
          }}
        >
          {/* A review note means two different things, and saying the wrong one
              undermines the page it sits on. Where the agent refused to score,
              this is the refusal and its reason. Where it scored anyway, it is
              a caveat on a figure the same page displays — announcing "severity
              not computed" above a briefing headed "severity: observed" reads
              as a system that cannot keep its own story straight. */}
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--warn)" }}>
            {rankings
              ? "Data-quality note — read before approving"
              : "Data-quality warning — severity not computed"}
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
            {briefing.review_note}
          </p>
        </div>
      )}

      {isPending && (
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nothing is published until a human approves it.
          </p>
          <div className="flex gap-2">
            <form action={reject.bind(null, briefing.id)}>
              <button
                type="submit"
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
              >
                Reject
              </button>
            </form>
            <form action={approve.bind(null, briefing.id)}>
              <button
                type="submit"
                className="rounded-md px-4 py-2 text-sm font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                Approve &amp; publish
              </button>
            </form>
          </div>
        </div>
      )}

      {rankings && rankings.affected.length > 0 && (
        <BriefingWorkspace rankings={rankings} sources={rankings.sources ?? []} />
      )}

      {claim && (
        <CiteLine claim={claim} vintage="BACI 2024" />
      )}

      <section className="panel p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Analyst briefing
        </h2>
        <div className="narrative">{renderNarrative(body)}</div>
      </section>

      {rankings && rankings.winners.length > 0 && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Beneficiaries</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Exporters with world share and headroom to redirect. A rendering of existing trade
            data, not a forecast.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {rankings.winners.map((w) => (
              <li key={w.country} className="flex gap-3">
                <span className="mono font-semibold">{w.country}</span>
                <span style={{ color: "var(--muted)" }}>{w.evidence[0] ?? w.mechanism}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
