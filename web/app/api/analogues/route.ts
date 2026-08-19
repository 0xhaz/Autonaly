import { NextRequest, NextResponse } from "next/server";

/** Historical reference class for a scenario — curated data, no LLM. Public. */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const params = new URLSearchParams({
    countries: q.get("countries") ?? "",
    baskets: q.get("baskets") ?? "",
    chokepoints: q.get("chokepoints") ?? "",
    limit: "4",
  });
  const response = await fetch(`${ENGINE}/history-analogues?${params}`, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: `engine ${response.status}` }, { status: 502 });
  }
  return NextResponse.json(await response.json());
}
