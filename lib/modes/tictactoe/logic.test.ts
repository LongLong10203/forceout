import { describe, expect, it } from "vitest";
import type { ModePlayer, PickedProblem } from "../types";
import { applySolve, checkEnd, initialState, winningLine } from "./logic";

const players: ModePlayer[] = [
  { userId: "x", seat: 0, forfeited: false },
  { userId: "o", seat: 1, forfeited: false },
];
const problems: PickedProblem[] = Array.from({ length: 9 }, (_, i) => ({
  problemId: `${100 + i}A`,
  rating: 800 + i * 100,
}));
const HOUR = 3_600_000;

const start = (startsAt = 1_700_000_000_000) =>
  initialState({}, players, problems, startsAt);

/** Claim cells in order: "x0 o4 x1" means x takes cell 0, o takes 4, x takes 1. */
function play(moves: string) {
  let state = start();
  moves.split(" ").forEach((move, i) => {
    state = applySolve(state, {
      slot: Number(move.slice(1)),
      userId: move[0],
      at: 1000 + i,
      submissionId: i,
    });
  });
  return state;
}

describe("tic-tac-toe initialState", () => {
  it("puts all nine problems on the grid", () => {
    const state = start();
    expect(state.slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(state.slots.map((s) => s.problemId).sort()).toEqual(
      problems.map((p) => p.problemId).sort(),
    );
  });

  it("lays out the same grid on a rebuild, whatever order the problems arrive in", () => {
    expect(
      initialState({}, players, [...problems].reverse(), 1_700_000_000_000),
    ).toEqual(start());
  });

  it("shuffles differently for a different match", () => {
    const a = start(1_700_000_000_000).slots.map((s) => s.problemId);
    const b = start(1_700_000_123_456).slots.map((s) => s.problemId);
    expect(a).not.toEqual(b);
  });
});

describe("tic-tac-toe rules", () => {
  it("gives a cell to the first solver only", () => {
    const state = play("x4 o4");
    expect(state.slots[4].claimedBy).toBe("x");
  });

  it("goes on while a line is still possible", () => {
    expect(checkEnd(start(), HOUR)).toBeNull();
    expect(checkEnd(play("x0 o4 x8"), HOUR)).toBeNull();
  });

  it("wins with a row, a column or a diagonal", () => {
    for (const moves of [
      "x0 o3 x1 o4 x2",
      "o1 x0 o4 x2 o7",
      "x0 o1 x4 o2 x8",
    ]) {
      const state = play(moves);
      const winner = moves.endsWith("o7") ? "o" : "x";
      expect(winningLine(state)?.userId).toBe(winner);
      expect(checkEnd(state, HOUR)).toEqual({
        winnerIds: [winner],
        draw: false,
        reason: "Three in a row",
      });
    }
  });

  it("ignores solves after a line is made", () => {
    const state = play("x0 o3 x1 o4 x2 o5");
    expect(state.slots[5].claimedBy).toBeNull();
    expect(checkEnd(state, HOUR)?.winnerIds).toEqual(["x"]);
  });

  it("ends when no line is possible, and more cells wins", () => {
    // x o x
    // x o o
    // o x x   -> full board, no line, x has 5 cells.
    const state = play("x0 o1 x2 x3 o4 o5 o6 x7 x8");
    expect(winningLine(state)).toBeNull();
    expect(checkEnd(state, HOUR)).toEqual({
      winnerIds: ["x"],
      draw: false,
      reason: "No line is possible any more, more cells wins",
    });
  });

  it("ends early with a cell still open when every line is blocked", () => {
    // x . o
    // o o x
    // x x o   -> cell 1 is open, but every line holds both marks.
    const state = play("x0 o2 x5 o3 x7 o4 x6 o8");
    expect(state.slots[1].claimedBy).toBeNull();
    expect(checkEnd(state, HOUR)).toEqual({
      winnerIds: ["x", "o"],
      draw: true,
      reason: "No line is possible any more, and the cells are equal",
    });
  });

  it("is a draw on equal cells when time runs out with no line", () => {
    expect(checkEnd(play("x0 o4"), 0)).toEqual({
      winnerIds: ["x", "o"],
      draw: true,
      reason: "Time ran out with no line, and the cells are equal",
    });
    expect(checkEnd(play("x0 o4 x8"), 0)?.winnerIds).toEqual(["x"]);
  });

  it("ends at once on a forfeit", () => {
    const state = initialState(
      {},
      [players[0], { ...players[1], forfeited: true }],
      problems,
      1,
    );
    expect(checkEnd(state, HOUR)).toEqual({
      winnerIds: ["x"],
      draw: false,
      reason: "The other player forfeited",
    });
  });
});
