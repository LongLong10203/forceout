"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { getMode } from "@/lib/modes";
import { formatElapsed, seatText } from "@/lib/modes/seats";
import { submissionUrl, type RoomSnapshot } from "@/lib/room-types";
import { cn } from "@/lib/utils";
import {
  checkMySubmissionsAction,
  devFakeSolveAction,
  forfeitAction,
  joinRoomAction,
  leaveRoomAction,
  setReadyAction,
  startMatchAction,
  type RoomActionState,
} from "./actions";
import { describeResult } from "@/lib/room-events";
import { useMatchAlerts, type FeedEntry } from "./match-alert";
import { useRoom, useServerNow } from "./use-room";

type Run = (action: () => Promise<RoomActionState>, after?: () => void) => void;

type ViewProps = {
  room: RoomSnapshot;
  userId: string | null;
  run: Run;
  pending: boolean;
};

export function RoomClient({
  initialRoom,
  serverNow,
  userId,
  devTools,
}: {
  initialRoom: RoomSnapshot;
  serverNow: string;
  userId: string | null;
  /** Show the development-only fake solve buttons. */
  devTools: boolean;
}) {
  const { room, offline, clockOffset, refresh } = useRoom(
    initialRoom,
    serverNow,
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const feed = useMatchAlerts(room, userId);

  /** Run a server action, show its error, then sync straight away. */
  const run: Run = (action, after) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else after?.();
      if (result.info) setInfo(result.info);
      await refresh();
    });
  };

  const view = { room, userId, run, pending };

  return (
    <div className="flex flex-col gap-6">
      {room.status === "cancelled" ? (
        <div className="flex flex-col items-start gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Room closed</h1>
          <p className="text-muted-foreground">The host closed this room.</p>
          <Link href="/play" className={buttonVariants()}>
            Back to Play
          </Link>
        </div>
      ) : room.status === "lobby" ? (
        <Lobby {...view} />
      ) : room.status === "live" ? (
        <LiveMatch
          {...view}
          clockOffset={clockOffset}
          devTools={devTools}
          feed={feed}
        />
      ) : (
        <Results {...view} />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-muted-foreground">{info}</p>}
      {offline && (
        <p className="text-sm text-muted-foreground">
          Lost contact with the server. Retrying...
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lobby

function Lobby({ room, userId, run, pending }: ViewProps) {
  const router = useRouter();
  const me = room.players.find((p) => p.userId === userId);

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">Lobby · room code</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-4xl font-bold tracking-[0.2em]">
            {room.code}
          </h1>
          <CopyInviteButton code={room.code} />
        </div>
      </div>

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-medium text-muted-foreground">Settings</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Setting label="Mode" value={room.mode.name} />
          <Setting label="Board" value={room.mode.summary} />
          {!room.mode.ownClock && (
            <Setting
              label="Duration"
              value={`${room.settings.durationMinutes} min`}
            />
          )}
          <Setting
            label="Rating"
            value={`${room.settings.ratingMin} to ${room.settings.ratingMax}`}
          />
        </dl>
        {(room.settings.includeTags.length > 0 ||
          room.settings.excludeTags.length > 0) && (
          <p className="mt-3 text-sm text-muted-foreground">
            {room.settings.includeTags.length > 0 &&
              `Required tags: ${room.settings.includeTags.join(", ")}. `}
            {room.settings.excludeTags.length > 0 &&
              `Banned tags: ${room.settings.excludeTags.join(", ")}.`}
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-medium text-muted-foreground">
          Players ({room.players.length} of {room.maxPlayers})
        </h2>
        <ul className="mt-3 divide-y">
          {room.players.map((player) => (
            <li key={player.userId} className="flex items-center gap-3 py-2.5">
              <span className="font-mono font-medium">{player.handle}</span>
              {player.rating !== null && (
                <span className="text-xs text-muted-foreground">
                  {player.rating}
                </span>
              )}
              {player.userId === userId && (
                <span className="text-xs text-muted-foreground">(you)</span>
              )}
              <span
                className={cn(
                  "ml-auto text-sm",
                  player.isHost
                    ? "text-muted-foreground"
                    : player.ready
                      ? "text-emerald-400"
                      : "text-amber-400",
                )}
              >
                {player.isHost ? "Host" : player.ready ? "Ready" : "Not ready"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {me && <NotificationPrompt />}

      {!me ? (
        <div>
          <Button
            size="lg"
            disabled={pending}
            onClick={() => run(() => joinRoomAction(room.code))}
          >
            Join this room
          </Button>
        </div>
      ) : me.isHost ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="lg"
              disabled={pending || room.startBlockedBy !== null}
              onClick={() => run(() => startMatchAction(room.code))}
            >
              {pending ? "Working..." : "Start match"}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => leaveRoomAction(room.code))}
            >
              Close room
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {room.startBlockedBy ??
              "Starting reads each player's solved problems from Codeforces, which takes a few seconds."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="lg"
              variant={me.ready ? "outline" : "default"}
              disabled={pending}
              onClick={() => run(() => setReadyAction(room.code, !me.ready))}
            >
              {me.ready ? "Not ready" : "I'm ready"}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => leaveRoomAction(room.code),
                  () => router.push("/play"),
                )
              }
            >
              Leave
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {me.ready
              ? "Waiting for the host to start."
              : "Press ready when you are set."}
          </p>
        </div>
      )}
    </>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function CopyInviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/room/${code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code on screen still works.
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? "Copied" : "Copy invite link"}
    </Button>
  );
}

const subscribeToNothing = () => () => {};

/** Asks for permission to show a system notification when the match ends. */
function NotificationPrompt() {
  // Null on the server, which cannot see the browser's setting.
  const browserPermission = useSyncExternalStore(
    subscribeToNothing,
    () => ("Notification" in window ? Notification.permission : "unsupported"),
    () => null,
  );
  // The browser does not announce a change, so remember the answer here.
  const [answer, setAnswer] = useState<NotificationPermission | null>(null);
  const permission = answer ?? browserPermission;

  if (permission === null || permission === "granted") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
      {permission === "default" ? (
        <>
          <p className="flex-1 text-muted-foreground">
            Get a notification when the match starts, when someone claims a
            problem (so you can stop working on it), and when the match ends.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () =>
              setAnswer(await Notification.requestPermission())
            }
          >
            Turn on notifications
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">
          Notifications are off for this site, so claims and the end of the
          match are announced with a sound only. Keep this tab open. You can
          allow notifications in your browser&apos;s site settings.
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------- live match

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

function LiveMatch({
  room,
  userId,
  run,
  pending,
  clockOffset,
  devTools,
  feed,
}: ViewProps & {
  clockOffset: number;
  devTools: boolean;
  feed: FeedEntry[];
}) {
  const now = useServerNow(clockOffset, true);
  const endsAt = room.endsAt ? Date.parse(room.endsAt) : null;
  const left = now !== null && endsAt !== null ? endsAt - now : null;
  const me = room.players.find((p) => p.userId === userId);
  const playing = me && me.outcome !== "forfeit";

  // Show the time left in the tab title: the player is usually on Codeforces.
  useEffect(() => {
    document.title =
      left !== null && !room.mode.ownClock
        ? `${formatClock(left)} · ForceOut`
        : "Live match · ForceOut";
  }, [left, room.mode.ownClock]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {room.mode.name} · room {room.code}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {left !== null && left <= 0
              ? "Checking final submissions..."
              : "Match is live"}
          </h1>
        </div>
        {/* A mode with its own clock shows it on its board. */}
        {!room.mode.ownClock && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Time left</p>
            <p
              className={cn(
                "font-mono text-3xl font-bold tabular-nums",
                left !== null && left < 60_000 && "text-destructive",
              )}
            >
              {left === null ? "-:--" : formatClock(left)}
            </p>
          </div>
        )}
      </div>

      <Board room={room} userId={userId} now={now} />

      {feed.length > 0 && (
        <section
          aria-live="polite"
          className="rounded-lg border bg-card p-4 text-card-foreground"
        >
          <h2 className="text-sm font-medium text-muted-foreground">
            Activity
          </h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {feed.map((entry, i) => (
              <li
                key={entry.key}
                className={cn(i > 0 && "text-muted-foreground")}
              >
                <span className="font-medium">{entry.title}</span>
                {entry.body && <> · {entry.body}</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Open a problem, solve it and submit on Codeforces. An accepted
        submission claims the problem by itself, usually within seconds. Keep
        this tab open: it notifies you when someone claims a problem and when
        the match ends. If you close it, the match keeps running, and the home
        page has a button to come back.
      </p>

      {playing && <NotificationPrompt />}

      {playing && (
        <div className="flex flex-wrap items-center gap-2">
          <CheckButton room={room} run={run} pending={pending} />
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Forfeit this match? You cannot undo this.")) {
                run(() => forfeitAction(room.code));
              }
            }}
          >
            Forfeit
          </Button>
        </div>
      )}

      {devTools && <FakeSolvePanel room={room} run={run} pending={pending} />}
    </>
  );
}

const CHECK_COOLDOWN_SECONDS = 15;

/** Puts this player first in line for a Codeforces check. */
function CheckButton({
  room,
  run,
  pending,
}: Pick<ViewProps, "room" | "run" | "pending">) {
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || cooldown > 0}
      onClick={() => {
        setCooldown(CHECK_COOLDOWN_SECONDS);
        run(() => checkMySubmissionsAction(room.code));
      }}
    >
      {cooldown > 0 ? `Check again in ${cooldown}s` : "Check my submissions"}
    </Button>
  );
}

/** Draws the board with the mode's own component. */
function Board({
  room,
  userId,
  now,
}: {
  room: RoomSnapshot;
  userId: string | null;
  now: number | null;
}) {
  const queryClient = useQueryClient();
  const mode = getMode(room.mode.id);
  if (!mode || !room.board || !room.startsAt) {
    return <p className="text-muted-foreground">The board is not available.</p>;
  }
  return (
    <mode.Board
      state={room.board.state}
      players={room.players}
      problems={room.board.problems}
      userId={userId}
      startsAt={Date.parse(room.startsAt)}
      now={now}
      refresh={() =>
        queryClient.invalidateQueries({ queryKey: ["room", room.code] })
      }
      finished={room.status === "finished"}
    />
  );
}

/** Development only: claim any open problem as any player. */
function FakeSolvePanel({
  room,
  run,
  pending,
}: Pick<ViewProps, "room" | "run" | "pending">) {
  const open = (room.board?.state.slots ?? []).filter(
    (slot) => slot.problemId !== null && slot.claimedBy === null,
  );

  return (
    <section className="rounded-lg border border-dashed p-4">
      <h2 className="text-sm font-medium">Fake solve (development only)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Claims a problem as if that player had just solved it on Codeforces.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {open.map((slot) => (
          <li
            key={slot.slot}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="w-16 font-mono">{slot.problemId}</span>
            {room.players
              .filter((p) => p.outcome !== "forfeit")
              .map((player) => (
                <Button
                  key={player.userId}
                  variant="outline"
                  size="xs"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      devFakeSolveAction(room.code, slot.slot, player.userId),
                    )
                  }
                >
                  {player.handle}
                </Button>
              ))}
          </li>
        ))}
        {open.length === 0 && (
          <li className="text-sm text-muted-foreground">No open problems.</li>
        )}
      </ul>
    </section>
  );
}

// -------------------------------------------------------------- results

function Results({ room, userId }: ViewProps) {
  const result = room.result;
  const startsAt = room.startsAt ? Date.parse(room.startsAt) : 0;
  const me = room.players.find((p) => p.userId === userId);
  const byId = new Map(room.players.map((p) => [p.userId, p]));

  const headline =
    me?.outcome === "win"
      ? "You won"
      : me?.outcome === "draw"
        ? "Draw"
        : me?.outcome === "loss"
          ? "You lost"
          : me?.outcome === "forfeit"
            ? "You forfeited"
            : "Match finished";

  const claims = (room.board?.state.slots ?? [])
    .filter((slot) => slot.claimedBy !== null && slot.claimedAt !== null)
    .sort((a, b) => a.claimedAt! - b.claimedAt!);

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">
          {room.mode.name} · room {room.code} · finished
        </p>
        <h1
          className={cn(
            "text-3xl font-bold tracking-tight",
            me?.outcome === "win" && "text-emerald-400",
          )}
        >
          {headline}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {describeResult(room, userId)}
          {result && startsAt > 0 && (
            <>
              {" "}
              The match lasted{" "}
              {formatElapsed(Date.parse(result.endedAt) - startsAt)}.
            </>
          )}
        </p>
      </div>

      <Board room={room} userId={userId} now={null} />

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-medium text-muted-foreground">
          Claim timeline
        </h2>
        {claims.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nobody solved anything.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {claims.map((slot) => {
              const player = byId.get(slot.claimedBy!);
              const problem = slot.problemId
                ? room.board?.problems[slot.problemId]
                : undefined;
              return (
                <li
                  key={slot.slot}
                  className="flex flex-wrap items-baseline gap-x-3"
                >
                  <span className="w-14 font-mono text-muted-foreground tabular-nums">
                    {formatElapsed(slot.claimedAt! - startsAt)}
                  </span>
                  <span
                    className={cn(
                      "font-mono font-medium",
                      seatText(player?.seat ?? 0),
                    )}
                  >
                    {player?.handle ?? "?"}
                  </span>
                  <span>
                    solved{" "}
                    {problem ? `${problem.id} · ${problem.name}` : "a problem"}
                  </span>
                  {slot.submissionId !== null && slot.problemId ? (
                    <a
                      href={submissionUrl(slot.problemId, slot.submissionId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground underline underline-offset-4"
                    >
                      submission {slot.submissionId}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      (fake solve)
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div>
        <Link href="/play" className={buttonVariants({ size: "lg" })}>
          Play again
        </Link>
      </div>
    </>
  );
}
