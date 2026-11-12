"use client";

import { cn } from "@/lib/utils";
import { formatElapsed, seatBorder, seatText } from "../seats";
import type { BoardProps } from "../types";
import type { ClassicState } from "./logic";

export function ClassicBoard({
  state,
  players,
  problems,
  userId,
  startsAt,
}: BoardProps<ClassicState>) {
  const byId = new Map(players.map((p) => [p.userId, p]));
  const ranked = [...players].sort(
    (a, b) =>
      state.scores[b.userId] - state.scores[a.userId] || a.seat - b.seat,
  );

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {ranked.map((player) => (
          <li key={player.userId} className="flex items-baseline gap-2">
            <span
              className={cn("font-mono font-medium", seatText(player.seat))}
            >
              {player.handle}
            </span>
            <span className="font-mono text-2xl font-bold">
              {state.scores[player.userId]}
            </span>
            {state.forfeited.includes(player.userId) && (
              <span className="text-xs text-muted-foreground">forfeited</span>
            )}
          </li>
        ))}
      </ul>

      <ol className="flex flex-col gap-2">
        {state.slots.map((slot) => {
          const problem = slot.problemId ? problems[slot.problemId] : undefined;
          const claimer = slot.claimedBy ? byId.get(slot.claimedBy) : undefined;

          return (
            <li
              key={slot.slot}
              className={cn(
                "flex items-center gap-4 rounded-lg border border-l-4 bg-card p-3",
                claimer ? seatBorder(claimer.seat) : "border-l-border",
                claimer && "bg-muted/40",
              )}
            >
              <span className="w-12 shrink-0 text-right font-mono text-lg font-bold">
                {slot.points}
              </span>
              <div className="min-w-0 flex-1">
                {problem ? (
                  <a
                    href={problem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {problem.id} · {problem.name}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Hidden</span>
                )}
                {problem && (
                  <p className="text-xs text-muted-foreground">
                    Rating {problem.rating}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm">
                {claimer ? (
                  <>
                    <p
                      className={cn(
                        "font-mono font-medium",
                        seatText(claimer.seat),
                      )}
                    >
                      {claimer.handle}
                      {claimer.userId === userId && " (you)"}
                    </p>
                    {slot.claimedAt !== null && (
                      <p className="text-xs text-muted-foreground">
                        at {formatElapsed(slot.claimedAt - startsAt)}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Open</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
