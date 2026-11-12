import type { GameMode } from "../types";
import { ClassicBoard } from "./board";
import {
  applySolve,
  checkEnd,
  classicConfigSchema,
  initialState,
  type ClassicConfig,
  type ClassicState,
} from "./logic";

export const classic: GameMode<ClassicConfig, ClassicState> = {
  id: "classic",
  name: "Classic",
  description:
    "A list of problems ordered by rating. The first solve takes a problem's points, and the highest score when time runs out wins.",
  minPlayers: 2,
  maxPlayers: 8,
  configSchema: classicConfigSchema,
  configFields: [
    {
      key: "problemCount",
      label: "Number of problems",
      kind: "number",
      min: 3,
      max: 10,
      default: 5,
    },
  ],
  describeConfig: (config) => `${config.problemCount} problems`,

  problemCount: (config) => config.problemCount,
  initialState,
  applySolve,
  checkEnd,
  // Every problem is visible from the start, and nothing changes with time alone.
  visibleSlots: (state) => state.slots.map((s) => s.slot),
  onTick: (state) => state,
  scores: (state) => state.scores,

  Board: ClassicBoard,
};
