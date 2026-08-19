import { NextRequest, NextResponse } from "next/server";

/** One curated historical crisis as a full report. Public, like the atlas. */

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const response = await fetch(`${ENGINE}/history-event/${encodeURIComponent(key)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json({ error: "not found" }, { status: response.status });
  }
  return NextResponse.json(await response.json());
}
