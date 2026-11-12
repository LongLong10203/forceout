"use server";

import { devAccountsEnabled } from "@/lib/dev-accounts";
import { fakeSolve, forfeit, startMatch } from "@/lib/match-engine";
import { requestCheck } from "@/lib/match-poller";
import { normalizeRoomCode } from "@/lib/room-types";
import { joinRoom, leaveRoom, setReady } from "@/lib/rooms";
import { requireVerifiedUser } from "@/lib/session";

export type RoomActionState = { error?: string; info?: string };

async function context(rawCode: string) {
  const code = normalizeRoomCode(rawCode);
  const user = await requireVerifiedUser(`/room/${code}`);
  return { code, user };
}

const toState = (result: { ok: true } | { ok: false; error: string }) =>
  result.ok ? {} : { error: result.error };

export async function joinRoomAction(
  rawCode: string,
): Promise<RoomActionState> {
  const { code, user } = await context(rawCode);
  return toState(await joinRoom(code, user.id));
}

export async function setReadyAction(
  rawCode: string,
  ready: boolean,
): Promise<RoomActionState> {
  const { code, user } = await context(rawCode);
  return toState(await setReady(code, user.id, ready));
}

export async function leaveRoomAction(
  rawCode: string,
): Promise<RoomActionState> {
  const { code, user } = await context(rawCode);
  return toState(await leaveRoom(code, user.id));
}

export async function startMatchAction(
  rawCode: string,
): Promise<RoomActionState> {
  const { code, user } = await context(rawCode);
  return toState(await startMatch(code, user.id));
}

export async function forfeitAction(rawCode: string): Promise<RoomActionState> {
  const { code, user } = await context(rawCode);
  return toState(await forfeit(code, user.id));
}

/** The "Check my submissions" button. */
export async function checkMySubmissionsAction(
  rawCode: string,
): Promise<RoomActionState> {
  const { code, user } = await context(rawCode);
  const result = await requestCheck(code, user.id);
  return result.ok ? { info: result.message } : { error: result.error };
}

/**
 * Development only. Claims a problem for any player in the room, so one
 * person can play both sides of a test match.
 */
export async function devFakeSolveAction(
  rawCode: string,
  slot: number,
  solverId: string,
): Promise<RoomActionState> {
  if (!devAccountsEnabled) return { error: "Fake solves are disabled." };
  const { code } = await context(rawCode);
  return toState(await fakeSolve(code, slot, solverId));
}
