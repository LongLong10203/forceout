import "server-only";
import { db } from "@/lib/db";
import { getMode } from "@/lib/modes";
import type { PlayerOutcome } from "@/lib/room-types";

export type ProfileMatch = {
  code: string;
  modeName: string;
  /** ISO time the match ended. */
  endedAt: string | null;
  outcome: PlayerOutcome | null;
  score: number;
  opponents: { handle: string; score: number }[];
};

export type Profile = {
  handle: string;
  rating: number | null;
  record: Record<PlayerOutcome, number>;
  /** The most recent finished matches, newest first. */
  matches: ProfileMatch[];
};

const HISTORY_LIMIT = 50;

/** A player's public profile, or null if nobody has linked that handle. */
export async function getProfile(handle: string): Promise<Profile | null> {
  const user = await db.user.findFirst({
    where: { cfHandle: { equals: handle, mode: "insensitive" } },
    select: { id: true, cfHandle: true, cfRating: true },
  });
  if (!user?.cfHandle) return null;

  const finished = { userId: user.id, match: { status: "finished" as const } };
  const [counts, rows] = await Promise.all([
    db.matchPlayer.groupBy({ by: ["outcome"], where: finished, _count: true }),
    db.matchPlayer.findMany({
      where: finished,
      orderBy: { match: { endsAt: "desc" } },
      take: HISTORY_LIMIT,
      include: {
        match: {
          include: {
            players: {
              orderBy: { seat: "asc" },
              include: { user: { select: { cfHandle: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const record: Profile["record"] = { win: 0, loss: 0, draw: 0, forfeit: 0 };
  for (const row of counts) {
    if (row.outcome) record[row.outcome] = row._count;
  }

  return {
    handle: user.cfHandle,
    rating: user.cfRating,
    record,
    matches: rows.map((row) => ({
      code: row.match.code,
      modeName: getMode(row.match.mode)?.name ?? row.match.mode,
      endedAt: row.match.endsAt?.toISOString() ?? null,
      outcome: row.outcome,
      score: row.score,
      opponents: row.match.players
        .filter((p) => p.userId !== user.id)
        .map((p) => ({
          handle: p.user.cfHandle ?? p.user.name,
          score: p.score,
        })),
    })),
  };
}
