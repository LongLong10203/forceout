// Tic-Tac-Toe: a 3 x 3 grid with one problem per cell. The first solve takes
// the cell. Three cells in a row, column or diagonal wins.
// Everything here is pure, so it is unit tested in logic.test.ts.

import { z } from "zod";
import type {
  BaseState,
  MatchOutcome,
  ModePlayer,
  PickedProblem,
  SolveEvent,
} from "../types";

export const tictactoeConfigSchema = z.object({});
export type TicTacToeConfig = z.infer<typeof tictactoeConfigSchema>;

export type TicTacToeState = BaseState & {
  /** Player IDs in seat order. */
  playerIds: string[];
  forfeited: string[];
};

/** The eight lines, as cell numbers (0 is top left, 8 is bottom right). */
export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

/** A small seeded random generator (mulberry32), so a shuffle can be repeated. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initialState(
  _config: TicTacToeConfig,
  players: ModePlayer[],
  problems: PickedProblem[],
  startsAt: number,
): TicTacToeState {
  // Problems go into random cells, so the easy ones are not always in the
  // same place. The shuffle is seeded by the start time and starts from a
  // sorted list, so a rebuild always lays out the same grid.
  const cells = [...problems].sort((a, b) =>
    a.problemId.localeCompare(b.problemId),
  );
  const random = seededRandom(startsAt);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);

  return {
    slots: cells.map((problem, i) => ({
      slot: i,
      problemId: problem.problemId,
      points: 0,
      claimedBy: null,
      claimedAt: null,
      submissionId: null,
    })),
    playerIds: bySeat.map((p) => p.userId),
    forfeited: bySeat.filter((p) => p.forfeited).map((p) => p.userId),
  };
}

export function applySolve(
  state: TicTacToeState,
  solve: SolveEvent,
): TicTacToeState {
  const target = state.slots.find((s) => s.slot === solve.slot);
  if (!target || target.claimedBy !== null) return state;
  if (!state.playerIds.includes(solve.userId)) return state;
  // Nothing counts once a line is made.
  if (winningLine(state)) return state;

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
  };
}

/** The completed line and who owns it, if there is one. */
export function winningLine(
  state: TicTacToeState,
): { userId: string; cells: readonly number[] } | null {
  for (const line of LINES) {
    const owner = state.slots[line[0]]?.claimedBy;
    if (owner && line.every((cell) => state.slots[cell]?.claimedBy === owner)) {
      return { userId: owner, cells: line };
    }
  }
  return null;
}

export function cellCounts(state: TicTacToeState): Record<string, number> {
  const counts = Object.fromEntries(state.playerIds.map((id) => [id, 0]));
  for (const slot of state.slots) {
    if (slot.claimedBy !== null && slot.claimedBy in counts)
      counts[slot.claimedBy]++;
  }
  return counts;
}

/** Can this player still complete some line? */
function canStillMakeLine(state: TicTacToeState, userId: string) {
  return LINES.some((line) =>
    line.every((cell) => {
      const owner = state.slots[cell]?.claimedBy;
      return owner === null || owner === userId;
    }),
  );
}

export function checkEnd(
  state: TicTacToeState,
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

  const line = winningLine(state);
  if (line)
    return { winnerIds: [line.userId], draw: false, reason: "Three in a row" };

  // No line: whoever holds more cells wins, and equal cells is a draw.
  const byCells = (reason: string): MatchOutcome => {
    const counts = cellCounts(state);
    const most = Math.max(...active.map((id) => counts[id]));
    const leaders = active.filter((id) => counts[id] === most);
    return {
      winnerIds: leaders,
      draw: leaders.length > 1,
      reason:
        leaders.length > 1
          ? `${reason}, and the cells are equal`
          : `${reason}, more cells wins`,
    };
  };

  if (timeLeftMs <= 0) return byCells("Time ran out with no line");
  if (!active.some((id) => canStillMakeLine(state, id))) {
    return byCells("No line is possible any more");
  }
  return null;
}
