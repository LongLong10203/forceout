// Blitz: one problem at a time. The first solve wins the round and the next
// round starts at once. If nobody solves in time, nobody wins the round.
// Winning more than half of the rounds wins the match.
// Everything here is pure, so it is unit tested in logic.test.ts.

import { z } from "zod";
import type {
  BaseState,
  MatchOutcome,
  ModePlayer,
  PickedProblem,
  SolveEvent,
} from "../types";

export const blitzConfigSchema = z.object({
  rounds: z.coerce
    .number()
    .int()
    .min(1)
    .max(15)
    .refine((n) => n % 2 === 1, "The number of rounds must be odd.")
    .default(5),
  roundMinutes: z.coerce.number().int().min(1).max(60).default(15),
  /** A pause before each new round, so players can get ready. */
  breakSeconds: z.coerce.number().int().min(0).max(120).default(15),
});

export type BlitzConfig = z.infer<typeof blitzConfigSchema>;

export type BlitzRound = {
  /** The round's slot. Round 1 is slot 0. */
  slot: number;
  startedAt: number;
  /** Null while the round is being played. */
  endedAt: number | null;
  /** Null while it is played, and also when it timed out with no winner. */
  winnerId: string | null;
};

export type BlitzState = BaseState & {
  /** Player IDs in seat order. */
  playerIds: string[];
  forfeited: string[];
  wins: Record<string, number>;
  totalRounds: number;
  roundMs: number;
  /** The pause between two rounds. */
  breakMs: number;
  /**
   * Set during a pause: when the next round starts. Its problem stays hidden
   * until then.
   */
  nextRoundAt: number | null;
  /** The rounds started so far. The last one is the current round, if open. */
  rounds: BlitzRound[];
};

export function initialState(
  config: BlitzConfig,
  players: ModePlayer[],
  problems: PickedProblem[],
  startsAt: number,
): BlitzState {
  // Easiest first, so the rounds get harder. The ID breaks ties so the order
  // never changes on a rebuild.
  const ordered = [...problems].sort(
    (a, b) => a.rating - b.rating || a.problemId.localeCompare(b.problemId),
  );
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);

  return {
    slots: ordered.map((problem, i) => ({
      slot: i,
      problemId: problem.problemId,
      points: 1,
      claimedBy: null,
      claimedAt: null,
      submissionId: null,
    })),
    playerIds: bySeat.map((p) => p.userId),
    forfeited: bySeat.filter((p) => p.forfeited).map((p) => p.userId),
    wins: Object.fromEntries(bySeat.map((p) => [p.userId, 0])),
    totalRounds: ordered.length,
    roundMs: config.roundMinutes * 60_000,
    breakMs: (config.breakSeconds ?? 0) * 1000,
    nextRoundAt: null,
    rounds: [{ slot: 0, startedAt: startsAt, endedAt: null, winnerId: null }],
  };
}

/** The round being played, or null when every round is over. */
export function currentRound(state: BlitzState): BlitzRound | null {
  const last = state.rounds[state.rounds.length - 1];
  return last && last.endedAt === null ? last : null;
}

/** Is the match already decided (so no further round should start)? */
function decided(state: BlitzState): boolean {
  const played = state.rounds.filter((r) => r.endedAt !== null).length;
  const left = state.totalRounds - played;
  const [first = 0, second = 0] = Object.values(state.wins).sort(
    (a, b) => b - a,
  );
  // More than half the rounds, or a lead the other player cannot close.
  return first > state.totalRounds / 2 || first - second > left;
}

/** Open the next round at `at`. */
function startRound(state: BlitzState, at: number): BlitzState {
  return {
    ...state,
    nextRoundAt: null,
    rounds: [
      ...state.rounds,
      {
        slot: state.rounds.length,
        startedAt: at,
        endedAt: null,
        winnerId: null,
      },
    ],
  };
}

/**
 * Close the current round at `at`. If another round is due, it starts after
 * the pause (or at once when there is no pause).
 */
function endRound(
  state: BlitzState,
  at: number,
  winnerId: string | null,
): BlitzState {
  const rounds = state.rounds.map((round, i) =>
    i === state.rounds.length - 1 ? { ...round, endedAt: at, winnerId } : round,
  );
  const next: BlitzState = { ...state, rounds };
  if (rounds.length >= state.totalRounds || decided(next)) return next;
  return next.breakMs > 0
    ? { ...next, nextRoundAt: at + next.breakMs }
    : startRound(next, at);
}

/**
 * Time alone: a round that ran out ends with no winner, and a pause that is
 * over starts the next round.
 */
export function onTick(state: BlitzState, now: number): BlitzState {
  let next = state;
  for (;;) {
    const round = currentRound(next);
    if (round) {
      if (now < round.startedAt + next.roundMs) return next;
      next = endRound(next, round.startedAt + next.roundMs, null);
    } else if (next.nextRoundAt != null && now >= next.nextRoundAt) {
      next = startRound(next, next.nextRoundAt);
    } else {
      return next;
    }
  }
}

export function applySolve(state: BlitzState, solve: SolveEvent): BlitzState {
  const round = currentRound(state);
  // Only a solve of the current round's problem, made during the round, counts.
  if (!round || solve.slot !== round.slot) return state;
  if (solve.at < round.startedAt || solve.at >= round.startedAt + state.roundMs)
    return state;
  if (!state.playerIds.includes(solve.userId)) return state;

  const claimed: BlitzState = {
    ...state,
    slots: state.slots.map((s) =>
      s.slot === solve.slot
        ? {
            ...s,
            claimedBy: solve.userId,
            claimedAt: solve.at,
            submissionId: solve.submissionId,
          }
        : s,
    ),
    wins: { ...state.wins, [solve.userId]: state.wins[solve.userId] + 1 },
  };
  return endRound(claimed, solve.at, solve.userId);
}

export function checkEnd(
  state: BlitzState,
  timeLeftMs: number,
): MatchOutcome | null {
  const active = state.playerIds.filter((id) => !state.forfeited.includes(id));
  if (active.length <= 1 && state.playerIds.length > 1) {
    return {
      winnerIds: active,
      draw: false,
      reason: "The other player forfeited",
    };
  }

  const most = Math.max(...active.map((id) => state.wins[id]));
  const leaders = active.filter((id) => state.wins[id] === most);
  const finish = (reason: string): MatchOutcome => ({
    winnerIds: leaders,
    draw: leaders.length > 1,
    reason,
  });

  if (most > state.totalRounds / 2) {
    return finish(
      state.totalRounds === 1
        ? "Won the round"
        : "Won more than half of the rounds",
    );
  }
  // No round open and none waiting to start: the rounds are over.
  if (currentRound(state) === null && state.nextRoundAt == null) {
    if (state.rounds.length < state.totalRounds)
      return finish("Nobody can catch the leader");
    return finish(
      leaders.length > 1
        ? "Equal round wins after the last round"
        : "Won more rounds",
    );
  }
  if (timeLeftMs <= 0) return finish("Time ran out");
  return null;
}

/** Rounds played or being played. Later rounds stay hidden. */
export function visibleSlots(state: BlitzState): number[] {
  return state.rounds.map((round) => round.slot);
}
