// Finds real solves: reads players' recent Codeforces submissions and hands
// Accepted ones to the match engine. There is no background worker, so this
// runs inside the sync requests that the players' browsers make.

import "server-only";
import { recentStatus, userStatus } from "@/lib/codeforces/client";
import type { CfFailureReason, CfSubmission } from "@/lib/codeforces/types";
import { db } from "@/lib/db";
import { advance, claimableSlots, recordSolves } from "@/lib/match-engine";
import type { SolveEvent } from "@/lib/modes/types";
import { fullMatch, type FullMatch } from "@/lib/rooms";

/** How many recent submissions to read per check. */
const RECENT_SUBMISSIONS = 20;
/**
 * With more live players than this, routine polling switches from one call
 * per player to the site-wide feed of recent submissions.
 *
 * Checking one player is immediate but costs one call each, so P players are
 * each checked every 2 x P seconds. The feed covers everyone in one call, but
 * it runs about 15 seconds behind real time. Up to this many players, the
 * per-player way is the faster one.
 */
const FEED_ABOVE_PLAYERS = 6;
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
      /**
       * What to store as `checkedThrough`, when that must be more careful
       * than what this check can vouch for right now (see pollFeed).
       */
      persistThrough?: Date;
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

  const { solves, earliestPending } = readSubmissions(
    match,
    userId,
    recent.result,
  );
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

/**
 * From one player's submissions, pick the Accepted ones that could claim an
 * open problem of this match, and note the earliest one still being judged.
 */
