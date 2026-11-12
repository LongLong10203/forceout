import "server-only";
import { randomInt } from "node:crypto";
import { problemUrl } from "@/lib/codeforces/problem-cache";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getMode } from "@/lib/modes";
import type { BaseState, ProblemInfo } from "@/lib/modes/types";
import {
  ROOM_CODE_LENGTH,
  roomSettingsSchema,
  type MatchResult,
  type RoomBoard,
  type RoomConfig,
  type RoomSnapshot,
} from "@/lib/room-types";

export type RoomResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string };

// No 0/O or 1/I/L, so a code is easy to read out loud and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/** A match with everything needed to draw or advance it. */
export const fullMatch = {
  players: {
    orderBy: { seat: "asc" },
    include: {
      user: { select: { cfHandle: true, cfRating: true, name: true } },
    },
  },
  problems: { orderBy: { slot: "asc" }, include: { problem: true } },
} satisfies Prisma.MatchInclude;

export type FullMatch = Prisma.MatchGetPayload<{ include: typeof fullMatch }>;

/** Why the host cannot start yet, or null. */
export function startBlockedBy(match: {
  mode: string;
  hostId: string;
  players: { userId: string; ready: boolean }[];
}): string | null {
  const mode = getMode(match.mode);
  if (!mode) return "Unknown game mode.";
  if (match.players.length < mode.minPlayers) {
    const missing = mode.minPlayers - match.players.length;
    return `Waiting for ${missing} more player${missing === 1 ? "" : "s"}.`;
  }
  if (match.players.length > mode.maxPlayers) {
    return `${mode.name} allows at most ${mode.maxPlayers} players.`;
  }
  const notReady = match.players.filter(
    (p) => p.userId !== match.hostId && !p.ready,
  );
  if (notReady.length > 0) return "Waiting for everyone to be ready.";
  return null;
}

/** The board without the problems players may not see yet. */
function publicBoard(match: FullMatch): RoomBoard | null {
  const mode = getMode(match.mode);
  const state = match.state as BaseState | null;
  if (!mode || !state) return null;

  const visible = new Set(mode.visibleSlots(state));
  const problems: Record<string, ProblemInfo> = {};
  for (const row of match.problems) {
    if (!visible.has(row.slot)) continue;
    problems[row.problemId] = {
      id: row.problem.id,
      name: row.problem.name,
      rating: row.problem.rating,
      url: problemUrl(row.problem.contestId, row.problem.index),
    };
  }
  return {
    state: {
      ...state,
      slots: state.slots.map((slot) =>
        visible.has(slot.slot) ? slot : { ...slot, problemId: null },
      ),
    },
    problems,
  };
}

export function toSnapshot(match: FullMatch): RoomSnapshot {
  const mode = getMode(match.mode);
  const { mode: modeConfig, ...settings } =
    match.config as unknown as RoomConfig;
  return {
    code: match.code,
    status: match.status,
    version: match.version,
    mode: {
      id: match.mode,
      name: mode?.name ?? match.mode,
      summary: mode?.describeConfig(modeConfig) ?? "",
      ownClock: Boolean(mode?.matchDurationMs),
    },
    settings,
    minPlayers: mode?.minPlayers ?? 2,
    maxPlayers: mode?.maxPlayers ?? 2,
    players: match.players.map((p) => ({
      userId: p.userId,
      handle: p.user.cfHandle ?? p.user.name,
      rating: p.user.cfRating,
      seat: p.seat,
      ready: p.ready,
      isHost: p.userId === match.hostId,
      score: p.score,
      outcome: p.outcome,
    })),
    startBlockedBy: match.status === "lobby" ? startBlockedBy(match) : null,
    startsAt: match.startsAt?.toISOString() ?? null,
    endsAt: match.endsAt?.toISOString() ?? null,
    board: publicBoard(match),
    result: (match.result as MatchResult | null) ?? null,
  };
}

export async function getRoomSnapshot(
  code: string,
): Promise<RoomSnapshot | null> {
  const match = await db.match.findUnique({
    where: { code },
    include: fullMatch,
  });
  return match ? toSnapshot(match) : null;
}

/** Only the version and status, for the cheap "anything new?" check. */
export async function getRoomVersion(code: string) {
  return db.match.findUnique({
    where: { code },
    select: { version: true, status: true },
  });
}

