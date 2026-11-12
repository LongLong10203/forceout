"use server";

import { redirect } from "next/navigation";
import { ROOM_CODE_LENGTH, normalizeRoomCode } from "@/lib/room-types";
import { createRoom, joinRoom } from "@/lib/rooms";
import { requireVerifiedUser } from "@/lib/session";

export type PlayActionState = { error?: string };

export async function createRoomAction(
  _prev: PlayActionState,
  formData: FormData,
): Promise<PlayActionState> {
  const user = await requireVerifiedUser("/play");

  // Mode settings arrive as "mode.<key>" fields.
  const modeConfig: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("mode.")) modeConfig[key.slice(5)] = value;
  }

  const result = await createRoom(user.id, {
    modeId: String(formData.get("mode") ?? ""),
    settings: {
      // Missing for modes with their own clock; the default applies then.
      durationMinutes: formData.get("durationMinutes") ?? undefined,
      ratingMin: formData.get("ratingMin"),
      ratingMax: formData.get("ratingMax"),
      includeTags: formData.getAll("includeTags").map(String),
      excludeTags: formData.getAll("excludeTags").map(String),
    },
    modeConfig,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/room/${result.code}`);
}

export async function joinByCodeAction(
  _prev: PlayActionState,
  formData: FormData,
): Promise<PlayActionState> {
  const user = await requireVerifiedUser("/play");
  const code = normalizeRoomCode(String(formData.get("code") ?? ""));
  if (code.length !== ROOM_CODE_LENGTH) {
    return { error: `A room code has ${ROOM_CODE_LENGTH} characters.` };
  }

  const result = await joinRoom(code, user.id);
  if (!result.ok) return { error: result.error };
  redirect(`/room/${code}`);
}
