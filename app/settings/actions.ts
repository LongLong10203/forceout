"use server";

import { revalidatePath } from "next/cache";
import {
  cancelChallenge,
  checkChallenge,
  startChallenge,
} from "@/lib/handle-verification";
import { requireUser } from "@/lib/session";

export type ActionState = { error?: string };

export async function startChallengeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/settings");
  const result = await startChallenge(
    user.id,
    String(formData.get("handle") ?? ""),
  );
  revalidatePath("/settings");
  return result.ok ? {} : { error: result.error };
}

export async function checkChallengeAction(): Promise<ActionState> {
  const user = await requireUser("/settings");
  const result = await checkChallenge(user.id);
  revalidatePath("/", "layout");
  return result.ok ? {} : { error: result.error };
}

export async function cancelChallengeAction(): Promise<ActionState> {
  const user = await requireUser("/settings");
  await cancelChallenge(user.id);
  revalidatePath("/settings");
  return {};
}
