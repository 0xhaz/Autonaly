import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * The desk's read of a user-built hypothetical. Signed-in only: the numbers are
 * free and public (the simulator), the analyst's commentary is the product.
 */

const AGENT_API = process.env.AUTONALY_AGENT_API_URL ?? "http://localhost:8090";
const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

/** The scenario's historical reference class, attached so the desk can cite
 * real precedents — and only these; the prompt forbids inventing others. */
async function withHistory(scenario: Record<string, unknown>, rankings: Record<string, unknown>) {
  const channels = (rankings.channels ?? []) as { sources?: string[]; rankings?: { baskets?: string[] } }[];
  const countries = [
    ...((rankings.sources as string[] | undefined) ?? []),
    ...channels.flatMap((c) => c.sources ?? []),
    ...(typeof scenario.country === "string" ? [scenario.country] : []),
  ];
  const baskets = [
    ...((rankings.baskets as string[] | undefined) ?? []),
    ...channels.flatMap((c) => c.rankings?.baskets ?? []),
  ];
  const chokepoints = typeof scenario.chokepoint === "string" ? [scenario.chokepoint] : [];
  try {
    const params = new URLSearchParams({
      countries: [...new Set(countries)].join(","),
      baskets: [...new Set(baskets)].join(","),
      chokepoints: chokepoints.join(","),
      limit: "4",
    });
    const response = await fetch(`${ENGINE}/history-analogues?${params}`, { cache: "no-store" });
    if (!response.ok) return scenario;
    const { analogues } = await response.json();
    return { ...scenario, history: analogues };
  } catch {
    return scenario;
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { scenario, rankings } = await request.json();
  if (!scenario || !rankings) {
    return NextResponse.json({ error: "scenario and rankings required" }, { status: 422 });
  }

  const enriched = await withHistory(scenario, rankings);
  const response = await fetch(`${AGENT_API}/scenario-brief`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario: enriched, rankings }),
  });
  if (!response.ok) {
    return NextResponse.json({ error: `agent api ${response.status}` }, { status: 502 });
  }
  return NextResponse.json(await response.json());
}
