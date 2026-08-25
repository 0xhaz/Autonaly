import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getBriefing } from "@/lib/firestore";
import { serviceAuthHeaders } from "@/lib/serviceAuth";
import { getPersonalReport, getProfile, savePersonalReport } from "@/lib/profile";

/**
 * Generate (or return the cached) personal impact note for one briefing.
 *
 * The LLM call happens on the agent side — this route only orchestrates:
 * profile + briefing in, guarded narrative out, cached per (user, briefing) so
 * regeneration is explicit rather than a cost on every page view.
 */

const AGENT_API = process.env.AUTONALY_AGENT_API_URL ?? "http://localhost:8090";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { briefing_id, force, peek } = await request.json();
  if (!briefing_id) {
    return NextResponse.json({ error: "briefing_id required" }, { status: 422 });
  }

  if (!force) {
    const cached = await getPersonalReport(userId, briefing_id);
    if (cached) return NextResponse.json({ report: cached, cached: true });
  }
  if (peek) {
    // A look at the cache must never cost a generation — the card on mount
    // asks "is there a note?" and generation stays an explicit act.
    return NextResponse.json({ report: null, cached: false });
  }

  const [profile, briefing] = await Promise.all([
    getProfile(userId),
    getBriefing(briefing_id),
  ]);
  if (!profile) return NextResponse.json({ error: "no analyst profile" }, { status: 409 });
  if (!briefing) return NextResponse.json({ error: "unknown briefing" }, { status: 404 });

  const response = await fetch(`${AGENT_API}/personalize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await serviceAuthHeaders(AGENT_API)),
    },
    body: JSON.stringify({ profile, briefing }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: `agent api ${response.status}` },
      { status: 502 },
    );
  }
  const result = await response.json();
  const report = await savePersonalReport(userId, briefing_id, {
    narrative: result.narrative,
    provenance_verified: Boolean(result.provenance_verified),
  });
  return NextResponse.json({ report, cached: false });
}
