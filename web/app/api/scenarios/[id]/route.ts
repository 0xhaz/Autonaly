import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { deleteScenario, getScenario } from "@/lib/scenarios";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scenario = await getScenario(userId, (await params).id);
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ scenario });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const removed = await deleteScenario(userId, (await params).id);
  if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
