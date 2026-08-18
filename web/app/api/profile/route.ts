import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getProfile, saveProfile } from "@/lib/profile";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ profile: await getProfile(userId) });
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const clean = {
    analyst_name: String(body.analyst_name ?? "").slice(0, 60) || "My analyst",
    baskets: (body.baskets ?? []).slice(0, 12).map(String),
    countries: (body.countries ?? []).slice(0, 12).map(String),
    chokepoints: (body.chokepoints ?? []).slice(0, 6).map(String),
  };
  if (clean.baskets.length === 0 && clean.countries.length === 0) {
    return NextResponse.json(
      { error: "watch at least one commodity or country" },
      { status: 422 },
    );
  }
  await saveProfile(userId, clean);
  return NextResponse.json({ ok: true });
}
