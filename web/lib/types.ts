/**
 * Mirrors the Pydantic schema in autonaly_core.schema.
 *
 * `rankings` is nullable on purpose: a briefing filed when severity could not be
 * established from observation is `curated` and carries no score. The UI has to
 * render that state honestly rather than showing an empty table.
 */

export type BriefingStatus = "pending" | "published" | "rejected";
export type Scoring = "computed" | "curated";

export interface AffectedCountry {
  country: string;
  score: number | null;
  ddr: number | null;
  hhi: number | null;
  value_at_risk_kusd: number | null;
  gdp_usd?: number | null;
  at_risk_pct_gdp?: number | null;
  channel: string;
  evidence: string[];
}

export interface Winner {
  country: string;
  mechanism: string;
  evidence: string[];
}

export interface SourceImpact {
  country: string;
  export_revenue_at_risk_kusd: number;
  basket_exports_kusd: number;
  share_of_total_exports: number;
  top_destinations: string[];
}

export interface Rankings {
  event_key: string;
  severity_label: string;
  affected: AffectedCountry[];
  /** Basket keys and disrupted origins the ranking was computed over, so the
   *  inspect panel can query the same commodity set. */
  baskets?: string[];
  sources?: string[];
  largest_absolute_exposure: string | null;
  winners: Winner[];
  sources_impact?: SourceImpact[];
  methodology_version: string;
}

export interface EventDraft {
  in_scope: boolean;
  out_of_scope_reason: string | null;
  type: string | null;
  route: string | null;
  commodities: string[];
  confidence: number;
}

export interface AgentTrail {
  coordinator: string;
  specialist: string | null;
  route: string | null;
  tools_used: string[];
  model: string;
}

export interface Briefing {
  id: string;
  event_key: string;
  title: string;
  status: BriefingStatus;
  scoring: Scoring;
  narrative: string;
  draft: EventDraft;
  rankings: Rankings | null;
  review_note: string | null;
  trail?: AgentTrail | null;
  created_at: string;
  published_at: string | null;
}

/** Thousand-USD to a human string. The engine's unit is kUSD throughout. */
export function formatKusd(kusd: number | null): string {
  if (kusd === null || kusd === undefined) return "—";
  const usd = kusd * 1000;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}bn`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}m`;
  return `$${(usd / 1e3).toFixed(0)}k`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null || ratio === undefined ? "—" : `${(ratio * 100).toFixed(1)}%`;
}
