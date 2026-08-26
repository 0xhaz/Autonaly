import Link from "next/link";

import { GLOSSARY } from "@/lib/glossary";

/**
 * The methodology page (architecture D14): every simplification stated in one
 * place, linkable from every number. A reference product that hides its
 * assumptions is not one.
 */

export const metadata = { title: "Methodology — Autonaly" };

const SIMPLIFICATIONS = [
  {
    title: "Latest-year trade weights",
    body:
      "Exposure uses the most recent full year of bilateral customs data (BACI 2024). It measures dependence on today's network, not how trade would rewire under stress. Post-2022 rewiring — such as Europe's pivot from Russian seaborne energy — is already embedded in the weights.",
  },
  {
    title: "First-order effects only",
    body:
      "A country is exposed through its own imports from the disrupted origin. Second-order chains (neon → fabs → autos) are not computed; where they matter historically, they are curated narrative, clearly labelled.",
  },
  {
    title: "No inventories, no substitution dynamics",
    body:
      "The model assumes no stockpiles, no domestic production ramp, and no supplier switching within the scenario window. Real adjustment makes real outcomes smaller than modelled exposure — the score is a ceiling on first-order exposure, not a prediction.",
  },
  {
    title: "No probabilities, ever",
    body:
      "The desk publishes exposure, never likelihood. Hypothetical scenarios open with the word 'Hypothetical' and refuse probability by design; historical probability belongs to the record, not the model.",
  },
  {
    title: "Only 23 commodity baskets are visible",
    body:
      "Grains, energy, fertilizers, and critical minerals — 72 HS6 codes chosen for supply-shock relevance. Services, autos, machinery and most manufactures are outside the model, so a crisis in a diversified manufacturing economy is understated here.",
  },
  {
    title: "Financial crises are refused",
    body:
      "Banking, currency and debt crises transmit through capital flows and confidence — invisible in customs data. The engine will not score them; the desk routes them to a curated, unscored briefing that says why.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
          Methodology · version 1.0.0
        </p>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">
          Every number, traceable to a row and a formula
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
          Autonaly&apos;s exposure scores are deterministic: the same inputs always
          produce the same outputs, no model in the loop. This page is the whole
          method — including what it deliberately cannot see.
        </p>
      </header>

      <section className="panel space-y-4 p-5">
        <h2 className="text-sm font-semibold">The formula</h2>
        <div className="mono rounded-md p-4 text-sm leading-relaxed" style={{ background: "var(--panel-2)" }}>
          score = 100 × DDR × (0.5 + 0.5 × HHI) × essentiality × severity
        </div>
        <ul className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>DDR — direct dependency ratio.</strong>{" "}
            The share of a country&apos;s imports of a commodity basket sourced
            from the disrupted origin, computed from bilateral HS6 customs flows
            (CEPII BACI).
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>HHI — supplier concentration.</strong>{" "}
            The Herfindahl–Hirschman index of the importer&apos;s supplier mix for
            that basket, recomputed at basket level. Concentrated dependence
            scores higher than the same ratio spread across many suppliers.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Essentiality.</strong>{" "}
            A fixed weight per basket — staples, energy and critical minerals
            carry more than substitutable goods. Published in the basket
            catalogue; never tuned per event.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Severity.</strong>{" "}
            Transit reduction × a duration factor that saturates at six months.
            For chokepoints, the reduction is measured from IMF PortWatch vessel
            transits — the observed collapse, not the headline&apos;s claim — and
            attenuated when a sea bypass exists.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Glossary</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Every figure the product shows, and what it does and does not let you
          conclude. The same definitions travel inside exported documents.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map((entry) => (
            <div key={entry.term} className="panel p-4">
              <h3 className="text-xs font-semibold">{entry.term}</h3>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {entry.full}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-sm font-semibold">Materiality floors</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          A ranking answers &quot;where is the global supply impact&quot;, not
          &quot;who is most dependent&quot;. Importers below a floor — the greater
          of $100m or 5 basis points of the basket&apos;s world trade — are
          excluded, so micro-importers at 100% dependency do not outrank major
          economies at 70%. Value at risk in dollars is always shown beside the
          intensity score, because the two orderings answer different questions.
        </p>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-sm font-semibold">The provenance guard</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Narratives are drafted by Gemini around the computed numbers, then
          checked mechanically: any figure in the text that does not exist in the
          engine&apos;s output rejects the draft. The model can phrase; it cannot
          invent. Briefings the desk cannot score honestly — for example when AIS
          data looks degraded — are filed unscored with the reason quoted, and a
          human approves everything before publication.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What the model deliberately cannot see</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIMPLIFICATIONS.map((s) => (
            <div key={s.title} className="panel p-4">
              <h3 className="text-xs font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-2 p-5">
        <h2 className="text-sm font-semibold">Data and attribution</h2>
        <ul className="space-y-1.5 text-sm" style={{ color: "var(--muted)" }}>
          <li>Trade flows: CEPII BACI (Etalab 2.0) — 11.25m bilateral HS6 rows, 2024.</li>
          <li>Chokepoint transits and port shares: UN Global Platform; IMF PortWatch.</li>
          <li>Country context: World Bank WDI (CC BY 4.0); currency names via CLDR.</li>
          <li>Crisis history: curated from the historical record, reviewed in version control — never generated.</li>
        </ul>
        <p className="pt-1 text-xs" style={{ color: "var(--muted)" }}>
          Informational, not advice. Exposure, never probability.{" "}
          <Link href="/about" style={{ color: "var(--accent)" }}>
            About Autonaly →
          </Link>
        </p>
      </section>
    </div>
  );
}
