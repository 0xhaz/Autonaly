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
  /** The watchlist this note was written against. Absent on notes written
   *  before notes recorded it — treated as unknown rather than stale, since
   *  claiming a note is wrong when it may not be is its own error. */
  watchlist_key?: string;
}

/**
 * A stable fingerprint of what an analyst watches.
 *
 * A note is only true of the watchlist it was computed against: it names the
 * commodities you follow and rules countries in or out by them. Editing the
 * watchlist does not rewrite existing notes — they are cached per briefing —
 * so without this a card goes on citing criteria you no longer hold, and looks
 * for all the world like a setting that belongs to the card.
 */
export function watchlistKey(
  profile: Pick<AnalystProfile, "baskets" | "countries" | "chokepoints">,
): string {
  return [
    [...profile.baskets].sort().join(","),
    [...profile.countries].sort().join(","),
    [...profile.chokepoints].sort().join(","),
  ].join("|");
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
