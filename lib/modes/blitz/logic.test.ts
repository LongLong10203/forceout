import { describe, expect, it } from "vitest";
import type { ModePlayer, PickedProblem } from "../types";
import {
  applySolve,
  blitzConfigSchema,
  checkEnd,
  currentRound,
  initialState,
  onTick,
  visibleSlots,
  type BlitzState,
} from "./logic";

const players: ModePlayer[] = [
  { userId: "a", seat: 0, forfeited: false },
  { userId: "b", seat: 1, forfeited: false },
];
const MIN = 60_000;
const T0 = 1_700_000_000_000;
// Most tests use no break, so a new round starts the moment one ends.
const config = { rounds: 5, roundMinutes: 15, breakSeconds: 0 };
const problems: PickedProblem[] = [1300, 900, 1500, 800, 1100].map(
  (rating, i) => ({
    problemId: `${200 + i}B`,
    rating,
  }),
);

const start = (rounds = 5) =>
  initialState({ ...config, rounds }, players, problems.slice(0, rounds), T0);

/** A solve of the current round's problem, `minutes` after the match start. */
function win(state: BlitzState, userId: string, minutes: number) {
  const at = T0 + minutes * MIN;
  const ticked = onTick(state, at);
  return applySolve(ticked, {
    slot: currentRound(ticked)!.slot,
    userId,
    at,
    submissionId: minutes,
  });
}

describe("blitz config", () => {
  it("accepts odd round counts from 1 to 15 only", () => {
    expect(blitzConfigSchema.safeParse({ rounds: 1 }).success).toBe(true);
    expect(blitzConfigSchema.safeParse({ rounds: 7 }).success).toBe(true);
    expect(blitzConfigSchema.safeParse({ rounds: 4 }).success).toBe(false);
    expect(blitzConfigSchema.safeParse({ rounds: 17 }).success).toBe(false);
    expect(blitzConfigSchema.parse({})).toEqual({
      rounds: 5,
      roundMinutes: 15,
      breakSeconds: 15,
    });
  });
});

describe("blitz rounds", () => {
  it("starts with round 1 only, easiest problem first", () => {
    const state = start();
    expect(state.slots.map((s) => s.problemId)).toEqual([
      "203B",
      "201B",
      "204B",
      "200B",
      "202B",
    ]);
    expect(visibleSlots(state)).toEqual([0]);
    expect(currentRound(state)).toMatchObject({ slot: 0, startedAt: T0 });
  });

  it("gives the round to the first solver and starts the next round at once", () => {
    const state = win(start(), "a", 3);
    expect(state.wins).toEqual({ a: 1, b: 0 });
    expect(state.slots[0].claimedBy).toBe("a");
    expect(visibleSlots(state)).toEqual([0, 1]);
    expect(currentRound(state)).toMatchObject({
      slot: 1,
      startedAt: T0 + 3 * MIN,
    });
  });

  it("ignores a solve of a problem that is not the current round", () => {
    const state = start();
    expect(
      applySolve(state, {
        slot: 2,
        userId: "a",
        at: T0 + MIN,
        submissionId: 1,
      }),
    ).toBe(state);
    const next = win(state, "a", 3);
    // b solves round 1's problem after a already took it.
    expect(
      applySolve(next, {
        slot: 0,
        userId: "b",
        at: T0 + 4 * MIN,
        submissionId: 2,
      }),
    ).toBe(next);
  });

  it("times a round out with no winner and starts the next one", () => {
    const state = onTick(start(), T0 + 16 * MIN);
    expect(state.wins).toEqual({ a: 0, b: 0 });
    expect(state.rounds[0]).toMatchObject({
      endedAt: T0 + 15 * MIN,
      winnerId: null,
    });
    expect(currentRound(state)).toMatchObject({
      slot: 1,
      startedAt: T0 + 15 * MIN,
    });
  });

  it("times out several rounds in one tick", () => {
    const state = onTick(start(), T0 + 40 * MIN);
    expect(state.rounds.length).toBe(3);
    expect(currentRound(state)).toMatchObject({
      slot: 2,
      startedAt: T0 + 30 * MIN,
    });
  });

  it("does not count a solve made after the round's time ran out", () => {
    const state = start();
    const late = { slot: 0, userId: "a", at: T0 + 15 * MIN, submissionId: 1 };
    expect(applySolve(state, late)).toBe(state);
  });

  it("does nothing on a tick before the deadline", () => {
    const state = start();
    expect(onTick(state, T0 + 14 * MIN)).toBe(state);
  });
});

