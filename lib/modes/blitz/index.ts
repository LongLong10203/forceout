import type { GameMode } from "../types";
import { BlitzBoard } from "./board";
import {
  applySolve,
  blitzConfigSchema,
  checkEnd,
  initialState,
  onTick,
  visibleSlots,
  type BlitzConfig,
  type BlitzState,
} from "./logic";

export const blitz: GameMode<BlitzConfig, BlitzState> = {
  id: "blitz",
  name: "Blitz",
  description:
    "One problem at a time. The first solve wins the round and the next round starts at once. Win more than half of the rounds.",
  minPlayers: 2,
  maxPlayers: 2,
  configSchema: blitzConfigSchema,
  configFields: [
    {
      key: "rounds",
      label: "Rounds (best of)",
      kind: "number",
      min: 1,
      max: 15,
      step: 2,
      default: 5,
    },
    {
      key: "roundMinutes",
      label: "Minutes per round",
      kind: "number",
      min: 1,
      max: 60,
      default: 15,
    },
    {
      key: "breakSeconds",
      label: "Break between rounds (seconds)",
      kind: "number",
      min: 0,
      max: 120,
      step: 5,
      default: 15,
    },
  ],
  describeConfig: (config) =>
    `Best of ${config.rounds}, ${config.roundMinutes} min per round` +
    (config.rounds > 1 && config.breakSeconds > 0
      ? `, ${config.breakSeconds} s break`
      : ""),

  // Blitz runs on round clocks. At most, every round uses its full time.
  matchDurationMs: (config) =>
    config.rounds * config.roundMinutes * 60_000 +
    (config.rounds - 1) * config.breakSeconds * 1000,

  problemCount: (config) => config.rounds,
  initialState,
  applySolve,
  checkEnd,
  visibleSlots,
  onTick,
  scores: (state) => state.wins,

  Board: BlitzBoard,
};
