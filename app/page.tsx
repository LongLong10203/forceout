import { Suspense } from "react";
import Link from "next/link";
import { ActiveRooms } from "@/components/active-rooms";
import { buttonVariants } from "@/components/ui/button";
import { modes } from "@/lib/modes";

const STEPS = [
  {
    title: "Create a room",
    text: "Pick a mode, a rating range and tags, then send your friend the invite link or the 6 character code.",
  },
  {
    title: "Solve on Codeforces",
    text: "Everyone gets the same problems, none of which any player has solved before. You submit on codeforces.com as usual.",
  },
  {
    title: "First solve claims it",
    text: "ForceOut watches your submissions. The first Accepted one claims the problem and locks it for everyone else.",
  },
];

function playersLabel(min: number, max: number) {
  return min === max ? `${min} players` : `${min} to ${max} players`;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-14 px-4 py-16">
      <section className="flex flex-col items-start gap-5">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Duel your friends on Codeforces problems.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          ForceOut is a real-time race. Join a room, get the same problems, and
          solve them on Codeforces. The first to solve a problem claims it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/play" className={buttonVariants({ size: "lg" })}>
            Create room
          </Link>
          <Link
            href="/play"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Join with a code
          </Link>
        </div>
      </section>

      {/* Only shows for a signed-in player with an unfinished room. */}
      <Suspense fallback={null}>
        <ActiveRooms />
      </Suspense>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-lg border bg-card p-5">
              <p className="font-mono text-sm text-muted-foreground">{i + 1}</p>
              <h3 className="mt-1 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Game modes</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {modes.map((mode) => (
            <li key={mode.id} className="rounded-lg border bg-card p-5">
              <h3 className="font-medium">{mode.name}</h3>
              <p className="text-xs text-muted-foreground">
                {playersLabel(mode.minPlayers, mode.maxPlayers)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