describe("blitz checkEnd", () => {
  it("goes on while the match is open", () => {
    expect(checkEnd(start(), 60 * MIN)).toBeNull();
    expect(checkEnd(win(win(start(), "a", 1), "b", 2), 60 * MIN)).toBeNull();
  });

  it("ends as soon as a player has won more than half of the rounds", () => {
    const state = win(win(win(start(), "a", 1), "a", 2), "a", 3);
    expect(checkEnd(state, 60 * MIN)).toEqual({
      winnerIds: ["a"],
      draw: false,
      reason: "Won more than half of the rounds",
    });
    // No round 4 is started.
    expect(state.rounds.length).toBe(3);
    expect(currentRound(state)).toBeNull();
  });

  it("plays every round when it stays close", () => {
    let state = start(3);
    state = win(state, "a", 1);
    state = win(state, "b", 2);
    expect(checkEnd(state, 60 * MIN)).toBeNull();
    state = win(state, "b", 3);
    expect(checkEnd(state, 60 * MIN)?.winnerIds).toEqual(["b"]);
  });

  it("is a draw on equal round wins after the last round", () => {
    // Best of 3: a wins, b wins, the last round times out.
    let state = win(win(start(3), "a", 1), "b", 2);
    state = onTick(state, T0 + 18 * MIN);
    expect(currentRound(state)).toBeNull();
    expect(checkEnd(state, 60 * MIN)).toEqual({
      winnerIds: ["a", "b"],
      draw: true,
      reason: "Equal round wins after the last round",
    });
  });

  it("gives the match to the player with more wins when rounds timed out", () => {
    // Best of 3: a wins round 1, the other two time out. 1 is not more than half.
    let state = win(start(3), "a", 1);
    state = onTick(state, T0 + 17 * MIN);
    expect(checkEnd(state, 60 * MIN)).toBeNull();
    state = onTick(state, T0 + 32 * MIN);
    expect(checkEnd(state, 60 * MIN)).toEqual({
      winnerIds: ["a"],
      draw: false,
      reason: "Won more rounds",
    });
  });

  it("stops early when the other player cannot catch up", () => {
    // Best of 5: a wins two, two rounds time out. One round left, b has 0.
    let state = win(win(start(), "a", 1), "a", 2);
    state = onTick(state, T0 + 33 * MIN);
    expect(state.rounds.length).toBe(4);
    expect(currentRound(state)).toBeNull();
    expect(checkEnd(state, 60 * MIN)).toEqual({
      winnerIds: ["a"],
      draw: false,
      reason: "Nobody can catch the leader",
    });
  });

  it("ends at once on a forfeit", () => {
    const state = initialState(
      config,
      [players[0], { ...players[1], forfeited: true }],
      problems,
      T0,
    );
    expect(checkEnd(state, 60 * MIN)?.reason).toBe(
      "The other player forfeited",
    );
  });
});

describe("blitz best of 1", () => {
  it("is decided by the single round", () => {
    const state = win(start(1), "b", 4);
    expect(currentRound(state)).toBeNull();
    expect(checkEnd(state, 60 * MIN)).toEqual({
      winnerIds: ["b"],
      draw: false,
      reason: "Won the round",
    });
  });

  it("is a draw when nobody solves in time", () => {
    const state = onTick(start(1), T0 + 15 * MIN);
    expect(checkEnd(state, 60 * MIN)).toEqual({
      winnerIds: ["a", "b"],
      draw: true,
      reason: "Equal round wins after the last round",
    });
  });
});

describe("blitz break between rounds", () => {
  const SEC = 1000;
  const withBreak = () =>
    initialState(
      { rounds: 3, roundMinutes: 15, breakSeconds: 20 },
      players,
      problems.slice(0, 3),
      T0,
    );
  const solveRound1 = () =>
    applySolve(withBreak(), {
      slot: 0,
      userId: "a",
      at: T0 + MIN,
      submissionId: 1,
    });

  it("keeps the next problem hidden during the break", () => {
    const state = solveRound1();
    expect(state.wins.a).toBe(1);
    expect(currentRound(state)).toBeNull();
    expect(state.nextRoundAt).toBe(T0 + MIN + 20 * SEC);
    expect(visibleSlots(state)).toEqual([0]);
    // The match is not over just because no round is open.
    expect(checkEnd(state, 60 * MIN)).toBeNull();
    // Still hidden one second before the break ends.
    expect(visibleSlots(onTick(state, T0 + MIN + 19 * SEC))).toEqual([0]);
  });

  it("starts the next round when the break ends, with a full round clock", () => {
    const state = onTick(solveRound1(), T0 + MIN + 25 * SEC);
    expect(state.nextRoundAt).toBeNull();
    expect(visibleSlots(state)).toEqual([0, 1]);
    expect(currentRound(state)).toMatchObject({
      slot: 1,
      startedAt: T0 + MIN + 20 * SEC,
    });
  });

  it("ignores a solve made during the break", () => {
    const state = solveRound1();
    const early = {
      slot: 1,
      userId: "b",
      at: T0 + MIN + 5 * SEC,
      submissionId: 2,
    };
    expect(applySolve(state, early)).toBe(state);
  });

  it("also takes a break after a round that timed out", () => {
    const state = onTick(withBreak(), T0 + 15 * MIN + SEC);
    expect(currentRound(state)).toBeNull();
    expect(state.nextRoundAt).toBe(T0 + 15 * MIN + 20 * SEC);
    const later = onTick(state, T0 + 15 * MIN + 20 * SEC);
    expect(currentRound(later)).toMatchObject({
      slot: 1,
      startedAt: T0 + 15 * MIN + 20 * SEC,
    });
  });

  it("takes no break after the deciding round", () => {
    let state = onTick(solveRound1(), T0 + 2 * MIN);
    state = applySolve(state, {
      slot: 1,
      userId: "a",
      at: T0 + 3 * MIN,
      submissionId: 3,
    });
    expect(state.nextRoundAt).toBeNull();
    expect(checkEnd(state, 60 * MIN)?.winnerIds).toEqual(["a"]);
  });
});
