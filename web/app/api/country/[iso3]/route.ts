import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies the exposure engine's country profile to the browser.
 *
 * The engine is an internal service — on Cloud Run it is not public — so the
 * click-to-inspect panel goes through the server rather than calling it directly.
 */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ iso3: string }> },
) {
  const { iso3 } = await params;
  const search = request.nextUrl.searchParams;

  const url = new URL(`${ENGINE}/country/${encodeURIComponent(iso3)}`);
  for (const key of ["baskets", "sources", "top_n"]) {
    const value = search.get(key);
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: `engine returned ${response.status}` },
      { status: response.status },
    );
  }
  return NextResponse.json(await response.json());
}
