import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { exchangeCode } from "@/lib/googleDocs";

/** Google returns here with a code; we trade it for a refresh token. */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const params = request.nextUrl.searchParams;
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/dashboard?docs=${status}`, request.nextUrl.origin));

  if (!userId) return back("unauthorized");
  if (params.get("error")) return back("denied");
  if (params.get("state") !== userId) return back("bad_state");

  const code = params.get("code");
  if (!code) return back("no_code");

  const ok = await exchangeCode(userId, code, request.nextUrl.origin);
  return back(ok ? "connected" : "failed");
}
