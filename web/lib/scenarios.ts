import "server-only";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Saved simulator scenarios, keyed by Clerk userId.
 *
 * A saved scenario stores the *parameters*, not the computed tables: the
 * engine is deterministic, so reopening replays the run and reproduces the
 * numbers on the current artifact vintage. The one thing that cannot be
 * recomputed — the desk's brief the user asked for — is stored verbatim.
 */

const PROJECT_ID = process.env.AUTONALY_PROJECT_ID ?? "autonaly-hackathon";
const COLLECTION = "saved_scenarios";

export interface SavedScenario {
  id: string;
  user_id: string;
  mode: "chokepoint" | "port" | "conflict";
  label: string;
  headline: string;
  params: Record<string, unknown>;
  brief: string | null;
  created_at: string;
}

function db() {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

export async function listScenarios(userId: string): Promise<SavedScenario[]> {
  const snapshot = await db()
    .collection(COLLECTION)
    .where("user_id", "==", userId)
    .get();
  return snapshot.docs
    .map((doc) => doc.data() as SavedScenario)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getScenario(
  userId: string,
  id: string,
): Promise<SavedScenario | null> {
  const snap = await db().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as SavedScenario;
  // Ownership check at the data layer, not just the route.
  return data.user_id === userId ? data : null;
}

export async function saveScenario(
  userId: string,
  input: Omit<SavedScenario, "id" | "user_id" | "created_at">,
): Promise<SavedScenario> {
  const full: SavedScenario = {
    ...input,
    id: crypto.randomUUID(),
    user_id: userId,
    created_at: new Date().toISOString(),
  };
  await db().collection(COLLECTION).doc(full.id).set(full);
  return full;
}

export async function deleteScenario(userId: string, id: string): Promise<boolean> {
  const existing = await getScenario(userId, id);
  if (!existing) return false;
  await db().collection(COLLECTION).doc(id).delete();
  return true;
}
