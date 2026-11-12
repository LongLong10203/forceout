// Finds real solves: reads players' recent Codeforces submissions and hands
// Accepted ones to the match engine. There is no background worker, so this
// runs inside the sync requests that the players' browsers make.

import "server-only";
import { userStatus } from "@/lib/codeforces/client";
import type { CfFailureReason } from "@/lib/codeforces/types";
import { db } from "@/lib/db";
import { advance, claimableSlots, recordSolves } from "@/lib/match-engine";
import type { SolveEvent } from "@/lib/modes/types";
import { fullMatch, type FullMatch } from "@/lib/rooms";

/** How many recent submissions to read per check. */
const RECENT_SUBMISSIONS = 20;
/** Cooldown of the "Check my submissions" button. */
export const CHECK_COOLDOWN_MS = 15_000;

type Player = FullMatch["players"][number];

type PlayerCheck =
  | {
      ok: true;
      userId: string;
      /** Accepted submissions on open board problems, inside the match window. */
      solves: SolveEvent[];
      /** When we asked Codeforces. */
      checkedAt: Date;
      /** Everything the player submitted up to here is judged and seen. */
      checkedThrough: Date;
    }
  | { ok: false; userId: string; reason: CfFailureReason };

/** Read one player's recent submissions and pick out what matters for this match. */
async function checkPlayer(
  match: FullMatch,
  player: Player,
  onBusy: "skip" | "wait",
  maxWaitMs = 20_000,
): Promise<PlayerCheck> {
  const userId = player.userId;
  const checkedAt = new Date();
  const clean: PlayerCheck = {
    ok: true,
    userId,
    solves: [],
    checkedAt,
    checkedThrough: checkedAt,
  };

  const handle = player.user.cfHandle;
  if (!handle) return clean;

  const recent = await userStatus(
    handle,
    { count: RECENT_SUBMISSIONS },
    { onBusy, maxWaitMs },
  );
  if (!recent.ok) {
    // "failed" is a real answer: Codeforces does not know this handle (a dev
    // account), so there is nothing to find.
    return recent.reason === "failed"
      ? clean
      : { ok: false, userId, reason: recent.reason };
  }

  const slots = claimableSlots(match);
  const endsAt = match.endsAt!.getTime();
  const solves: SolveEvent[] = [];
  let earliestPending = Infinity;

  for (const submission of recent.result) {
    const slot = slots.find(
      (s) =>
        s.contestId === submission.problem.contestId &&
        s.index === submission.problem.index,
    );
    if (!slot) continue;

    // Codeforces submission time, not the time we noticed it.
    const at = submission.creationTimeSeconds * 1000;
    if (at < slot.notBefore || at > endsAt) continue;

    if (submission.verdict === "OK") {
      solves.push({ slot: slot.slot, userId, at, submissionId: submission.id });
    } else if (!submission.verdict || submission.verdict === "TESTING") {
      earliestPending = Math.min(earliestPending, at);
    }
  }

  return {
    ok: true,
    userId,
    solves,
    checkedAt,
    // A submission still being judged might turn into a solve, so we cannot
    // vouch for anything from that moment on.
    checkedThrough:
      earliestPending === Infinity ? checkedAt : new Date(earliestPending - 1),
  };
}

async function saveChecks(matchId: string, checks: PlayerCheck[]) {
  for (const check of checks) {
    if (!check.ok) continue;
    await db.matchPlayer.update({
      where: { matchId_userId: { matchId, userId: check.userId } },
      data: {
        lastCheckedAt: check.checkedAt,
        checkedThrough: check.checkedThrough,
      },
    });
  }
}

/** Move a player to the back of the queue without vouching for anything. */
async function touch(matchId: string, userId: string) {
  await db.matchPlayer.update({
    where: { matchId_userId: { matchId, userId } },
    data: { lastCheckedAt: new Date() },
  });
}

export type CheckOutcome =
  /** The rate-limit slot was taken; nothing was checked. */
  | "busy"
  /** Codeforces did not answer. Tried again on a later sync. */
  | "unavailable"
  | "nothing_new"
  | "claimed"
  /** Found a solve, but could not yet confirm nobody else was earlier. */
  | "undecided"
  | "not_playing";

/**
 * Check one player and record what they solved, fairly.
 *
 * The risk: player A solves first but is checked late, while player B solves
 * later and is checked first. So when a check finds an Accepted submission on
 * an open problem, this same request checks every other player in the match
 * before it writes the claim, and the problem goes to the earliest submission.
 *
 * A player is skipped when their `checkedThrough` is already past that
 * submission's time: anything they solved earlier is recorded by now.
 */
