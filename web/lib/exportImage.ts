import "server-only";

import { Storage } from "@google-cloud/storage";

/**
 * Park a captured map PNG somewhere Google can fetch it.
 *
 * The Docs API renders an inline image by fetching the URL itself, anonymously
 * — so the object has to be publicly readable for the moment of insertion.
 * These are renders of public trade data, and the bucket has a one-day
 * lifecycle rule, so nothing accumulates and nothing sensitive is exposed.
 */

const BUCKET = process.env.AUTONALY_EXPORT_BUCKET ?? "autonaly-exports";

let storage: Storage | null = null;

export async function uploadMapImage(dataUrl: string): Promise<string | null> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  // A blank canvas still encodes to a few hundred bytes; anything smaller than
  // this is not a map worth embedding.
  if (bytes.length < 5_000 || bytes.length > 8_000_000) return null;

  try {
    storage ??= new Storage();
    const name = `map-${crypto.randomUUID()}.png`;
    await storage.bucket(BUCKET).file(name).save(bytes, {
      contentType: "image/png",
      metadata: { cacheControl: "public, max-age=3600" },
    });
    return `https://storage.googleapis.com/${BUCKET}/${name}`;
  } catch {
    // Illustration is additive; a failed upload must not fail the export.
    return null;
  }
}
