import { Suspense } from "react";
import type { Metadata } from "next";
import { ActiveRooms } from "@/components/active-rooms";
import { DEFAULT_MODE_ID, modes } from "@/lib/modes";
import { getAllTags } from "@/lib/rooms";
import { requireVerifiedUser } from "@/lib/session";
import { CreateRoomForm, JoinForm, type ModeOption } from "./play-forms";

export const metadata: Metadata = { title: "Play · ForceOut" };

function playersLabel(min: number, max: number) {
  return min === max ? `Exactly ${min} players` : `${min} to ${max} players`;
}

async function PlayContent() {
  // Creating or joining a room needs a verified Codeforces handle.
  await requireVerifiedUser("/play");
  const tags = await getAllTags();

  // Only plain data can cross to the browser, so strip the Zod schemas.
  const modeOptions: ModeOption[] = modes.map((mode) => ({
    id: mode.id,
    name: mode.name,
    description: mode.description,
    players: playersLabel(mode.minPlayers, mode.maxPlayers),
    ownClock: Boolean(mode.matchDurationMs),
    configFields: mode.configFields,
  }));

  return (
    <>
      <ActiveRooms />

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="font-medium">Join a room</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Type the 6 character code your friend sent you.
        </p>
        <JoinForm />
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="font-medium">Create a room</h2>
        <CreateRoomForm
          modes={modeOptions}
          defaultModeId={DEFAULT_MODE_ID}
          tags={tags}
        />
      </section>
    </>
  );
}

export default function PlayPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Play</h1>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading...</p>}
      >
        <PlayContent />
      </Suspense>
    </main>
  );
}
