import { NextRequest, NextResponse } from "next/server";

/**
 * Scenario simulator — a thin proxy onto the deterministic engine.
 *
 * No LLM anywhere in this path: the same maths that scores a real event scores
 * a hypothetical one, in ~100ms. Public on purpose — it is the atlas's power
 * tool, and it demonstrates that the engine is usable without any agent at all.
 */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const chokepoint = String(body.chokepoint ?? "");
  const transit_reduction = Math.min(1, Math.max(0, Number(body.transit_reduction ?? 1)));
  const duration_months = Math.min(24, Math.max(0, Math.round(Number(body.duration_months ?? 3))));

  if (!chokepoint) {
    return NextResponse.json({ error: "chokepoint required" }, { status: 422 });
  }

  const response = await fetch(`${ENGINE}/chokepoint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event_key: `simulation-${chokepoint}`,
      chokepoint,
      transit_reduction,
      duration_months,
      severity_label: "simulated",
      top_n: 20,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json({ error: `engine ${response.status}` }, { status: 502 });
  }
  return NextResponse.json(await response.json());
}
