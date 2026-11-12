// Works out what just happened in a room by comparing two snapshots of it.
// The room page uses the result for notifications, sounds and the activity
// feed. Pure, so it is unit tested in room-events.test.ts.

import type { RoomSnapshot } from "@/lib/room-types";

export type RoomEventKind =
  /** The host started the match. */
  | "start"
  /** The viewer claimed a problem. */
  | "claim_mine"
  /** Someone else claimed a problem. */
  | "claim_other"
  /** A new problem appeared (a Blitz round started). */
  | "reveal"
  | "end";

export type RoomEvent = {
  /** Unique within a room, so an event is never announced twice. */
  key: string;
  kind: RoomEventKind;
  /** Kept short, so it can be read at a glance while coding. */
  title: string;
  /** Extra detail, or an empty string when the title says it all. */
  body: string;
};

/** A short account of how the match ended, from the viewer's side. */
export function describeResult(room: RoomSnapshot, userId: string | null) {
  const result = room.result;
  if (!result) return "The match is over.";
  const names = result.winnerIds
    .map((id) => room.players.find((p) => p.userId === id)?.handle ?? "?")
    .join(" and ");
  const mine = userId !== null && result.winnerIds.includes(userId);

  if (result.winnerIds.length === 0) return `No winner. ${result.reason}.`;
  if (result.draw) return `Draw between ${names}. ${result.reason}.`;
  if (mine) return `You won! ${result.reason}.`;
  return `${names} won. ${result.reason}.`;
}

function scoreLine(room: RoomSnapshot) {
  return [...room.players]
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
    .map((p) => `${p.handle} ${p.score}`)
    .join(", ");
}

export function diffRoom(
  prev: RoomSnapshot,
  next: RoomSnapshot,
  userId: string | null,
): RoomEvent[] {
  const events: RoomEvent[] = [];
  const ended = prev.status === "live" && next.status === "finished";

  if (prev.status === "lobby" && next.status === "live") {
    events.push({
      key: "start",
      kind: "start",
      title: `${next.mode.name} match started`,
      body: "",
    });
    return events;
  }
  if (prev.status !== "live" || !next.board) return events;

  const handleOf = (id: string) =>
    next.players.find((p) => p.userId === id)?.handle ?? "Someone";
  const label = (problemId: string | null) => {
    const problem = problemId ? next.board?.problems[problemId] : undefined;
    return problem ? `${problem.id} · ${problem.name}` : "a problem";
  };

  // Newly claimed problems.
  const before = new Map(prev.board?.state.slots.map((s) => [s.slot, s]));
  for (const slot of next.board.state.slots) {
    if (slot.claimedBy === null || before.get(slot.slot)?.claimedBy) continue;
    const mine = slot.claimedBy === userId;
    const name = label(slot.problemId);
    events.push({
      key: `claim-${slot.slot}`,
      kind: mine ? "claim_mine" : "claim_other",
      title: mine
        ? `You claimed ${name}`
        : `${handleOf(slot.claimedBy)} solved ${name}`,
      body: "",
    });
  }

  // Problems that just appeared.
  if (!ended && prev.board) {
    for (const problem of Object.values(next.board.problems)) {
      if (prev.board.problems[problem.id]) continue;
      events.push({
        key: `reveal-${problem.id}`,
        kind: "reveal",
        title: `New problem: ${problem.id} · ${problem.name}`,
        body: `Rating ${problem.rating}`,
      });
    }
  }

  if (ended) {
    const me = next.players.find((p) => p.userId === userId);
    const title =
      me?.outcome === "win"
        ? "You won the match"
        : me?.outcome === "loss"
          ? "You lost the match"
          : me?.outcome === "draw"
            ? "The match is a draw"
            : "Match over";
    events.push({
      key: "end",
      kind: "end",
      title,
      body: `${next.result?.reason ?? "The match is over"}. ${scoreLine(next)}`,
    });
  }
  return events;
}
