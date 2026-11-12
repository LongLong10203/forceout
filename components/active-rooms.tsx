import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getActiveRooms } from "@/lib/rooms";
import { getCurrentUser } from "@/lib/session";

/**
 * The signed-in player's unfinished rooms, each with a button back in.
 * Renders nothing for guests and for players with no open room.
 * Reads the session: place it inside a <Suspense> boundary.
 */
export async function ActiveRooms() {
  const user = await getCurrentUser();
  if (!user) return null;
  const rooms = await getActiveRooms(user.id);
  if (rooms.length === 0) return null;

  return (
    <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-5">
      <h2 className="font-medium">
        {rooms.length === 1 ? "You have a room open" : "You have rooms open"}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {rooms.map((room) => (
          <li
            key={room.code}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">
                  {room.timeUp
                    ? "Match over"
                    : room.status === "live"
                      ? "Live match"
                      : "Lobby"}
                </span>{" "}
                · {room.modeName} ·{" "}
                <span className="font-mono tracking-wider">{room.code}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {room.opponents.length > 0
                  ? `With ${room.opponents.join(", ")}`
                  : "Waiting for players"}
              </p>
            </div>
            <Link href={`/room/${room.code}`} className={buttonVariants()}>
              {room.timeUp
                ? "See results"
                : room.status === "live"
                  ? "Return to match"
                  : "Return to lobby"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
