// Types shared by the server and the browser for rooms.
import { z } from "zod";
import type { BaseState, ProblemInfo } from "@/lib/modes/types";

export const RATING_MIN = 800;
export const RATING_MAX = 3500;

/** Settings every room has, whatever the mode. */
export const roomSettingsSchema = z
  .object({
    durationMinutes: z.coerce.number().int().min(5).max(180).default(60),
    ratingMin: z.coerce
      .number()
      .int()
      .min(RATING_MIN)
      .max(RATING_MAX)
      .multipleOf(100),
    ratingMax: z.coerce
      .number()
      .int()
      .min(RATING_MIN)
      .max(RATING_MAX)
      .multipleOf(100),
    includeTags: z.array(z.string().max(60)).max(40).default([]),
    excludeTags: z.array(z.string().max(60)).max(40).default([]),
  })
  .refine((s) => s.ratingMin <= s.ratingMax, {
    message: "The lowest rating must not be above the highest rating.",
  });

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

/** What is stored in matches.config. */
export type RoomConfig = RoomSettings & {
  /** The mode's own settings, validated by its configSchema. */
  mode: Record<string, unknown>;
};

export type RoomStatus = "lobby" | "live" | "finished" | "cancelled";
export type PlayerOutcome = "win" | "loss" | "draw" | "forfeit";

export type RoomPlayer = {
  userId: string;
  handle: string;
  rating: number | null;
  seat: number;
  ready: boolean;
  isHost: boolean;
  score: number;
  /** Set when the match ends, or as soon as the player forfeits. */
  outcome: PlayerOutcome | null;
};

/** What is stored in matches.result. */
export type MatchResult = {
  winnerIds: string[];
  draw: boolean;
  reason: string;
  /** ISO time. */
  endedAt: string;
};

/** The board as the browser may see it: hidden slots carry no problem. */
export type RoomBoard = {
  state: BaseState;
  problems: Record<string, ProblemInfo>;
};

/** Everything the room page needs to draw itself. Returned by the sync endpoint. */
export type RoomSnapshot = {
  code: string;
  status: RoomStatus;
  version: number;
  mode: {
    id: string;
    name: string;
    summary: string;
    /** The mode runs on its own clock (Blitz rounds), not the room duration. */
    ownClock: boolean;
  };
  settings: RoomSettings;
  minPlayers: number;
  maxPlayers: number;
  players: RoomPlayer[];
  /** Why the host cannot start yet, or null when the match can start. */
  startBlockedBy: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Null in the lobby. */
  board: RoomBoard | null;
  result: MatchResult | null;
};

/** `now` is the server clock, so the browser can correct its own for the timer. */
export type SyncResponse =
  | { changed: false; version: number; now: string }
  | { changed: true; room: RoomSnapshot; now: string };

export const ROOM_CODE_LENGTH = 6;

/** Tidy up a typed or pasted room code. */
export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function submissionUrl(problemId: string, submissionId: number) {
  const contestId = problemId.match(/^\d+/)?.[0];
  return `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
}
