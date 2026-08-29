"use client";

import ExportToDocs, { type DocsBlock } from "@/components/ExportToDocs";
import { formatKusd, formatPercent, type Rankings } from "@/lib/types";

/**
 * Google Docs export for a filed briefing.
 *
 * The simulator has had this since the Workspace integration landed, because
 * that is where an export path already existed to make Google-flavoured. So
 * every document in a reader's Drive was a hypothetical they had built
 * themselves, while the briefings the desk actually produced — the ones about
 * real events, with a routing trail and a human gate behind them — could not
 * leave the page. The dashboard meanwhile promised that desk briefs export.
 *
 * A thin wrapper rather than a second exporter: the route already composes key
 * figures, the narrative, the captured map and the glossary, so what belongs
 * here is only what a briefing knows and a scenario does not.
 */
export default function BriefingExport({
  title,
  narrative,
  rankings,
  reviewNote,
  scoring,
  status,
  eventKey,
}: {
  title: string;
  narrative: string;
  rankings?: Rankings | null;
  reviewNote?: string | null;
  scoring: string;
  status: string;
  eventKey: string;
}) {
  const facts: { label: string; value: string }[] = [];
  const blocks: DocsBlock[] = [];

  if (rankings) {
    const atRisk = rankings.affected.reduce(
      (sum, a) => sum + (a.value_at_risk_kusd ?? 0),
      0,
    );
    facts.push(
      { label: "Value at risk (ranked)", value: formatKusd(atRisk) },
      { label: "Countries ranked", value: String(rankings.affected.length) },
      { label: "Largest absolute exposure", value: rankings.largest_absolute_exposure ?? "—" },
      { label: "Severity", value: rankings.severity_label.replace(/_/g, " ") },
      { label: "Methodology", value: rankings.methodology_version },
    );

    blocks.push(
      { kind: "heading", text: "Ranked exposure" },
      {
        kind: "paragraphs",
        italic: true,
        text: [
          "Ordered by dependency intensity rather than by dollars: the country losing the most money and the country least able to replace what it loses are rarely the same one.",
        ],
      },
      {
        kind: "table",
        headers: ["Country", "Score", "Dependency", "Concentration", "Value at risk", "% of GDP"],
        rows: rankings.affected.slice(0, 15).map((a) => [
          a.country,
          a.score?.toFixed(1) ?? "—",
          formatPercent(a.ddr),
          a.hhi?.toFixed(3) ?? "—",
          formatKusd(a.value_at_risk_kusd),
          a.at_risk_pct_gdp != null ? `${a.at_risk_pct_gdp.toFixed(2)}%` : "—",
        ]),
      },
    );

    if (rankings.sources_impact?.length) {
      blocks.push(
        { kind: "heading", text: "What the disrupted exporters lose" },
        {
          kind: "paragraphs",
          italic: true,
          text: [
            "The other side of the disruption. Everything above answers who cannot buy; this is who stops earning.",
          ],
        },
        {
          kind: "table",
          headers: ["Country", "Export revenue at risk", "Share of all its goods exports"],
          rows: rankings.sources_impact.map((s) => [
            s.country,
            formatKusd(s.export_revenue_at_risk_kusd),
            `${(s.share_of_total_exports * 100).toFixed(1)}%`,
          ]),
        },
      );
    }

    if (rankings.winners?.length) {
      blocks.push(
        { kind: "heading", text: "Who benefits" },
        {
          kind: "table",
          headers: ["Country", "Why it gains"],
          rows: rankings.winners.map((w) => [w.country, w.evidence?.[0] ?? w.mechanism]),
        },
      );
    }
  } else {
    // An unscored briefing is a real outcome, and the document has to say so
    // rather than arriving as a report with the numbers mysteriously absent.
    facts.push(
      { label: "Exposure", value: "Not scored" },
      { label: "Reason", value: "Severity could not be established from the data" },
    );
  }

  if (reviewNote) {
    blocks.push(
      {
        kind: "heading",
        text: rankings ? "Data-quality note" : "Why this was not scored",
      },
      { kind: "paragraphs", text: [reviewNote] },
    );
  }

  return (
    <ExportToDocs
      title={title}
      subtitle={`Autonaly desk briefing · ${eventKey} · ${scoring} · ${status} · every figure engine-verified`}
      narrative={narrative}
      facts={facts}
      blocks={blocks}
      analogues={
        rankings
          ? {
              countries: rankings.sources ?? [],
              baskets: rankings.baskets ?? [],
              chokepoints: [],
            }
          : undefined
      }
    />
  );
}
