import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * The desk's read of a user-built hypothetical. Signed-in only: the numbers are
 * free and public (the simulator), the analyst's commentary is the product.
 */

const AGENT_API = process.env.AUTONALY_AGENT_API_URL ?? "http://localhost:8090";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { scenario, rankings } = await request.json();
  if (!scenario || !rankings) {
    return NextResponse.json({ error: "scenario and rankings required" }, { status: 422 });
  }

  const response = await fetch(`${AGENT_API}/scenario-brief`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario, rankings }),
  });
  if (!response.ok) {
    return NextResponse.json({ error: `agent api ${response.status}` }, { status: 502 });
  }
  return NextResponse.json(await response.json());
}
