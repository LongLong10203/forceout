// The match engine: starts a match, records claims, advances the clock and
// ends the match. It contains no game rules. Everything about scores, grids
// or rounds comes from the mode module (lib/modes).

import "server-only";
import { solvedProblemIds } from "@/lib/codeforces/client";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getMode } from "@/lib/modes";
import type {
  BaseState,
  MatchOutcome,
  PickedProblem,
  SolveEvent,
} from "@/lib/modes/types";
import type { MatchResult, RoomConfig } from "@/lib/room-types";
import {
  fullMatch,
  startBlockedBy,
  type FullMatch,
  type RoomResult,
} from "@/lib/rooms";

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * JSON with object keys in sorted order. Postgres jsonb does not keep key
 * order, so two equal states can only be compared this way.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/**
 * Pick random rated problems inside the room's rating range that pass the tag
 * filters and that no player has solved. Returns fewer than `count` if not
 * enough match.
 */
async function pickProblems(
  config: RoomConfig,
  count: number,
  solved: string[],
): Promise<PickedProblem[]> {
  const rows = await db.$queryRaw<{ id: string; rating: number }[]>`
    SELECT id, rating FROM problems
    WHERE rating BETWEEN ${config.ratingMin} AND ${config.ratingMax}
      -- April Fools and other joke problems.
      AND NOT ('*special' = ANY(tags))
      -- At least one included tag, when an include list is set.
      AND (cardinality(${config.includeTags}::text[]) = 0
           OR tags && ${config.includeTags}::text[])
      AND NOT (tags && ${config.excludeTags}::text[])
      AND NOT (id = ANY(${solved}::text[]))
    ORDER BY random()
    LIMIT ${count}`;
  return rows.map((row) => ({ problemId: row.id, rating: row.rating }));
}

/** The host starts the match: pick problems, build the board, start the clock. */
export async function startMatch(
  code: string,
  userId: string,
): Promise<RoomResult> {
  const match = await db.match.findUnique({
    where: { code },
    include: fullMatch,
  });
  if (!match) return { ok: false, error: "Room not found." };
  if (match.hostId !== userId)
    return { ok: false, error: "Only the host can start." };
  if (match.status !== "lobby") return { ok: false, error: "Already started." };

  const blocked = startBlockedBy(match);
  if (blocked) return { ok: false, error: blocked };

  const mode = getMode(match.mode)!;
  const config = match.config as unknown as RoomConfig;
  const count = mode.problemCount(config.mode);

  // Everything any player has already solved is off the table.
  const solved = new Set<string>();
  for (const player of match.players) {
    const handle = player.user.cfHandle;
    if (!handle) continue;
    const result = await solvedProblemIds(handle, {
      onBusy: "wait",
      maxWaitMs: 30_000,
    });
    if (result.ok) {
      result.result.forEach((id) => solved.add(id));
    } else if (result.reason !== "failed") {
      // "failed" means Codeforces does not know the handle (a dev account).
      return {
        ok: false,
        error: `Could not read ${handle}'s solved problems from Codeforces. Try again in a moment.`,
      };
    }
  }

  const picked = await pickProblems(config, count, [...solved]);
  if (picked.length < count) {
    return {
      ok: false,
      error: `Only ${picked.length} unsolved problems match these settings, and ${mode.name} needs ${count}. Create a room with a wider rating range or fewer tag filters.`,
    };
  }

  const startsAt = new Date();
  // A mode with its own clock (Blitz rounds) sets the longest the match can last.
  const durationMs =
    mode.matchDurationMs?.(config.mode) ?? config.durationMinutes * 60_000;
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const players = match.players.map((p) => ({
    userId: p.userId,
    seat: p.seat,
    forfeited: false,
  }));
  const state: BaseState = mode.initialState(
    config.mode,
    players,
    picked,
    startsAt.getTime(),
  );
  const visible = new Set(mode.visibleSlots(state));

  try {
    await db.$transaction(async (tx) => {
      // The version in the WHERE makes this fail if anyone joined, left or
      // changed their ready state since we read the room.
      const started = await tx.match.updateMany({
        where: { id: match.id, status: "lobby", version: match.version },
        data: {
          status: "live",
          startsAt,
          endsAt,
          state: json(state),
          version: { increment: 1 },
        },
      });
      if (started.count !== 1) throw new Error("lobby changed");

      await tx.matchProblem.createMany({
        data: state.slots.map((slot) => ({
          matchId: match.id,
          slot: slot.slot,
          problemId: slot.problemId!,
          points: slot.points,
          revealedAt: visible.has(slot.slot) ? startsAt : null,
        })),
      });
    });
  } catch {
    return {
      ok: false,
      error: "The lobby just changed. Check it and start again.",
    };
  }
  return { ok: true };
}

/**
 * Rebuild the board from the stored claims by replaying them through the
 * mode. `match_problems` is the source of truth; `matches.state` is only a
 * cache of this result.
 */
