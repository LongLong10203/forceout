"use client";

import { useEffect, useRef, useState } from "react";
import {
  diffRoom,
  type RoomEvent,
  type RoomEventKind,
} from "@/lib/room-events";
import type { RoomSnapshot } from "@/lib/room-types";

/** Notes (in Hz) for each kind of event, so they can be told apart by ear. */
const SOUNDS: Record<RoomEventKind, number[]> = {
  start: [523, 659, 784],
  claim_mine: [784, 1047],
  // Falling: someone else got there first.
  claim_other: [440, 330],
  reveal: [659, 659],
  end: [660, 880, 660, 880],
};

/** Which sound to play when several things happen at once. */
const PRIORITY: RoomEventKind[] = [
  "end",
  "claim_other",
  "claim_mine",
  "reveal",
  "start",
];

/** Short tones made in the browser, so no sound file is needed. */
function playTones(frequencies: number[]) {
  try {
    const audio = new AudioContext();
    frequencies.forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * 0.18;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.45);
    });
    setTimeout(() => audio.close(), frequencies.length * 180 + 800);
  } catch {
    // Browsers may block sound before the first click on the page.
  }
}

function showNotification(roomCode: string, event: RoomEvent) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  try {
    const notification = new Notification(event.title, {
      body: event.body,
      // One notification per event: a later one must not replace an earlier one.
      tag: `forceout-${roomCode}-${event.key}`,
    });
    // Clicking it brings the player back to the match.
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

export type FeedEntry = RoomEvent & { at: number };

/**
 * Announces what happens in the room while this page is open: the match
 * starting, a problem being claimed (so the others can stop working on it),
 * a new round, and the end of the match.
 *
 * Each event plays a sound and is added to the activity feed. A system
 * notification is shown only when the player is not looking at this tab,
 * which is the normal case: they are coding on Codeforces.
 */
export function useMatchAlerts(
  room: RoomSnapshot,
  userId: string | null,
): FeedEntry[] {
  const previous = useRef(room);
  const announced = useRef(new Set<string>());
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  useEffect(() => {
    const before = previous.current;
    previous.current = room;
    if (before === room) return;

    const events = diffRoom(before, room, userId).filter(
      (event) => !announced.current.has(event.key),
    );
    if (events.length === 0) return;
    events.forEach((event) => announced.current.add(event.key));

    const loudest = PRIORITY.find((kind) =>
      events.some((e) => e.kind === kind),
    );
    if (loudest) playTones(SOUNDS[loudest]);

    const away = document.hidden || !document.hasFocus();
    if (away) events.forEach((event) => showNotification(room.code, event));

    if (events.some((event) => event.kind === "end")) {
      document.title = "Match over · ForceOut";
    }

    const now = Date.now();
    // Newest first, and only the last few.
    setFeed((current) =>
      [
        ...events.map((event) => ({ ...event, at: now })).reverse(),
        ...current,
      ].slice(0, 6),
    );
  }, [room, userId]);

  return feed;
}