export async function createRoom(
  hostId: string,
  input: { modeId: string; settings: unknown; modeConfig: unknown },
): Promise<RoomResult<{ code: string }>> {
  const mode = getMode(input.modeId);
  if (!mode) return { ok: false, error: "Pick a game mode." };

  const settings = roomSettingsSchema.safeParse(input.settings);
  if (!settings.success)
    return { ok: false, error: settings.error.issues[0].message };

  const modeConfig = mode.configSchema.safeParse(input.modeConfig);
  if (!modeConfig.success) {
    return {
      ok: false,
      error: `${mode.name}: ${modeConfig.error.issues[0].message}`,
    };
  }

  const config: RoomConfig = {
    ...settings.data,
    mode: modeConfig.data as Record<string, unknown>,
  };

  // A code collision is very unlikely; retry a few times if it happens.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const match = await db.match.create({
        data: {
          code: randomCode(),
          hostId,
          mode: mode.id,
          config: config as unknown as Prisma.InputJsonValue,
          players: { create: { userId: hostId, seat: 0, ready: true } },
        },
      });
      return { ok: true, code: match.code };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return { ok: false, error: "Could not create a room. Try again." };
}

export async function joinRoom(
  code: string,
  userId: string,
): Promise<RoomResult> {
  try {
    return await db.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { code },
        include: { players: { select: { userId: true, seat: true } } },
      });
      if (!match) return { ok: false, error: `No room with the code ${code}.` };
      if (match.players.some((p) => p.userId === userId)) return { ok: true };
      if (match.status !== "lobby") {
        return { ok: false, error: "This match has already started." };
      }

      const mode = getMode(match.mode);
      if (mode && match.players.length >= mode.maxPlayers) {
        return { ok: false, error: "This room is full." };
      }

      const taken = new Set(match.players.map((p) => p.seat));
      let seat = 0;
      while (taken.has(seat)) seat++;

      await tx.matchPlayer.create({
        data: { matchId: match.id, userId, seat },
      });
      await tx.match.update({
        where: { id: match.id },
        data: { version: { increment: 1 } },
      });
      return { ok: true };
    });
  } catch (error) {
    // Two players took the same seat at the same moment.
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "Someone joined at the same time. Try again.",
      };
    }
    throw error;
  }
}

export async function setReady(
  code: string,
  userId: string,
  ready: boolean,
): Promise<RoomResult> {
  const match = await db.match.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!match) return { ok: false, error: "Room not found." };

  const [changed] = await db.$transaction([
    db.matchPlayer.updateMany({
      where: { matchId: match.id, userId, match: { status: "lobby" } },
      data: { ready },
    }),
    db.match.update({
      where: { id: match.id },
      data: { version: { increment: 1 } },
    }),
  ]);
  return changed.count === 1
    ? { ok: true }
    : { ok: false, error: "You can only change this in the lobby." };
}

/** A player leaves the lobby. If the host leaves, the room is closed. */
export async function leaveRoom(
  code: string,
  userId: string,
): Promise<RoomResult> {
  const match = await db.match.findUnique({
    where: { code },
    select: { id: true, hostId: true, status: true },
  });
  if (!match) return { ok: false, error: "Room not found." };
  if (match.status !== "lobby") {
    return { ok: false, error: "The match has started. Forfeit instead." };
  }

  if (match.hostId === userId) {
    await db.match.update({
      where: { id: match.id },
      data: { status: "cancelled", version: { increment: 1 } },
    });
  } else {
    await db.$transaction([
      db.matchPlayer.deleteMany({ where: { matchId: match.id, userId } }),
      db.match.update({
        where: { id: match.id },
        data: { version: { increment: 1 } },
      }),
    ]);
  }
  return { ok: true };
}

/** Every tag in the problem cache, for the tag filters. */
export async function getAllTags(): Promise<string[]> {
  "use cache";
  const rows = await db.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM problems ORDER BY tag`;
  return rows.map((row) => row.tag);
}

export type ActiveRoom = {
  code: string;
  status: "lobby" | "live";
  modeName: string;
  opponents: string[];
  /**
   * The clock has run out, but nobody has opened the room since, so the
   * match has not been closed yet. Opening it closes it.
   */
  timeUp: boolean;
};

/**
 * The rooms a player is still part of: lobbies they joined and live matches
 * they have not forfeited. A match keeps running when a player closes the
 * tab, so the site shows these as a way back in.
 */
export async function getActiveRooms(userId: string): Promise<ActiveRoom[]> {
  const matches = await db.match.findMany({
    where: {
      players: { some: { userId, outcome: null } },
      // A lobby nobody started within a day is forgotten, not listed forever.
      OR: [
        { status: "live" },
        {
          status: "lobby",
          createdAt: { gt: new Date(Date.now() - 86_400_000) },
        },
      ],
    },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 5,
    include: {
      players: {
        orderBy: { seat: "asc" },
        include: { user: { select: { cfHandle: true, name: true } } },
      },
    },
  });
  return matches.map((match) => ({
    code: match.code,
    status: match.status as "lobby" | "live",
    modeName: getMode(match.mode)?.name ?? match.mode,
    opponents: match.players
      .filter((p) => p.userId !== userId)
      .map((p) => p.user.cfHandle ?? p.user.name),
    timeUp:
      match.status === "live" && !!match.endsAt && match.endsAt <= new Date(),
  }));
}
