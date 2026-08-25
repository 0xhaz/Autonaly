/**
 * Which of the atlas's straits the engine actually models, and why the rest
 * do not.
 *
 * The map draws 28 chokepoints because they exist; the engine scores 8 because
 * those are the ones whose trade flows have been deliberately assigned.
 * Assigning a flow to a strait from memory produces confidently wrong data —
 * it happened twice here before the rule existed — so the remainder wait for
 * curation and say so rather than quietly disappearing.
 *
 * Several are not oversights at all: they are bypass routes, parallel
 * passages, or structurally negligible for trade, and the reason names which.
 */

export const UNCURATED_REASONS: Record<string, string> = {
  "Cape of Good Hope":
    "This is the bypass route itself — it appears as attenuation on Suez and Bab el-Mandeb.",
  "Lombok Strait": "Primary bypass for Malacca; its closure is already Malacca's attenuation.",
  "Sunda Strait": "Primary bypass for Malacca; its closure is already Malacca's attenuation.",
  "Makassar Strait": "Parallel Indonesian passage; traffic diverts to adjacent straits.",
  "Ombai Strait":
    "A deep-water passage used mainly by naval traffic; commercial tonnage routes via Lombok and Makassar.",
  "Luzon Strait": "Eastern bypass of the Taiwan Strait; through-traffic reroutes here.",
  "Balabac Strait": "A regional Philippine passage; through-traffic uses the South China Sea proper.",
  "Mindoro Strait": "A domestic Philippine channel; international routing is unaffected.",
  "Torres Strait":
    "Shallow and navigationally restricted; most tonnage routes around Australia rather than through it.",
  "Magellan Strait": "Redundant with Panama and the Drake Passage for modern tonnage.",
  "Bering Strait": "Negligible commercial transit today.",
  "Tsugaru Strait": "Parallel Japanese passage with ready alternatives.",
  "Korea Strait":
    "Flows cannot be defensibly separated from adjacent routes in country-level data.",
  "Dover Strait":
    "Ships route north of the UK at trivial cost; closure is a nuisance, not a shock.",
  "Oresund Strait":
    "The Great Belt carries the deep-draft Baltic traffic; Oresund alone has a ready bypass.",
  "Kerch Strait":
    "Azov flows are a small, port-level slice of Black Sea trade — needs port-share modelling.",
  "Bohai Strait":
    "A Chinese import gateway; inbound flows cannot be attributed at country level.",
  "Yucatan Channel":
    "An open-sea entrance to the Gulf of Mexico — too wide to close, and Gulf trade already registers at its ports.",
  "Windward Passage":
    "One of several Caribbean passages; adjacent channels absorb its traffic at negligible cost.",
  "Mona Passage":
    "One of several Caribbean passages; adjacent channels absorb its traffic at negligible cost.",
};

export const DEFAULT_UNCURATED =
  "Routing not yet curated — flows must be assigned deliberately, not guessed.";

/**
 * The map and the engine name the same water differently ("Strait of Malacca"
 * versus "Malacca Strait"), so matching is on the distinctive word rather than
 * the full label.
 */
export function normaliseStrait(name: string): string {
  return name
    .toLowerCase()
    .replace(/^strait of\s+/, "")
    .replace(/\s+(strait|canal|channel|passage)$/, "")
    .trim();
}

export function reasonFor(name: string): string {
  return UNCURATED_REASONS[name] ?? DEFAULT_UNCURATED;
}

/**
 * Where each strait sits, for grouping the pickers. The atlas is a map, so a
 * flat alphabetical list of 28 names is the one ordering that helps nobody —
 * an analyst thinks in regions.
 */
export const STRAIT_REGIONS: Record<string, string> = {
  // Middle East & Red Sea
  "Suez Canal": "Middle East & Red Sea",
  "Strait of Hormuz": "Middle East & Red Sea",
  "Bab el-Mandeb Strait": "Middle East & Red Sea",
  // Europe & Mediterranean
  "Bosporus Strait": "Europe & Mediterranean",
  "Gibraltar Strait": "Europe & Mediterranean",
  "Strait of Gibraltar": "Europe & Mediterranean",
  "Dover Strait": "Europe & Mediterranean",
  "Oresund Strait": "Europe & Mediterranean",
  "Kerch Strait": "Europe & Mediterranean",
  // Asia & Pacific
  "Malacca Strait": "Asia & Pacific",
  "Strait of Malacca": "Asia & Pacific",
  "Taiwan Strait": "Asia & Pacific",
  "Korea Strait": "Asia & Pacific",
  "Tsugaru Strait": "Asia & Pacific",
  "Luzon Strait": "Asia & Pacific",
  "Lombok Strait": "Asia & Pacific",
  "Sunda Strait": "Asia & Pacific",
  "Makassar Strait": "Asia & Pacific",
  "Ombai Strait": "Asia & Pacific",
  "Bohai Strait": "Asia & Pacific",
  "Balabac Strait": "Asia & Pacific",
  "Mindoro Strait": "Asia & Pacific",
  "Torres Strait": "Asia & Pacific",
  "Bering Strait": "Asia & Pacific",
  // Americas
  "Panama Canal": "Americas",
  "Magellan Strait": "Americas",
  "Yucatan Channel": "Americas",
  "Windward Passage": "Americas",
  "Mona Passage": "Americas",
  // Africa
  "Cape of Good Hope": "Africa",
};

/** Busiest regions first, so the important pickers are above the fold. */
export const REGION_ORDER = [
  "Middle East & Red Sea",
  "Asia & Pacific",
  "Europe & Mediterranean",
  "Americas",
  "Africa",
] as const;

export function regionFor(name: string): string {
  return STRAIT_REGIONS[name] ?? "Other";
}

/** Display names for the engine's essentiality classes, which double as the
 *  commodity groups — the same field that sets the scoring weight. */
export const COMMODITY_GROUPS: { key: string; label: string }[] = [
  { key: "staple", label: "Food & agriculture" },
  { key: "energy", label: "Energy" },
  { key: "fertilizer", label: "Fertilizers" },
  { key: "critical_mineral", label: "Critical minerals" },
  { key: "industrial", label: "Industrial & technology" },
];
