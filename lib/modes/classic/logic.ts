// Classic: a list of problems ordered by rating. The first solve takes a
// problem's points. Highest score when time runs out wins.
// Everything here is pure, so it is unit tested in logic.test.ts.

import { z } from "zod";
import type {
  BaseState,
  MatchOutcome,
  ModePlayer,
  PickedProblem,
  SolveEvent,
} from "../types";

export const classicConfigSchema = z.object({
  problemCount: z.coerce.number().int().min(3).max(10).default(5),
});

export type ClassicConfig = z.infer<typeof classicConfigSchema>;

export type ClassicState = BaseState & {
  /** Player IDs in seat order. */
  playerIds: string[];
  forfeited: string[];
  scores: Record<string, number>;
};

export function initialState(
  _config: ClassicConfig,
  players: ModePlayer[],
  problems: PickedProblem[],
): ClassicState {
  // Easiest first. The ID breaks ties so the order never changes on a rebuild.
  const ordered = [...problems].sort(
    (a, b) => a.rating - b.rating || a.problemId.localeCompare(b.problemId),
  );
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);

  return {
    slots: ordered.map((problem, i) => ({
      slot: i,
      problemId: problem.problemId,
      points: (i + 1) * 100,
      claimedBy: null,
      claimedAt: null,
      submissionId: null,
    })),
    playerIds: bySeat.map((p) => p.userId),
    forfeited: bySeat.filter((p) => p.forfeited).map((p) => p.userId),
    scores: Object.fromEntries(bySeat.map((p) => [p.userId, 0])),
  };
}

export function applySolve(
  state: ClassicState,
  solve: SolveEvent,
): ClassicState {
  const target = state.slots.find((s) => s.slot === solve.slot);
  if (!target || target.claimedBy !== null) return state;
  if (!state.playerIds.includes(solve.userId)) return state;

  return {
    ...state,
    slots: state.slots.map((s) =>
      s === target
        ? {
            ...s,
            claimedBy: solve.userId,
            claimedAt: solve.at,
            submissionId: solve.submissionId,
          }
        : s,
    ),
    scores: {
      ...state.scores,
      [solve.userId]: state.scores[solve.userId] + target.points,
    },
  };
}

export function checkEnd(
  state: ClassicState,
  timeLeftMs: number,
): MatchOutcome | null {
  const active = state.playerIds.filter((id) => !state.forfeited.includes(id));

  // Everyone else gave up.
  if (active.length <= 1 && state.playerIds.length > 1) {
    return {
      winnerIds: active,
      draw: false,
      reason: "The other player forfeited",
    };
  }

  const ranked = [...active].sort((a, b) => state.scores[b] - state.scores[a]);
  const topScore = state.scores[ranked[0]];
  const leaders = ranked.filter((id) => state.scores[id] === topScore);
  const finish = (reason: string): MatchOutcome => ({
    winnerIds: leaders,
    draw: leaders.length > 1,
    reason,
  });

  if (timeLeftMs <= 0) return finish("Time ran out");

  const remaining = state.slots
    .filter((s) => s.claimedBy === null)
    .reduce((sum, s) => sum + s.points, 0);
  if (remaining === 0) return finish("Every problem was solved");

  // Even with every remaining point, the runner-up could not reach the leader.
  const runnerUp = ranked.length > 1 ? state.scores[ranked[1]] : 0;
  if (leaders.length === 1 && topScore - runnerUp > remaining) {
    return finish("Nobody can catch the leader");
  }
  return null;
}
