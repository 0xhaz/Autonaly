import "server-only";

import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";

/**
 * Analyst profiles and cached personal reports, keyed by Clerk userId.
 *
 * Same Firestore the desk writes briefings to — emulator locally, real after
 * cutover — so a user's analyst lives beside the events it reads.
 */

const PROJECT_ID = process.env.AUTONALY_PROJECT_ID ?? "autonaly-hackathon";

export interface AnalystProfile {
  analyst_name: string;
  baskets: string[];
  countries: string[];
  chokepoints: string[];
  created_at: string;
  updated_at: string;
}

export interface PersonalReport {
  narrative: string;
  briefing_id: string;
  generated_at: string;
  provenance_verified: boolean;
}

function db() {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

export async function getProfile(userId: string): Promise<AnalystProfile | null> {
  const snap = await db().collection("analyst_profiles").doc(userId).get();
  return snap.exists ? (snap.data() as AnalystProfile) : null;
}

export async function saveProfile(
  userId: string,
  profile: Omit<AnalystProfile, "created_at" | "updated_at">,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getProfile(userId);
  await db()
    .collection("analyst_profiles")
    .doc(userId)
    .set({ ...profile, created_at: existing?.created_at ?? now, updated_at: now });
}

export async function getPersonalReport(
  userId: string,
  briefingId: string,
): Promise<PersonalReport | null> {
  const snap = await db()
    .collection("personal_reports")
    .doc(`${userId}__${briefingId}`)
    .get();
  return snap.exists ? (snap.data() as PersonalReport) : null;
}

export async function savePersonalReport(
  userId: string,
  briefingId: string,
  report: Omit<PersonalReport, "generated_at" | "briefing_id">,
): Promise<PersonalReport> {
  const full: PersonalReport = {
    ...report,
    briefing_id: briefingId,
    generated_at: new Date().toISOString(),
  };
  await db().collection("personal_reports").doc(`${userId}__${briefingId}`).set(full);
  return full;
}
