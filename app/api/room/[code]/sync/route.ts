import { tickMatch } from "@/lib/match-engine";
import { pollCodeforces } from "@/lib/match-poller";
import { normalizeRoomCode, type SyncResponse } from "@/lib/room-types";
import { getRoomSnapshot, getRoomVersion } from "@/lib/rooms";

/**
 * The room page calls this every 3 seconds with the version it already has
 * (?v=12). It gets the full room back only when something changed.
 *
 * There is no background worker, so each call also does the background work:
 * - If the Codeforces rate-limit slot is free, it checks one player: the one
 *   in any live match who was checked longest ago.
 * - It lets this match move forward in time (end when the timer runs out).
 */

// The fair-claim rule and the final check wait for rate-limit slots.
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: RouteContext<"/api/room/[code]/sync">,
) {
  const { code: rawCode } = await context.params;
  const code = normalizeRoomCode(rawCode);
  const known = Number(new URL(request.url).searchParams.get("v") ?? -1);

  await pollCodeforces(code);
  await tickMatch(code);

  const current = await getRoomVersion(code);
  if (!current) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }
  const now = new Date().toISOString();
  if (current.version === known) {
    return Response.json({
      changed: false,
      version: current.version,
      now,
    } satisfies SyncResponse);
  }

  const room = await getRoomSnapshot(code);
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  return Response.json({ changed: true, room, now } satisfies SyncResponse);
}
