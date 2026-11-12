import type { ComponentType } from "react";
import type { z } from "zod";

/** One host-editable setting of a mode, drawn by the room creation form. */
export type ModeConfigField = {
  key: string;
  label: string;
  kind: "number";
  min: number;
  max: number;
  step?: number;
  default: number;
  help?: string;
};

export type ModePlayer = {
  userId: string;
  seat: number;
  /** A player who gave up. They stay on the board but cannot win. */
  forfeited: boolean;
};

/** A problem the engine picked for the match. */
export type PickedProblem = { problemId: string; rating: number };

/** One place on the board that holds a problem and can be claimed once. */
export type SlotState = {
  /** List position, grid cell, or round number. */
  slot: number;
  /** Null only in the copy sent to the browser, for slots that are still hidden. */
  problemId: string | null;
  points: number;
  claimedBy: string | null;
  /** Milliseconds since the epoch. */
  claimedAt: number | null;
  submissionId: number | null;
};

/**
 * Every mode's state has the slots. The engine reads and stores them, and
 * knows nothing else about a mode's state (scores, grids, rounds, ...).
 */
export type BaseState = { slots: SlotState[] };

export type SolveEvent = {
  slot: number;
  userId: string;
  /** Codeforces submission time, in milliseconds since the epoch. */
  at: number;
  submissionId: number | null;
};

export type MatchOutcome = {
  /** One winner, or everyone who shares a draw. Empty if nobody won. */
  winnerIds: string[];
  draw: boolean;
  /** Shown to players, for example "Time ran out". */
  reason: string;
};

export type BoardPlayer = { userId: string; handle: string; seat: number };

export type ProblemInfo = {
  id: string;
  name: string;
  rating: number;
  url: string;
};

export type BoardProps<State> = {
  state: State;
  players: BoardPlayer[];
  /** Details of the visible problems, by problem ID. */
  problems: Record<string, ProblemInfo>;
  /** The viewer, or null for a guest. */
  userId: string | null;
  /** Match start, in milliseconds since the epoch. */
  startsAt: number;
  /** Server time, updated every second. Null until the page has loaded. */
  now: number | null;
  finished: boolean;
  /**
   * Ask the server for the latest board now, without waiting for the next
   * poll. For a board that knows something is due (a round about to start).
   */
  refresh: () => void;
};

/**
 * A game mode. Each mode is one self-contained module in /lib/modes, and the
 * match engine calls it without knowing its rules.
 *
 * All functions must be pure: same input, same output, no clock, no database.
 * The engine rebuilds the state from the stored claims by replaying them, so
 * `initialState` in particular must always lay out the same board for the
 * same input.
 */
export type GameMode<Config = unknown, State extends BaseState = BaseState> = {
  id: string;
  name: string;
  /** One or two sentences for the room creation screen. */
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** The settings the host can change, with defaults and limits. */
  configSchema: z.ZodType<Config>;
  /** The same settings, described for the form. */
  configFields: ModeConfigField[];
  /** A short line for the lobby, for example "5 problems". */
  describeConfig(config: Config): string;

  /**
   * For a mode with its own clock (Blitz rounds): the longest the match can
   * last. Without it, the room's "duration" setting is used.
   */
  matchDurationMs?(config: Config): number;

  /** How many problems the engine must pick. */
  problemCount(config: Config): number;
  /** The starting board. Decides which problem goes in which slot. */
  initialState(
    config: Config,
    players: ModePlayer[],
    problems: PickedProblem[],
    startsAt: number,
  ): State;
  /** The state after a solve. A solve on a claimed slot changes nothing. */
  applySolve(state: State, solve: SolveEvent): State;
  /** Null while the match goes on, or the result once it is over. */
  checkEnd(state: State, timeLeftMs: number): MatchOutcome | null;
  /** The slots players may see now. The rest never reach the browser. */
  visibleSlots(state: State): number[];
  /** Changes caused by time alone (for example a round timing out). */
  onTick(state: State, now: number): State;
  /** Each player's score, stored for history. */
  scores(state: State): Record<string, number>;

  /** Draws the state. */
  Board: ComponentType<BoardProps<State>>;
};
