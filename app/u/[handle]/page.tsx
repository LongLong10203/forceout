import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { getProfile } from "@/lib/profile";
import type { PlayerOutcome } from "@/lib/room-types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile · ForceOut" };

const OUTCOME_LABEL: Record<PlayerOutcome, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  forfeit: "Forfeit",
};

const OUTCOME_CLASS: Record<PlayerOutcome, string> = {
  win: "text-emerald-400",
  loss: "text-rose-400",
  draw: "text-amber-400",
  forfeit: "text-muted-foreground",
};

async function ProfileContent({
  params,
}: Pick<PageProps<"/u/[handle]">, "params">) {
  const { handle } = await params;
  const profile = await getProfile(decodeURIComponent(handle));
  if (!profile) notFound();

  const { record } = profile;
  const played = record.win + record.loss + record.draw + record.forfeit;

  return (
    <>
      <div>
        <h1 className="font-mono text-3xl font-bold tracking-tight">
          {profile.handle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.rating !== null
            ? `Codeforces rating ${profile.rating}`
            : "No Codeforces rating"}{" "}
          ·{" "}
          <a
            href={`https://codeforces.com/profile/${profile.handle}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Codeforces profile
          </a>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Matches", played, ""],
            ["Wins", record.win, OUTCOME_CLASS.win],
            ["Losses", record.loss + record.forfeit, OUTCOME_CLASS.loss],
            ["Draws", record.draw, OUTCOME_CLASS.draw],
          ] as const
        ).map(([label, value, className]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn("font-mono text-2xl font-semibold", className)}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          Match history
        </h2>
        {profile.matches.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No finished matches yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {profile.matches.map((match) => (
              <li key={match.code}>
                <Link
                  href={`/room/${match.code}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "w-14 font-medium",
                      match.outcome && OUTCOME_CLASS[match.outcome],
                    )}
                  >
                    {match.outcome ? OUTCOME_LABEL[match.outcome] : "-"}
                  </span>
                  <span className="w-24">{match.modeName}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono">{match.score}</span>
                    <span className="text-muted-foreground"> vs </span>
                    {match.opponents.map((o, i) => (
                      <span key={o.handle}>
                        {i > 0 && ", "}
                        <span className="font-mono">{o.handle}</span>{" "}
                        <span className="font-mono text-muted-foreground">
                          ({o.score})
                        </span>
                      </span>
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {match.endedAt && <LocalTime iso={match.endedAt} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        }
      >
        <ProfileContent params={params} />
      </Suspense>
    </main>
  );
}
