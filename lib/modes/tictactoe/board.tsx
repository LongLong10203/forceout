"use client";

import { cn } from "@/lib/utils";
import { seatFill, seatText } from "../seats";
import type { BoardProps } from "../types";
import { cellCounts, winningLine, type TicTacToeState } from "./logic";

const MARKS = ["X", "O"];

export function TicTacToeBoard({
  state,
  players,
  problems,
  userId,
}: BoardProps<TicTacToeState>) {
  const byId = new Map(players.map((p) => [p.userId, p]));
  const counts = cellCounts(state);
  const line = winningLine(state);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {players.map((player) => (
          <li key={player.userId} className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-xl font-bold",
                seatText(player.seat),
              )}
            >
              {MARKS[player.seat] ?? "?"}
            </span>
            <span
              className={cn("font-mono font-medium", seatText(player.seat))}
            >
              {player.handle}
              {player.userId === userId && " (you)"}
            </span>
            <span className="text-sm text-muted-foreground">
              {counts[player.userId] ?? 0} cells
            </span>
            {state.forfeited.includes(player.userId) && (
              <span className="text-xs text-muted-foreground">forfeited</span>
            )}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-3 gap-2">
        {state.slots.map((slot) => {
          const problem = slot.problemId ? problems[slot.problemId] : undefined;
          const owner = slot.claimedBy ? byId.get(slot.claimedBy) : undefined;
          const inLine = line?.cells.includes(slot.slot);

          return (
            <div
              key={slot.slot}
              className={cn(
                "relative flex aspect-[4/3] flex-col justify-between rounded-lg border bg-card p-3",
                owner && seatFill(owner.seat),
                inLine && "ring-2 ring-foreground/70",
              )}
            >
              <div className="min-w-0">
                {problem ? (
                  <a
                    href={problem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium underline-offset-4 hover:underline"
                    title={`${problem.id} · ${problem.name}`}
                  >
                    {problem.id}
                    <span className="block truncate text-sm font-normal">
                      {problem.name}
                    </span>
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
              {owner ? (
                <p
                  className={cn(
                    "truncate font-mono text-sm font-medium",
                    seatText(owner.seat),
                  )}
                >
                  <span className="mr-1.5 text-lg font-bold">
                    {MARKS[owner.seat]}
                  </span>
                  {owner.handle}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Open</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
