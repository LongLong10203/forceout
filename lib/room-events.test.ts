import { describe, expect, it } from "vitest";
import { diffRoom } from "./room-events";
import type { RoomSnapshot } from "./room-types";

const slot = (
  n: number,
  problemId: string | null,
  claimedBy: string | null = null,
) => ({
  slot: n,
  problemId,
  points: 100,
  claimedBy,
  claimedAt: claimedBy ? 1 : null,
  submissionId: null,
});
const info = (id: string, name: string) => ({
  id,
  name,
  rating: 1000,
  url: "",
});

function room(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code: "ABC234",
    status: "live",
    version: 1,
    mode: { id: "classic", name: "Classic", summary: "", ownClock: false },
    settings: {
      durationMinutes: 60,
      ratingMin: 800,
      ratingMax: 1200,
      includeTags: [],
      excludeTags: [],
    },
    minPlayers: 2,
    maxPlayers: 8,
    players: [
      {
        userId: "a",
        handle: "alice",
        rating: null,
        seat: 0,
        ready: true,
        isHost: true,
        score: 0,
        outcome: null,
      },
      {
        userId: "b",
        handle: "bob",
        rating: null,
        seat: 1,
        ready: true,
        isHost: false,
        score: 0,
        outcome: null,
      },
    ],
    startBlockedBy: null,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-01-01T01:00:00.000Z",
    board: {
      state: { slots: [slot(0, "1A"), slot(1, "2B")] },
      problems: {
        "1A": info("1A", "Theatre Square"),
        "2B": info("2B", "Winner"),
      },
    },
    result: null,
    ...over,
  };
}

const claimed = (by: string) =>
  room({
    board: {
      state: { slots: [slot(0, "1A", by), slot(1, "2B")] },
      problems: {
        "1A": info("1A", "Theatre Square"),
        "2B": info("2B", "Winner"),
      },
    },
  });

describe("diffRoom", () => {
  it("reports nothing when nothing changed", () => {
    expect(diffRoom(room(), room(), "a")).toEqual([]);
  });

  it("announces the start of the match", () => {
    const events = diffRoom(
      room({ status: "lobby", board: null }),
      room(),
      "b",
    );
    expect(events.map((e) => e.kind)).toEqual(["start"]);
    expect(events[0].title).toBe("Classic match started");
  });

  it("tells the other player when a problem is taken", () => {
    const [event] = diffRoom(room(), claimed("b"), "a");
    expect(event).toMatchObject({
      kind: "claim_other",
      title: "bob solved 1A · Theatre Square",
      body: "",
    });
  });

  it("tells the solver their own claim went through", () => {
    const [event] = diffRoom(room(), claimed("a"), "a");
    expect(event).toMatchObject({
      kind: "claim_mine",
      title: "You claimed 1A · Theatre Square",
    });
  });

  it("does not repeat a claim that was already there", () => {
    expect(diffRoom(claimed("b"), claimed("b"), "a")).toEqual([]);
  });

  it("in a mode with rounds, announces the solve and then the next problem", () => {
    const blitz = { id: "blitz", name: "Blitz", summary: "", ownClock: true };
    const before = room({
      mode: blitz,
      board: {
        state: { slots: [slot(0, "1A"), slot(1, null)] },
        problems: { "1A": info("1A", "Theatre Square") },
      },
    });
    const won = room({
      mode: blitz,
      board: {
        state: { slots: [slot(0, "1A", "b"), slot(1, null)] },
        problems: { "1A": info("1A", "Theatre Square") },
      },
    });
    expect(diffRoom(before, won, "a")[0]).toMatchObject({
      title: "bob solved 1A · Theatre Square",
      body: "",
    });

    const nextRound = room({
      mode: blitz,
      board: {
        state: { slots: [slot(0, "1A", "b"), slot(1, "2B")] },
        problems: {
          "1A": info("1A", "Theatre Square"),
          "2B": info("2B", "Winner"),
        },
      },
    });
    expect(diffRoom(won, nextRound, "a")).toEqual([
      {
        key: "reveal-2B",
        kind: "reveal",
        title: "New problem: 2B · Winner",
        body: "Rating 1000",
      },
    ]);
  });

  it("announces the end with the outcome and the final score", () => {
    const finished = {
      ...claimed("b"),
      status: "finished" as const,
      result: {
        winnerIds: ["b"],
        draw: false,
        reason: "Time ran out",
        endedAt: "",
      },
      players: [
        { ...room().players[0], score: 0, outcome: "loss" as const },
        { ...room().players[1], score: 100, outcome: "win" as const },
      ],
    };
    const loser = diffRoom(claimed("b"), finished, "a");
    expect(loser).toEqual([
      {
        key: "end",
        kind: "end",
        title: "You lost the match",
        body: "Time ran out. bob 100, alice 0",
      },
    ]);
    expect(diffRoom(claimed("b"), finished, "b")[0].title).toBe(
      "You won the match",
    );
    expect(diffRoom(claimed("b"), finished, null)[0].title).toBe("Match over");
  });

  it("reports a claim and the end together when one solve decides the match", () => {
    const finished = {
      ...claimed("b"),
      status: "finished" as const,
      result: {
        winnerIds: ["b"],
        draw: false,
        reason: "Three in a row",
        endedAt: "",
      },
    };
    const events = diffRoom(room(), finished, "a");
    expect(events.map((e) => e.kind)).toEqual(["claim_other", "end"]);
  });
});