function readSubmissions(
  match: FullMatch,
  userId: string,
  submissions: CfSubmission[],
  slots = claimableSlots(match),
) {
  const endsAt = match.endsAt!.getTime();
  const solves: SolveEvent[] = [];
  let earliestPending = Infinity;

  for (const submission of submissions) {
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

  return { solves, earliestPending };
}

async function saveChecks(matchId: string, checks: PlayerCheck[]) {
  // Checks from one feed read mostly carry the same times, so players with
  // identical values are written together.
  const groups = new Map<
    string,
    { data: { lastCheckedAt: Date; checkedThrough: Date }; userIds: string[] }
  >();
  for (const check of checks) {
    if (!check.ok) continue;
    const data = {
      lastCheckedAt: check.checkedAt,
      checkedThrough: check.persistThrough ?? check.checkedThrough,
    };
    const key = `${data.lastCheckedAt.getTime()}:${data.checkedThrough.getTime()}`;
    const group = groups.get(key) ?? { data, userIds: [] };
    group.userIds.push(check.userId);
    groups.set(key, group);
  }
  for (const { data, userIds } of groups.values()) {
    await db.matchPlayer.updateMany({
      where: { matchId, userId: { in: userIds } },
      data,
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

  const outcome = await settle(match, new Map([[userId, first]]));
  if (outcome === "undecided") await touch(match.id, userId);
  return outcome;
}

/**
 * Write the claims found by one or more checks of a match, fairly.
 *
 * `known` holds the players already checked. If any of them solved something,
 * every other player is checked too (unless their `checkedThrough` is already
 * past that solve), and only then are the claims written. If it cannot be
 * told who was first, nothing is written and nothing is saved: the solve is
 * still on Codeforces and is found again on the next check, and nobody is
 * later skipped on the strength of a claim that was never recorded.
 */
async function settle(
  match: FullMatch,
  known: Map<string, PlayerCheck>,
): Promise<"claimed" | "nothing_new" | "undecided"> {
  const checks = [...known.values()];
  const solves = checks.flatMap((c) => (c.ok ? c.solves : []));
  // How many solves the mode accepted (in Blitz, a late one does not count).
  let counted = 0;

  if (solves.length > 0) {
    const latest = Math.max(...solves.map((s) => s.at));
    // A check with a submission still being judged before that moment
    // cannot rule out an earlier solve.
    if (checks.some((c) => !c.ok || c.checkedThrough.getTime() < latest)) {
      return "undecided";
    }

    for (const other of match.players) {
      if (known.has(other.userId) || other.outcome) continue;
      if (other.checkedThrough && other.checkedThrough.getTime() > latest)
        continue;

      const check = await checkPlayer(match, other, "wait");
      if (!check.ok || check.checkedThrough.getTime() < latest) {
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
 * Routine polling with many players: read the site-wide feed of recent
 * submissions once and pick out the ones by players in live matches.
 *
 * The feed holds every submission between its oldest and its newest entry.
 * So a player whose earlier checks reach back to the oldest entry is fully
 * covered up to the newest one, and needs no call of their own. A player who
 * is not covered (their last check is older than the feed reaches) is left
 * for an individual check.
 */
async function pollFeed(): Promise<void> {
  const checkedAt = new Date();
  const feed = await recentStatus(1000, { onBusy: "skip" });
  if (!feed.ok || feed.result.length === 0) return;

  const times = feed.result.map((s) => s.creationTimeSeconds * 1000);
  const oldest = Math.min(...times);
  const newest = Math.max(...times);

  // Submissions by handle, lower case: Codeforces handles ignore case.
  const byHandle = new Map<string, CfSubmission[]>();
  for (const submission of feed.result) {
    for (const member of submission.author?.members ?? []) {
      const key = member.handle.toLowerCase();
      byHandle.set(key, [...(byHandle.get(key) ?? []), submission]);
    }
  }

  const matches = await db.match.findMany({
    where: { status: "live", endsAt: { gt: checkedAt } },
    include: fullMatch,
  });

  for (const match of matches) {
    if (!match.startsAt) continue;
    const slots = claimableSlots(match);
    const known = new Map<string, PlayerCheck>();

    for (const player of match.players) {
      if (player.outcome) continue;
      const through = (player.checkedThrough ?? match.startsAt).getTime();
      if (through < oldest) continue; // Not covered: needs its own check.

      const { solves, earliestPending } = readSubmissions(
        match,
        player.userId,
        byHandle.get(player.user.cfHandle?.toLowerCase() ?? "") ?? [],
        slots,
      );
      const pending = earliestPending !== Infinity;
      known.set(player.userId, {
        ok: true,
        userId: player.userId,
        solves,
        checkedAt,
        // Within this feed, everything up to its newest entry is seen.
        checkedThrough: new Date(pending ? earliestPending - 1 : newest),
        // Stored one second short: more submissions with the newest entry's
        // timestamp may still arrive. Never moved backwards.
        persistThrough: new Date(
          Math.max(through, pending ? earliestPending - 1 : newest - 1000),
        ),
      });
    }
    if (known.size > 0) await settle(match, known);
  }

  await db.cfRateLimit.update({
    where: { id: 1 },
    data: { recentPolledAt: checkedAt, recentOldestAt: new Date(oldest) },
  });
}

/**
 * Routine polling: one Codeforces call per free rate-limit slot.
 *
 * With few live players, it checks the one player, in any live match, who
 * was checked longest ago. Players who pressed "Check my submissions" go
 * first. With many players it reads the site-wide feed instead, and checks
 * individually only those the feed does not cover.
 */
async function pollNext(): Promise<void> {
  const [{ live }] = await db.$queryRaw<{ live: number }[]>`
    SELECT count(*)::int AS live
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.status = 'live' AND m.ends_at > now() AND mp.outcome IS NULL`;
  if (live === 0) return;

  const useFeed = live > FEED_ABOVE_PLAYERS;
  const feedState = useFeed
    ? await db.cfRateLimit.findUnique({ where: { id: 1 } })
    : null;
  if (useFeed && !feedState?.recentPolledAt) return pollFeed();

  // Who needs a check of their own? Always: a player who asked for one.
  // In feed mode, also a player the last feed did not reach back to, unless
  // they have been checked since. Without the feed: everyone, in turn.
  const feedOldest = feedState?.recentOldestAt ?? null;
  const feedPolledAt = feedState?.recentPolledAt ?? null;
  const [next] = await db.$queryRaw<{ match_id: string; user_id: string }[]>`
    SELECT mp.match_id, mp.user_id
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.status = 'live' AND m.ends_at > now() AND mp.outcome IS NULL
      AND (
        NOT ${useFeed}
        OR (mp.check_requested_at IS NOT NULL
            AND (mp.last_checked_at IS NULL OR mp.check_requested_at > mp.last_checked_at))
        OR (COALESCE(mp.checked_through, m.starts_at) < ${feedOldest}::timestamptz
            AND (mp.last_checked_at IS NULL OR mp.last_checked_at < ${feedPolledAt}::timestamptz))
      )
    ORDER BY
      (mp.check_requested_at IS NOT NULL
        AND (mp.last_checked_at IS NULL OR mp.check_requested_at > mp.last_checked_at)) DESC,
      mp.last_checked_at ASC NULLS FIRST
    LIMIT 1`;

  if (next) await checkAndClaim(next.match_id, next.user_id, "skip");
  else if (useFeed) await pollFeed();
}

/**
 * The clock has run out: check every player one last time, so a solve in the
 * final seconds still counts, then let the engine close the match.
 * If Codeforces does not answer, the next sync tries again; the engine closes
 * the match anyway after a grace period.
 */
export async function finalCheck(matchId: string): Promise<void> {
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
      await pollNext();
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
