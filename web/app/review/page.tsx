import Link from "next/link";

import { listBriefings } from "@/lib/firestore";
import type { Briefing } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The operator's queue — the human gate, moved off the public landing page.
 * Nothing publishes without a click here.
 */

function Row({ briefing }: { briefing: Briefing }) {
  const r = briefing.rankings;
  return (
    <Link href={`/briefing/${briefing.id}`} className="block">
      <article className="panel p-4 transition-colors hover:border-[color:var(--accent)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`chip chip-${briefing.status}`}>{briefing.status}</span>
          <span className={`chip chip-${briefing.scoring}`}>{briefing.scoring}</span>
          {briefing.draft?.route && (
            <span className="chip" style={{ color: "var(--muted)" }}>{briefing.draft.route}</span>
          )}
        </div>
        <h3 className="mt-2 text-sm font-semibold">{briefing.title}</h3>
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

export default async function ReviewPage() {
  const briefings = await listBriefings();
  const pending = briefings.filter((b) => b.status === "pending");
  const decided = briefings.filter((b) => b.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Review queue</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {pending.length} awaiting approval · nothing publishes without a human
        </p>
      </header>
      <div className="space-y-3">
        {pending.map((b) => <Row key={b.id} briefing={b} />)}
        {pending.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nothing awaiting review. Inject a signal with <code className="mono">make replay-suez</code>.
          </p>
        )}
      </div>
      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Decided
          </h2>
          {decided.map((b) => <Row key={b.id} briefing={b} />)}
        </section>
      )}
    </div>
  );
}
