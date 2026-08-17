import Link from "next/link";

import { listBriefings } from "@/lib/firestore";
import { formatKusd, type Briefing } from "@/lib/types";

export const dynamic = "force-dynamic";

function StatusChip({ status }: { status: Briefing["status"] }) {
  return <span className={`chip chip-${status}`}>{status}</span>;
}

function Row({ briefing }: { briefing: Briefing }) {
  const rankings = briefing.rankings;
  const top = rankings?.affected?.[0];
  const largest = rankings?.largest_absolute_exposure;
  const largestRow = rankings?.affected?.find((a) => a.country === largest);

  return (
    <Link href={`/briefing/${briefing.id}`} className="block">
      <article className="panel p-5 transition-colors hover:border-[color:var(--accent)]">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={briefing.status} />
          <span className={`chip chip-${briefing.scoring}`}>{briefing.scoring}</span>
          {briefing.draft?.route && (
            <span className="chip" style={{ color: "var(--muted)" }}>
              {briefing.draft.route}
            </span>
          )}
        </div>

        <h2 className="mt-3 text-base font-semibold">{briefing.title}</h2>

        {briefing.scoring === "curated" ? (
          <p className="mt-2 text-sm" style={{ color: "var(--warn)" }}>
            Filed without a score — severity could not be established from observation.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span style={{ color: "var(--muted)" }}>Largest exposure </span>
              <span className="mono font-semibold">{largest ?? "—"}</span>
              <span className="mono" style={{ color: "var(--muted)" }}>
                {largestRow ? ` ${formatKusd(largestRow.value_at_risk_kusd)}` : ""}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--muted)" }}>Most dependent </span>
              <span className="mono font-semibold">{top?.country ?? "—"}</span>
              <span className="mono" style={{ color: "var(--muted)" }}>
                {top?.score != null ? ` ${top.score.toFixed(1)}/100` : ""}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--muted)" }}>Countries ranked </span>
              <span className="mono">{rankings?.affected?.length ?? 0}</span>
            </div>
          </div>
        )}
      </article>
    </Link>
  );
}

export default async function QueuePage() {
  const briefings = await listBriefings();
  const pending = briefings.filter((b) => b.status === "pending");
  const decided = briefings.filter((b) => b.status !== "pending");

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Review queue</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {pending.length} awaiting approval
          </p>
        </div>

        {pending.length === 0 ? (
          <div className="panel p-6 text-sm" style={{ color: "var(--muted)" }}>
            Nothing awaiting review. Inject a signal with{" "}
            <code className="mono">make replay-suez</code>.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((b) => (
              <Row key={b.id} briefing={b} />
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Decided
          </h2>
          <div className="space-y-3">
            {decided.map((b) => (
              <Row key={b.id} briefing={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