export async function checkAndClaim(
  matchId: string,
  userId: string,
  onBusy: "skip" | "wait",
  maxWaitMs?: number,
): Promise<CheckOutcome> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: fullMatch,
  });
  const player = match?.players.find((p) => p.userId === userId);
  if (
    !match ||
    match.status !== "live" ||
    !match.endsAt ||
    !player ||
    player.outcome
  ) {
    return "not_playing";
  }

  const first = await checkPlayer(match, player, onBusy, maxWaitMs);
  if (!first.ok) {
    if (first.reason === "rate_limited") return "busy";
    await touch(match.id, userId);
    return "unavailable";
  }

  const checks: PlayerCheck[] = [first];
  // How many solves the mode accepted (in Blitz, a late one does not count).
  let counted = 0;
  if (first.solves.length > 0) {
    const latest = Math.max(...first.solves.map((s) => s.at));

    for (const other of match.players) {
      if (other.userId === userId || other.outcome) continue;
      if (other.checkedThrough && other.checkedThrough.getTime() > latest)
        continue;

      const check = await checkPlayer(match, other, "wait");
      if (!check.ok || check.checkedThrough.getTime() <= latest) {
        // We cannot tell who was first yet. Write nothing: the solve is
        // still on Codeforces and will be found again on the next check.
        // `checkedThrough` is left alone on purpose, so nobody is skipped
        // on the strength of a claim that was never recorded.
        await touch(match.id, userId);
        return "undecided";
      }
      checks.push(check);
    }

    counted = await recordSolves(
      match.id,
      checks.flatMap((c) => (c.ok ? c.solves : [])),
    );
  }

  await saveChecks(match.id, checks);
  return counted > 0 ? "claimed" : "nothing_new";
}

/**
 * Routine polling: check the one player, in any live match, who was checked
 * longest ago. Players who pressed "Check my submissions" go first. Does
 * nothing if the rate-limit slot is taken.
 */
async function pollNextPlayer(): Promise<void> {
  const [next] = await db.$queryRaw<{ match_id: string; user_id: string }[]>`
    SELECT mp.match_id, mp.user_id
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.status = 'live' AND m.ends_at > now() AND mp.outcome IS NULL
    ORDER BY
      (mp.check_requested_at IS NOT NULL
        AND (mp.last_checked_at IS NULL OR mp.check_requested_at > mp.last_checked_at)) DESC,
      mp.last_checked_at ASC NULLS FIRST
    LIMIT 1`;
  if (next) await checkAndClaim(next.match_id, next.user_id, "skip");
}

/**
 * The clock has run out: check every player one last time, so a solve in the
 * final seconds still counts, then let the engine close the match.
 * If Codeforces does not answer, the next sync tries again; the engine closes
 * the match anyway after a grace period.
 */
async function finalCheck(matchId: string): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: fullMatch,
  });
  if (!match || match.status !== "live" || !match.endsAt) return;
  const endsAt = match.endsAt.getTime();

  const checks: PlayerCheck[] = [];
  for (const player of match.players) {
    if (player.outcome) continue;
    if (player.checkedThrough && player.checkedThrough.getTime() >= endsAt)
      continue;
    const check = await checkPlayer(match, player, "wait");
    if (!check.ok) return;
    checks.push(check);
  }

  // Solves first, then the marks that tell the engine the check is done.
  const solves = checks.flatMap((c) => (c.ok ? c.solves : []));
  if (solves.length > 0) await recordSolves(match.id, solves);
  await saveChecks(match.id, checks);
  await advance(match.id);
}

/**
 * Called by the sync endpoint on every request. A failure here must never
 * break the sync, and never changes a match.
 */
export async function pollCodeforces(code: string): Promise<void> {
  try {
    const room = await db.match.findUnique({
      where: { code },
      select: { id: true, status: true, endsAt: true },
    });
    if (
      room?.status === "live" &&
      room.endsAt &&
      room.endsAt.getTime() <= Date.now()
    ) {
      await finalCheck(room.id);
    } else {
      await pollNextPlayer();
    }
  } catch (error) {
    console.error("Codeforces poll failed", error);
  }
}

export type RequestCheckResult =
  { ok: true; message: string } | { ok: false; error: string };

/** The "Check my submissions" button: check this player now, or put them first in line. */
export async function requestCheck(
  code: string,
  userId: string,
): Promise<RequestCheckResult> {
  const player = await db.matchPlayer.findFirst({
    where: { userId, outcome: null, match: { code, status: "live" } },
    select: { matchId: true, checkRequestedAt: true },
  });
  if (!player)
    return { ok: false, error: "You are not playing in a live match here." };

  const waited = Date.now() - (player.checkRequestedAt?.getTime() ?? 0);
  if (waited < CHECK_COOLDOWN_MS) {
    const seconds = Math.ceil((CHECK_COOLDOWN_MS - waited) / 1000);
    return {
      ok: false,
      error: `Wait ${seconds} more second${seconds === 1 ? "" : "s"}.`,
    };
  }

  await db.matchPlayer.update({
    where: { matchId_userId: { matchId: player.matchId, userId } },
    data: { checkRequestedAt: new Date() },
  });

  // Wait briefly for a free slot. If none comes, the player stays first in
  // line and the next sync checks them.
  const outcome = await checkAndClaim(player.matchId, userId, "wait", 6_000);
  const messages: Record<CheckOutcome, string> = {
    claimed: "Found an accepted submission. The board is updated.",
    nothing_new: "No new accepted submission on a board problem yet.",
    undecided: "Found your submission. Confirming nobody was earlier...",
    busy: "Codeforces checks are busy. You are next in line.",
    unavailable: "Codeforces did not answer. Try again in a moment.",
    not_playing: "The match is no longer live.",
  };
  return { ok: true, message: messages[outcome] };
}
