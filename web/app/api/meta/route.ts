import { NextResponse } from "next/server";

/** Basket and chokepoint catalogues for the analyst builder, from the engine. */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

export async function GET() {
  try {
    const [baskets, chokepoints, conflicts] = await Promise.all([
      fetch(`${ENGINE}/baskets`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${ENGINE}/chokepoints`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${ENGINE}/conflicts`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    return NextResponse.json({
      baskets: baskets.baskets.map((b: { key: string; label: string; essentiality: string }) => ({
        key: b.key,
        label: b.label,
        essentiality: b.essentiality,
      })),
      chokepoints: chokepoints.chokepoints.map(
        (c: {
          key: string;
          label: string;
          reroute: string;
          attenuation: number;
          note: string;
          lat: number;
          lon: number;
        }) => ({
          key: c.key,
          label: c.label,
          reroute: c.reroute,
          attenuation: c.attenuation,
          note: c.note,
          lat: c.lat,
          lon: c.lon,
        }),
      ),
      conflicts: conflicts.conflicts,
      customConflictCountries: conflicts.custom?.countries ?? [],
    });
  } catch {
    return NextResponse.json({ error: "engine unavailable" }, { status: 503 });
  }
}
