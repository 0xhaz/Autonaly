import { NextRequest, NextResponse } from "next/server";

/**
 * Port-blockage simulation.
 *
 * Grounded, not guessed: IMF PortWatch publishes each port's share of its
 * country's maritime trade, so "close Rotterdam" becomes "remove 68.1% of the
 * Netherlands' export capacity, scaled by how much of the port is lost". The
 * engine then scores the world's dependency on that country as usual.
 *
 * Stated assumption, carried in the response: no diversion to other national
 * ports beyond what the severity slider grants, and the whole commodity
 * catalogue is affected uniformly — a port does not pick which goods it stops.
 */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

let basketKeys: string[] | null = null;
async function allBaskets(): Promise<string[]> {
  if (basketKeys) return basketKeys;
  const response = await fetch(`${ENGINE}/baskets`, { cache: "no-store" });
  const data = await response.json();
  basketKeys = data.baskets.map((b: { key: string }) => b.key);
  return basketKeys!;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const country = String(body.country ?? "");
  const portShare = Math.min(1, Math.max(0, Number(body.port_share ?? 0)));
  const severity = Math.min(1, Math.max(0, Number(body.severity ?? 1)));
  const duration = Math.min(24, Math.max(0, Math.round(Number(body.duration_months ?? 3))));

  if (!country || portShare <= 0) {
    return NextResponse.json({ error: "country and port_share required" }, { status: 422 });
  }

  const transitReduction = Math.round(portShare * severity * 10000) / 10000;

  const response = await fetch(`${ENGINE}/exposure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event_key: `simulation-port-${country}`,
      sources: [country],
      baskets: await allBaskets(),
      severity: {
        label: "simulated port blockage",
        transit_reduction: transitReduction,
        duration_months: duration,
      },
      top_n: 20,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json({ error: `engine ${response.status}` }, { status: 502 });
  }
  const rankings = await response.json();
  return NextResponse.json({
    ...rankings,
    assumption: {
      port_share: portShare,
      severity,
      effective_reduction: transitReduction,
      note:
        "Effective reduction = the port's share of the country's maritime exports × the share of the port lost. Assumes no further diversion to other national ports and uniform impact across commodities.",
    },
  });
}
