import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Auth boundary.
 *
 * Public: the landing map, published briefings, and the read-only country API —
 * the knowledge-base surface a stranger should be able to reach.
 * Protected: the personal dashboard (your analyst, your reports) and the
 * operator's review queue.
 */
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/review(.*)",
  "/api/personalize(.*)",
  "/api/scenario-brief(.*)",
  "/api/profile(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) await auth.protect();
});

export const config = {
  matcher: [
    // Everything except static files and _next internals; always run on APIs.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|geo\\.json|json)).*)",
    "/(api|trpc)(.*)",
  ],
};
