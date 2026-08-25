import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { disconnect, docsConfigured, isConnected } from "@/lib/googleDocs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    configured: docsConfigured(),
    connected: docsConfigured() ? await isConnected(userId) : false,
  });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnect(userId);
  return NextResponse.json({ ok: true });
}
