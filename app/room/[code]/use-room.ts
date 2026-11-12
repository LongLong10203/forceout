"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RoomSnapshot, SyncResponse } from "@/lib/room-types";

const POLL_MS = 3000;

/**
 * The room, kept fresh by polling the sync endpoint every 3 seconds.
 * Also tracks how far the browser clock is from the server clock, so the
 * match timer is right even when the computer's clock is not.
 */
export function useRoom(initialRoom: RoomSnapshot, serverNow: string) {
  const queryClient = useQueryClient();
  const queryKey = ["room", initialRoom.code];
  const [clockOffset, setClockOffset] = useState(0);
  const offsetKnown = useRef(false);

  function noteServerTime(iso: string) {
    const offset = Date.parse(iso) - Date.now();
    // Ignore jitter under a second so the timer does not jump around.
    setClockOffset((current) =>
      offsetKnown.current && Math.abs(current - offset) < 1000
        ? current
        : offset,
    );
    offsetKnown.current = true;
  }

  const query = useQuery({
    queryKey,
    initialData: initialRoom,
    refetchInterval: POLL_MS,
    // Keep polling in a background tab: the player is on Codeforces.
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<RoomSnapshot> => {
      const current =
        queryClient.getQueryData<RoomSnapshot>(queryKey) ?? initialRoom;
      const response = await fetch(
        `/api/room/${current.code}/sync?v=${current.version}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Sync failed (${response.status})`);
      const data = (await response.json()) as SyncResponse;
      noteServerTime(data.now);
      // Returning the same object keeps React from re-rendering.
      return data.changed ? data.room : current;
    },
  });

  // The page was rendered a moment ago, so this first estimate is rough.
  // The first sync replaces it.
  useEffect(() => {
    if (!offsetKnown.current)
      setClockOffset(Date.parse(serverNow) - Date.now());
  }, [serverNow]);

  return {
    room: query.data,
    offline: query.isError,
    clockOffset,
    refresh: () => queryClient.invalidateQueries({ queryKey }),
  };
}

/** The server's current time in milliseconds, updated every second. */
export function useServerNow(clockOffset: number, running: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now() + clockOffset);
    tick();
    if (!running) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [clockOffset, running]);
  return now;
}
