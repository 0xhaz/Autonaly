import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { consentUrl, docsConfigured } from "@/lib/googleDocs";

/** Sends the user to Google's consent screen for the drive.file scope. */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!docsConfigured()) {
    return NextResponse.json({ error: "google oauth not configured" }, { status: 503 });
  }
  const origin = request.nextUrl.origin;
  // The Clerk user id doubles as CSRF state: the callback checks it against
  // the session, so a code replayed into someone else's browser is rejected.
  return NextResponse.redirect(consentUrl(origin, userId));
}
