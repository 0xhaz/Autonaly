import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { listScenarios, saveScenario } from "@/lib/scenarios";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ scenarios: await listScenarios(userId) });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const mode = String(body.mode ?? "");
  if (!["chokepoint", "port", "conflict"].includes(mode)) {
    return NextResponse.json({ error: "invalid mode" }, { status: 422 });
  }
  const saved = await saveScenario(userId, {
    mode: mode as "chokepoint" | "port" | "conflict",
    label: String(body.label ?? "Scenario").slice(0, 120),
    headline: String(body.headline ?? "").slice(0, 200),
    params: typeof body.params === "object" && body.params ? body.params : {},
    brief: typeof body.brief === "string" ? body.brief.slice(0, 20000) : null,
  });
  return NextResponse.json({ scenario: saved });
}
