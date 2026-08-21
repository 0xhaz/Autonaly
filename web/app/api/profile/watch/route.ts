import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getProfile, saveProfile } from "@/lib/profile";

/**
 * Toggle a country on the analyst's watchlist from the atlas.
 *
 * "Save this country for reference" and "watch this country" are one concept
 * on purpose: a watched country appears on the dashboard AND triggers
 * proactive notes when an event touches it. A user with no analyst yet gets a
 * minimal profile created around their first watched country.
 */

const MAX_COUNTRIES = 12;

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const iso3 = String(body.country ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    return NextResponse.json({ error: "country must be ISO3" }, { status: 422 });
  }

  const existing = await getProfile(userId);
  const countries = new Set(existing?.countries ?? []);
  const watched = countries.has(iso3);
  if (watched) countries.delete(iso3);
  else {
    if (countries.size >= MAX_COUNTRIES) {
      return NextResponse.json(
        { error: `watchlist is full (${MAX_COUNTRIES} countries)` },
        { status: 422 },
      );
    }
    countries.add(iso3);
  }

  await saveProfile(userId, {
    analyst_name: existing?.analyst_name ?? "My analyst",
    baskets: existing?.baskets ?? [],
    countries: [...countries],
    chokepoints: existing?.chokepoints ?? [],
  });
  return NextResponse.json({ watched: !watched, countries: [...countries] });
}
