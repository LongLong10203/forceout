"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatElapsed, seatText } from "../seats";
import type { BoardProps } from "../types";
import { currentRound, type BlitzState } from "./logic";

export function BlitzBoard({
  state,
  players,
  problems,
  userId,
  startsAt,
  now,
  finished,
  refresh,
}: BoardProps<BlitzState>) {
  const byId = new Map(players.map((p) => [p.userId, p]));
  const round = finished ? null : currentRound(state);
  const slot = round
    ? state.slots.find((s) => s.slot === round.slot)
    : undefined;
  const problem = slot?.problemId ? problems[slot.problemId] : undefined;
  const left =
    round && now !== null ? round.startedAt + state.roundMs - now : null;
  const played = state.rounds.filter((r) => r.endedAt !== null);
  // During the pause between rounds: when the next one starts.
  const nextRoundAt = finished || round ? null : (state.nextRoundAt ?? null);
  const untilNext =
    nextRoundAt !== null && now !== null ? nextRoundAt - now : null;

  // The moment a break or a round runs out, fetch the new board at once
  // instead of waiting for the next poll.
  const due =
    (untilNext !== null && untilNext <= 0) || (left !== null && left <= 0);
  useEffect(() => {
    if (due) refresh();
    // Only when `due` flips: `refresh` is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {players.map((player) => (
            <li key={player.userId} className="flex items-baseline gap-2">
              <span
                className={cn("font-mono font-medium", seatText(player.seat))}
              >
                {player.handle}
                {player.userId === userId && " (you)"}
              </span>
              <span className="font-mono text-2xl font-bold">
                {state.wins[player.userId] ?? 0}
              </span>
              {state.forfeited.includes(player.userId) && (
                <span className="text-xs text-muted-foreground">forfeited</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Best of {state.totalRounds} · first to{" "}
          {Math.floor(state.totalRounds / 2) + 1}
        </p>
      </div>

      {round && (
        <section className="rounded-lg border-2 bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                Round {round.slot + 1} of {state.totalRounds}
              </p>
              {problem ? (
                <a
                  href={problem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-xl font-bold underline-offset-4 hover:underline"
                >
                  {problem.id} · {problem.name}
                </a>
              ) : (
                <p className="mt-1 text-xl font-bold">Loading the problem...</p>
              )}
              {problem && (
                <p className="text-sm text-muted-foreground">
                  Rating {problem.rating}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Round time left</p>
              <p
                className={cn(
                  "font-mono text-3xl font-bold tabular-nums",
                  left !== null && left < 60_000 && "text-destructive",
                )}
              >
                {left === null
                  ? "-:--"
                  : formatElapsed(Math.max(0, left) + 999)}
              </p>
              {left !== null && left <= 0 && (
                <p className="text-xs text-muted-foreground">
                  Checking submissions...
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {nextRoundAt !== null && (
        <section className="rounded-lg border-2 border-dashed bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Round {state.rounds.length + 1} of {state.totalRounds}
              </p>
              <p className="mt-1 text-xl font-bold">Get ready</p>
              <p className="text-sm text-muted-foreground">
                The next problem appears when the countdown ends.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Next round in</p>
              <p className="font-mono text-3xl font-bold tabular-nums">
                {untilNext === null
                  ? "-:--"
                  : formatElapsed(Math.max(0, untilNext) + 999)}
              </p>
            </div>
          </div>
        </section>
      )}

      {played.length > 0 && (
        <ol className="flex flex-col gap-2">
          {played.map((r) => {
            const s = state.slots.find((x) => x.slot === r.slot);
            const p = s?.problemId ? problems[s.problemId] : undefined;
            const winner = r.winnerId ? byId.get(r.winnerId) : undefined;
            return (
              <li
                key={r.slot}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <span className="w-16 text-muted-foreground">
                  Round {r.slot + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {p ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {p.id} · {p.name}
                    </a>
                  ) : (
                    "Problem"
                  )}
                </span>
                {winner ? (
                  <span
                    className={cn(
                      "font-mono font-medium",
                      seatText(winner.seat),
                    )}
                  >
                    {winner.handle}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      at {formatElapsed((r.endedAt ?? startsAt) - startsAt)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Nobody (time ran out)
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
