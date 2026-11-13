// Daily housekeeping, run by the cron job after the problem cache sync.

import "server-only";
import { usersInfo } from "@/lib/codeforces/client";
import { db } from "@/lib/db";
import { advance } from "@/lib/match-engine";
import { finalCheck } from "@/lib/match-poller";

const DAY_MS = 86_400_000;
/** Handles per Codeforces call. Keeps the request URL a sensible length. */
const HANDLES_PER_CALL = 200;

/**
 * Update every linked player's Codeforces rating, 200 players per Codeforces
 * call. Stops early when the time budget runs out.
 */
export async function refreshRatings(deadline: number) {
  const users = await db.user.findMany({
    where: { cfHandle: { not: null } },
    select: { id: true, cfHandle: true, cfRating: true },
  });

  let checked = 0;
  let changed = 0;
  const unknown: string[] = [];

  for (
    let i = 0;
    i < users.length && Date.now() < deadline;
    i += HANDLES_PER_CALL
  ) {
    let handles = users.slice(i, i + HANDLES_PER_CALL).map((u) => u.cfHandle!);

    // One unknown handle (renamed or deleted on Codeforces) fails the whole
    // call. Codeforces names it, so drop it and ask again.
    for (let attempt = 0; attempt < 10 && handles.length > 0; attempt++) {
      const info = await usersInfo(handles, { onBusy: "wait" });
      if (info.ok) {
        const ratings = new Map(
          info.result.map((u) => [u.handle.toLowerCase(), u.rating ?? null]),
        );
        for (const user of users.slice(i, i + HANDLES_PER_CALL)) {
          const rating = ratings.get(user.cfHandle!.toLowerCase());
          if (rating === undefined) continue;
          checked++;
          if (rating !== user.cfRating) {
            await db.user.update({
              where: { id: user.id },
              data: { cfRating: rating },
            });
            changed++;
          }
        }
        break;
      }

      const missing = info.message.match(
        /User with handle (\S+) not found/,
      )?.[1];
      if (info.reason !== "failed" || !missing) break; // Codeforces is down: next run.
      unknown.push(missing);
      handles = handles.filter(
        (h) => h.toLowerCase() !== missing.toLowerCase(),
      );
    }
  }
  return { players: users.length, checked, changed, unknown };
}

/**
 * Clear out what nobody will come back to:
 * - lobbies that were never started within a day, and closed rooms;
 * - live matches whose clock ran out long ago while nobody had them open
 *   (each gets a last Codeforces check while the time budget lasts, then it
 *   is closed with its proper result);
 * - expired handle challenges, sessions and sign-in records.
 */
export async function cleanUp(deadline: number) {
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS);

  const overdue = await db.match.findMany({
    where: { status: "live", endsAt: { lt: new Date(now - 10 * 60_000) } },
    select: { id: true },
    orderBy: { endsAt: "asc" },
    take: 200,
  });
  for (const match of overdue) {
    if (Date.now() < deadline) await finalCheck(match.id);
    // Closes the match even without a check: the grace period is long over.
    await advance(match.id);
  }
  const stillLive = await db.match.count({
    where: { id: { in: overdue.map((m) => m.id) }, status: "live" },
  });

  const [lobbies, cancelled, challenges, sessions, verifications] =
    await db.$transaction([
      db.match.deleteMany({
        where: { status: "lobby", createdAt: { lt: dayAgo } },
      }),
      db.match.deleteMany({
        where: { status: "cancelled", createdAt: { lt: dayAgo } },
      }),
      db.handleChallenge.deleteMany({
        where: { expiresAt: { lt: new Date(now) } },
      }),
      db.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
      db.verification.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    ]);

  return {
    matchesClosed: overdue.length - stillLive,
    lobbiesDeleted: lobbies.count,
    closedRoomsDeleted: cancelled.count,
    challengesDeleted: challenges.count,
    sessionsDeleted: sessions.count,
    signInRecordsDeleted: verifications.count,
  };
}
