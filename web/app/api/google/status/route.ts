import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { disconnect, docsConfigured, isConnected, listExports } from "@/lib/googleDocs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const connected = docsConfigured() ? await isConnected(userId) : false;
  return NextResponse.json({
    configured: docsConfigured(),
    connected,
    exports: connected ? await listExports(userId) : [],
  });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnect(userId);
  return NextResponse.json({ ok: true });
}
