"use server";

import { revalidatePath } from "next/cache";

import { approveBriefing, rejectBriefing } from "@/lib/firestore";

/**
 * The human gate. Nothing reaches `published` without one of these being called
 * by a person — the agent has no path to this state.
 */

export async function approve(id: string) {
  await approveBriefing(id);
  revalidatePath("/");
  revalidatePath(`/briefing/${id}`);
}

export async function reject(id: string) {
  await rejectBriefing(id);
  revalidatePath("/");
  revalidatePath(`/briefing/${id}`);
}
