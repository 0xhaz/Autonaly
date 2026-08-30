/**
 * What the numbers mean.
 *
 * A ranking column of bare figures is not analysis — "10.6" tells a reader
 * nothing unless they know the scale, the inputs, and what it cannot be
 * compared against. One definition list, shared by the app and the exported
 * document, so the two can never drift.
 *
 * Wording is checked against autonaly_engine/scoring.py, not paraphrased from
 * memory: concentration scales between 0.5 and 1 rather than to zero, duration
 * saturates at six months with a 0.35 floor, and the whole product is clamped
 * before scaling to 100.
 */

export interface GlossaryEntry {
  term: string;
  /** One line, for a column tooltip. */
  short: string;
  /** The fuller definition, for the methodology block and the export. */
  full: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Score",
    short: "Exposure intensity, 0–100. Comparable within this scenario, not across scenarios.",
    full:
      "Exposure intensity on a 0–100 scale: 100 × dependency × concentration × essentiality × severity. " +
      "Because it multiplies four factors that are each at most 1, real scores sit well below 100 — " +
      "a score of 10 does not mean '10% affected', it means this country ranks at that intensity " +
      "relative to the others in the same run. Scores are comparable within one scenario and not " +
      "between scenarios, because severity differs.",
  },
  {
    term: "Dependency (DDR)",
    short: "Share of this country's imports of the basket that come from the disrupted origin.",
    full:
      "Direct dependency ratio: of everything this country imports in the affected commodity basket, " +
      "the share sourced from the disrupted origins. Computed from bilateral HS6 customs flows. " +
      "51% means half of that basket's imports are exposed.",
  },
  {
    term: "Concentration (HHI)",
    short: "Supplier concentration, 0–1. Higher means fewer places to turn.",
    full:
      "Herfindahl–Hirschman index of the importer's supplier mix for the basket, from 0 (many equal " +
      "suppliers) to 1 (a single supplier). It scales the score between one half and one — never to " +
      "zero, because a diversified buyer still suffers when a supplier stops; it simply has somewhere " +
      "to turn.",
  },
  {
    term: "Value at risk",
    short: "Dollars of imports exposed. Magnitude — a different question from Score.",
    full:
      "The dollar value of imports from the disrupted origins, scaled by severity. This is magnitude, " +
      "not intensity: a large economy can carry the biggest dollar exposure while barely registering " +
      "on Score, and a small one can be devastated proportionally while losing far less money. Both " +
      "orderings are reported because reading only one produces a misleading brief.",
  },
  {
    term: "% of GDP",
    short: "Value at risk against the size of the economy carrying it.",
    full:
      "The value at risk expressed as a share of the country's GDP (World Bank, " +
      "latest year). Two figures already published, divided — and the one that " +
      "turns a dollar amount into a judgement: $7.6bn is 1.96% of Egypt's economy " +
      "and a rounding error against Germany's. It sizes the shock; it does not " +
      "predict the response.",
  },
  {
    term: "Largest absolute",
    short: "The country losing the most money, regardless of proportion.",
    full:
      "The single country with the greatest dollars at risk. Marked on the map with a bright outline. " +
      "Frequently a large economy whose Score is low.",
  },
  {
    term: "Most dependent",
    short: "The country with the highest proportional exposure, regardless of size.",
    full:
      "The top of the intensity ranking — the country for which the disrupted origins represent the " +
      "largest share of supply. Often small, and often invisible in a dollar ranking.",
  },
  {
    term: "Severity",
    short: "Transit reduction × duration, attenuated where cargo can reroute.",
    full:
      "How much supply stops and for how long. Duration saturates at six months, because buyers " +
      "re-contract and a twelve-month disruption is not twice as bad as a six-month one. Where a sea " +
      "bypass exists the score is attenuated, so a closure becomes a cost-and-delay shock rather than " +
      "a cutoff. For real events severity is measured from observed vessel transits, never assumed.",
  },
  {
    term: "Computed vs curated",
    short:
      "Computed: the engine scored it. Curated: it refused to, and says why — a judgement, not a failure.",
    full:
      "Every briefing carries one of these. Computed means the deterministic engine produced " +
      "rankings: countries, dependency ratios, dollars at risk. Curated means it did not, and the " +
      "briefing carries the reason instead of a number. That happens when severity cannot be " +
      "established honestly — a vessel-transit baseline that is itself degraded, or an event whose " +
      "mechanism is invisible in customs data, such as a banking crisis. A curated briefing is not a " +
      "failed one: the written analysis is there, and so is a statement of what would change the " +
      "answer. It is the desk declining to publish a figure it cannot defend.",
  },
  {
    term: "Essentiality",
    short: "A fixed weight per commodity class — staples and energy weigh most.",
    full:
      "A published weight per commodity group: staples and energy carry the most, then fertilizers, " +
      "critical minerals, and industrial goods. Fixed in advance and never tuned per event, so it " +
      "cannot be adjusted to produce a desired ranking.",
  },
];

/** Term → one-line tooltip, for table headers. */
export const GLOSSARY_SHORT: Record<string, string> = Object.fromEntries(
  GLOSSARY.map((g) => [g.term, g.short]),
);
