import "server-only";

/**
 * Service-to-service auth for private Cloud Run calls.
 *
 * The agent API is deployed private because every request to it spends Vertex
 * tokens — a public endpoint would be a billable abuse surface, and the web
 * app is its only legitimate caller. Cloud Run accepts a Google-signed ID
 * token whose audience is the target service URL; the metadata server mints
 * one for the runtime service account.
 *
 * Locally there is no metadata server and the target is plain HTTP, so the
 * helper returns no header and the call goes out unauthenticated — which is
 * exactly right against a local uvicorn.
 */

const METADATA_IDENTITY =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

export async function serviceAuthHeaders(audience: string): Promise<HeadersInit> {
  if (!audience.startsWith("https://")) return {};
  try {
    const response = await fetch(
      `${METADATA_IDENTITY}?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" },
    );
    if (!response.ok) return {};
    return { Authorization: `Bearer ${(await response.text()).trim()}` };
  } catch {
    // No metadata server (local dev, or a platform that does not provide one).
    return {};
  }
}
