import { describe, expect, it } from "vitest";
import type { ModePlayer, PickedProblem } from "../types";
import { applySolve, checkEnd, initialState } from "./logic";

const players: ModePlayer[] = [
  { userId: "a", seat: 0, forfeited: false },
  { userId: "b", seat: 1, forfeited: false },
];
const problems: PickedProblem[] = [
  { problemId: "9C", rating: 1500 },
  { problemId: "1A", rating: 800 },
  { problemId: "5B", rating: 1200 },
  { problemId: "2A", rating: 1200 },
  { problemId: "7D", rating: 1900 },
];
const config = { problemCount: 5 };
const HOUR = 3_600_000;

const start = () => initialState(config, players, problems);
const solve = (slot: number, userId: string, at = 1000) => ({
  slot,
  userId,
  at,
  submissionId: 1,
});

describe("classic initialState", () => {
  it("orders problems by rating and gives 100 to 500 points", () => {
    const state = start();
    expect(state.slots.map((s) => s.problemId)).toEqual([
      "1A",
      "2A",
      "5B",
      "9C",
      "7D",
    ]);
    expect(state.slots.map((s) => s.points)).toEqual([100, 200, 300, 400, 500]);
    expect(state.scores).toEqual({ a: 0, b: 0 });
  });

  it("lays out the same board whatever order the problems arrive in", () => {
    expect(initialState(config, players, [...problems].reverse())).toEqual(
      start(),
    );
  });
});

describe("classic applySolve", () => {
  it("gives the points to the first solver only", () => {
    let state = applySolve(start(), solve(2, "a"));
    state = applySolve(state, solve(2, "b", 2000));
    expect(state.scores).toEqual({ a: 300, b: 0 });
    expect(state.slots[2].claimedBy).toBe("a");
    expect(state.slots[2].claimedAt).toBe(1000);
  });

  it("does not change the state it was given", () => {
    const before = start();
    applySolve(before, solve(0, "a"));
    expect(before).toEqual(start());
  });

  it("ignores unknown slots and unknown players", () => {
    const state = start();
    expect(applySolve(state, solve(99, "a"))).toBe(state);
    expect(applySolve(state, solve(0, "stranger"))).toBe(state);
  });
});

describe("classic checkEnd", () => {
  it("goes on while the match is open", () => {
    expect(checkEnd(start(), HOUR)).toBeNull();
    // a: 500, b: 0, 1000 left: b can still catch up.
    expect(checkEnd(applySolve(start(), solve(4, "a")), HOUR)).toBeNull();
  });

  it("ends early when nobody can catch the leader", () => {
    // a: 500 + 400 = 900, b: 0, 600 left.
    let state = applySolve(start(), solve(4, "a"));
    state = applySolve(state, solve(3, "a"));
    expect(checkEnd(state, HOUR)).toEqual({
      winnerIds: ["a"],
      draw: false,
      reason: "Nobody can catch the leader",
    });
  });

  it("does not end early when the runner-up can still tie", () => {
    // a: 500 + 300 = 800, b: 0, 700 left: no. a: 800 vs b: 100 + 200 = 300, 400 left: ends.
    let state = applySolve(start(), solve(4, "a"));
    state = applySolve(state, solve(2, "a"));
    expect(checkEnd(state, HOUR)?.reason).toBe("Nobody can catch the leader");
    // a: 500 + 200 = 700, b: 300, 500 left: b can reach 800.
    state = applySolve(start(), solve(4, "a"));
    state = applySolve(state, solve(1, "a"));
    state = applySolve(state, solve(2, "b"));
    expect(checkEnd(state, HOUR)).toBeNull();
  });

  it("gives the win to the highest score when time runs out", () => {
    const state = applySolve(start(), solve(0, "b"));
    expect(checkEnd(state, 0)).toEqual({
      winnerIds: ["b"],
      draw: false,
      reason: "Time ran out",
    });
  });

  it("is a draw on equal scores", () => {
    expect(checkEnd(start(), 0)).toEqual({
      winnerIds: ["a", "b"],
      draw: true,
      reason: "Time ran out",
    });
  });

  it("ends when every problem is solved", () => {
    let state = start();
    for (const [slot, user] of [
      [0, "a"],
      [1, "b"],
      [2, "a"],
      [3, "b"],
      [4, "a"],
    ] as const) {
      state = applySolve(state, solve(slot, user));
    }
    expect(checkEnd(state, HOUR)).toEqual({
      winnerIds: ["a"],
      draw: false,
      reason: "Every problem was solved",
    });
  });

  it("ends a two-player match at once on a forfeit", () => {
    const state = initialState(
      config,
      [players[0], { ...players[1], forfeited: true }],
      problems,
    );
    expect(checkEnd(state, HOUR)).toEqual({
      winnerIds: ["a"],
      draw: false,
      reason: "The other player forfeited",
    });
  });

  it("keeps going after a forfeit when two players remain, and the quitter cannot win", () => {
    const three: ModePlayer[] = [
      ...players,
      { userId: "c", seat: 2, forfeited: true },
    ];
    let state = initialState(config, three, problems);
    state = applySolve(state, solve(4, "c"));
    expect(checkEnd(state, HOUR)).toBeNull();
    state = applySolve(state, solve(0, "b"));
    expect(checkEnd(state, 0)?.winnerIds).toEqual(["b"]);
  });
});