function rebuildState(
  match: FullMatch,
  now: number,
  candidates: SolveEvent[] = [],
): BaseState {
  const mode = getMode(match.mode)!;
  const config = match.config as unknown as RoomConfig;
  const startsAt = match.startsAt!.getTime();

  let state: BaseState = mode.initialState(
    config.mode,
    match.players.map((p) => ({
      userId: p.userId,
      seat: p.seat,
      forfeited: p.outcome === "forfeit",
    })),
    match.problems.map((p) => ({
      problemId: p.problemId,
      rating: p.problem.rating,
    })),
    startsAt,
  );

  const recorded: SolveEvent[] = match.problems
    .filter((p) => p.claimedBy !== null && p.claimedAt !== null)
    .map((p) => ({
      slot: p.slot,
      userId: p.claimedBy!,
      at: p.claimedAt!.getTime(),
      submissionId: p.cfSubmissionId === null ? null : Number(p.cfSubmissionId),
    }));

  // Earliest first; the lower submission ID breaks a tie.
  const solves = [...recorded, ...candidates].sort(
    (a, b) => a.at - b.at || (a.submissionId ?? 0) - (b.submissionId ?? 0),
  );

  for (const solve of solves) {
    state = mode.onTick(state, solve.at);
    state = mode.applySolve(state, solve);
  }
  return mode.onTick(state, now);
}

/**
 * The latest moment at which the match's result may be judged: not past the
 * point up to which every player's submissions have been seen. Otherwise a
 * last round could be called a timeout, and the match closed, seconds before
 * a solve made just in time is noticed. If checks fall far behind (Codeforces is down, or
 * nobody has the room open), time moves on regardless after a grace period.
 */
function settledTime(match: FullMatch, now: number): number {
  const startsAt = match.startsAt!.getTime();
  const seen = Math.min(
    ...match.players
      .filter((p) => p.outcome === null)
      .map((p) => p.checkedThrough?.getTime() ?? startsAt),
    now,
  );
  return Math.max(seen, now - FINAL_CHECK_GRACE_MS, startsAt);
}

/** How long a match waits for the final Codeforces check before closing anyway. */
const FINAL_CHECK_GRACE_MS = 2 * 60_000;

/**
 * True once every player still in the match has been checked on Codeforces
 * after the end time, or Codeforces has been unreachable for too long.
 */
function finalCheckDone(match: FullMatch): boolean {
  const endsAt = match.endsAt!.getTime();
  if (Date.now() > endsAt + FINAL_CHECK_GRACE_MS) return true;
  return match.players
    .filter((p) => p.outcome === null)
    .every((p) => p.checkedThrough && p.checkedThrough.getTime() >= endsAt);
}

/**
 * The slots a real submission could claim right now: visible and unclaimed.
 * `notBefore` is when the problem was shown, since earlier submissions do
 * not count.
 */
export function claimableSlots(match: FullMatch) {
  const mode = getMode(match.mode);
  const state = match.state as BaseState | null;
  if (!mode || !state || !match.startsAt) return [];
  const visible = new Set(mode.visibleSlots(state));
  return match.problems
    .filter((p) => visible.has(p.slot) && p.claimedBy === null)
    .map((p) => ({
      slot: p.slot,
      contestId: p.problem.contestId,
      index: p.problem.index,
      notBefore: (p.revealedAt ?? match.startsAt!).getTime(),
    }));
}

/**
 * Bring a live match up to date: rebuild the board, check whether the match
 * is over, and save whatever changed. Safe to call as often as you like.
 */
