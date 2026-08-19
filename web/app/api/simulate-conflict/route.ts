import { NextRequest, NextResponse } from "next/server";

/** Conflict composition — proxied to the deterministic engine, no LLM. */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const response = await fetch(`${ENGINE}/conflict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conflict: String(body.conflict ?? ""),
      intensity: Math.min(1, Math.max(0.1, Number(body.intensity ?? 1))),
      duration_months: Math.min(24, Math.max(0, Math.round(Number(body.duration_months ?? 6)))),
      top_n: 20,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json({ error: `engine ${response.status}` }, { status: 502 });
  }
  return NextResponse.json(await response.json());
}
