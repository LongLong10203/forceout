import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { devAccountsEnabled } from "@/lib/dev-accounts";
import { tickMatch } from "@/lib/match-engine";
import { normalizeRoomCode } from "@/lib/room-types";
import { getRoomSnapshot } from "@/lib/rooms";
import { getCurrentUser, requireVerifiedUser } from "@/lib/session";
import { RoomClient } from "./room-client";

export const metadata: Metadata = { title: "Room · ForceOut" };

async function Room({ params }: Pick<PageProps<"/room/[code]">, "params">) {
  const code = normalizeRoomCode((await params).code);
  // If nobody had the room open when the timer ran out, the match closes now.
  await tickMatch(code);
  const room = await getRoomSnapshot(code);

  if (!room) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>
          There is no room with the code{" "}
          <span className="font-mono font-semibold">{code}</span>.
        </p>
        <Link href="/play" className={buttonVariants()}>
          Back to Play
        </Link>
      </div>
    );
  }

  // Anyone may look at a finished match. Everything else needs a signed-in
  // player with a verified handle.
  const user =
    room.status === "finished"
      ? await getCurrentUser()
      : await requireVerifiedUser(`/room/${code}`);

  return (
    <RoomClient
      initialRoom={room}
      serverNow={new Date().toISOString()}
      userId={user?.id ?? null}
      devTools={devAccountsEnabled}
    />
  );
}

export default function RoomPage({ params }: PageProps<"/room/[code]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading room...</p>
        }
      >
        <Room params={params} />
      </Suspense>
    </main>
  );
}