export async function advance(matchId: string): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: fullMatch,
  });
  if (!match || match.status !== "live" || !match.startsAt || !match.endsAt)
    return;

  const mode = getMode(match.mode);
  if (!mode) return;

  // Never look past the scheduled end: what happens later does not count.
  const now = Math.min(Date.now(), match.endsAt.getTime());
  // The board follows the real clock, so a new Blitz round opens on time.
  const state = rebuildState(match, now);

  // Ending the match cannot be undone, so that decision is made more
  // carefully, on the board as it stood at the last moment up to which every
  // player's submissions have been seen. A round that seems to have timed out
  // can still turn into a win when a just-in-time solve is noticed; the
  // replay then corrects the board, as long as the match is still open.
  //
  // In the same way, when the match clock runs out the match stays open until
  // every player has had one last Codeforces check. Until then the mode is
  // told there is a moment left.
  const timeLeft = match.endsAt.getTime() - Date.now();
  const outcome: MatchOutcome | null = mode.checkEnd(
    rebuildState(match, settledTime(match, now)),
    timeLeft <= 0 && !finalCheckDone(match) ? 1 : timeLeft,
  );

  const changed = canonical(state) !== canonical(match.state);
  if (!changed && !outcome) return;

  const scores = mode.scores(state);
  const visible = new Set(mode.visibleSlots(state));
  const result: MatchResult | null = outcome && {
    ...outcome,
    endedAt: new Date(now).toISOString(),
  };

  await db.$transaction(async (tx) => {
    // The status guard keeps two requests from both ending the match.
    const saved = await tx.match.updateMany({
      where: { id: match.id, status: "live" },
      data: {
        state: json(state),
        version: { increment: 1 },
        ...(result && {
          status: "finished",
          result: json(result),
          endsAt: new Date(now),
        }),
      },
    });
    if (saved.count !== 1) return;

    for (const player of match.players) {
      const outcomeForPlayer =
        player.outcome === "forfeit"
          ? "forfeit"
          : !outcome
            ? null
            : !outcome.winnerIds.includes(player.userId)
              ? "loss"
              : outcome.draw
                ? "draw"
                : "win";
      await tx.matchPlayer.update({
        where: { matchId_userId: { matchId: match.id, userId: player.userId } },
        data: { score: scores[player.userId] ?? 0, outcome: outcomeForPlayer },
      });
    }

    // Slots that just became visible (a new Blitz round, for example).
    await tx.matchProblem.updateMany({
      where: {
        matchId: match.id,
        slot: { in: [...visible] },
        revealedAt: null,
      },
      data: { revealedAt: new Date(now) },
    });
  });
}

/** Called on every sync and page load: lets time-based changes happen. */
export async function tickMatch(code: string): Promise<void> {
  const match = await db.match.findUnique({
    where: { code },
    select: { id: true, status: true },
  });
  if (match?.status === "live") await advance(match.id);
}

/**
 * Record solves for one match, in any order. Returns how many counted.
 *
 * The mode decides whether a solve counts (in Blitz, only a solve inside its
 * round does): the candidates are replayed through the mode together with
 * the claims already stored, and only the ones that end up owning their slot
 * are written. A claim is one `UPDATE ... WHERE claimed_by IS NULL`, so two
 * solves can never both take the same problem.
 */
export async function recordSolves(
  matchId: string,
  candidates: SolveEvent[],
): Promise<number> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: fullMatch,
  });
  if (!match || match.status !== "live" || !match.startsAt || !match.endsAt)
    return 0;

  const state = rebuildState(
    match,
    Math.min(Date.now(), match.endsAt.getTime()),
    candidates,
  );
  const accepted = candidates.filter((solve) => {
    const slot = state.slots.find((s) => s.slot === solve.slot);
    return (
      slot?.claimedBy === solve.userId &&
      slot.claimedAt === solve.at &&
      slot.submissionId === solve.submissionId
    );
  });

  let written = 0;
  for (const solve of accepted) {
    const claim = await db.matchProblem.updateMany({
      where: {
        matchId,
        slot: solve.slot,
        claimedBy: null,
        match: { status: "live" },
      },
      data: {
        claimedBy: solve.userId,
        claimedAt: new Date(solve.at),
        cfSubmissionId: solve.submissionId,
      },
    });
    written += claim.count;
  }
  await advance(matchId);
  return written;
}

/** A player gives up. The mode decides whether that ends the match. */
export async function forfeit(
  code: string,
  userId: string,
): Promise<RoomResult> {
  const match = await db.match.findUnique({
    where: { code },
    select: { id: true, status: true },
  });
  if (!match) return { ok: false, error: "Room not found." };
  if (match.status !== "live")
    return { ok: false, error: "The match is not live." };

  const changed = await db.matchPlayer.updateMany({
    where: { matchId: match.id, userId, outcome: null },
    data: { outcome: "forfeit" },
  });
  if (changed.count !== 1)
    return { ok: false, error: "You are not playing in this match." };

  await advance(match.id);
  return { ok: true };
}

/**
 * Development only: claim a problem as if the player had solved it on
 * Codeforces just now. Lets the engine be tested without Codeforces.
 */
export async function fakeSolve(
  code: string,
  slot: number,
  userId: string,
): Promise<RoomResult> {
  const match = await db.match.findUnique({
    where: { code },
    include: fullMatch,
  });
  if (
    !match ||
    match.status !== "live" ||
    !match.endsAt ||
    match.endsAt.getTime() <= Date.now()
  ) {
    return { ok: false, error: "The match is not live." };
  }

  const player = match.players.find((p) => p.userId === userId);
  if (!player || player.outcome === "forfeit") {
    return { ok: false, error: "That player is not playing in this match." };
  }
  const mode = getMode(match.mode)!;
  const visible = mode.visibleSlots(match.state as unknown as BaseState);
  if (!visible.includes(slot))
    return { ok: false, error: "That problem is not on the board." };

  const counted = await recordSolves(match.id, [
    { slot, userId, at: Date.now(), submissionId: null },
  ]);
  return counted > 0
    ? { ok: true }
    : { ok: false, error: "That solve does not count right now." };
}
