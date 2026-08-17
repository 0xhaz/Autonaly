import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { Briefing } from "./types";

/**
 * Firestore access, server-side only.
 *
 * The Admin SDK routes to the emulator whenever FIRESTORE_EMULATOR_HOST is set,
 * so this file is identical locally and on GCP — the same property the Python
 * side relies on. Nothing here changes at cutover except that variable going away.
 */

const PROJECT_ID = process.env.AUTONALY_PROJECT_ID ?? "autonaly-hackathon";
const COLLECTION = process.env.AUTONALY_BRIEFINGS_COLLECTION ?? "briefings";

function db() {
  if (getApps().length === 0) {
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    initializeApp({
      projectId: PROJECT_ID,
      // Against the emulator no credential is needed or wanted. In cloud, Cloud
      // Run's default service account is used unless one is supplied explicitly.
      ...(credentialsJson ? { credential: cert(JSON.parse(credentialsJson)) } : {}),
    });
  }
  return getFirestore();
}

export async function listBriefings(): Promise<Briefing[]> {
  const snapshot = await db().collection(COLLECTION).get();
  return snapshot.docs
    .map((doc) => doc.data() as Briefing)
    .filter((b) => !b.id?.startsWith("_smoke"))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

export async function getBriefing(id: string): Promise<Briefing | null> {
  const doc = await db().collection(COLLECTION).doc(id).get();
  return doc.exists ? (doc.data() as Briefing) : null;
}

export async function approveBriefing(id: string): Promise<void> {
  await db()
    .collection(COLLECTION)
    .doc(id)
    .update({ status: "published", published_at: new Date().toISOString() });
}

export async function rejectBriefing(id: string): Promise<void> {
  await db().collection(COLLECTION).doc(id).update({ status: "rejected" });
}
