import type { GameMode } from "../types";
import { TicTacToeBoard } from "./board";
import {
  applySolve,
  cellCounts,
  checkEnd,
  initialState,
  tictactoeConfigSchema,
  type TicTacToeConfig,
  type TicTacToeState,
} from "./logic";

export const tictactoe: GameMode<TicTacToeConfig, TicTacToeState> = {
  id: "tictactoe",
  name: "Tic-Tac-Toe",
  description:
    "A 3 x 3 grid with one problem per cell. The first solve takes the cell, and three in a row, column or diagonal wins.",
  minPlayers: 2,
  maxPlayers: 2,
  configSchema: tictactoeConfigSchema,
  configFields: [],
  describeConfig: () => "3 x 3 grid, 9 problems",

  problemCount: () => 9,
  initialState,
  applySolve,
  checkEnd,
  visibleSlots: (state) => state.slots.map((s) => s.slot),
  onTick: (state) => state,
  scores: cellCounts,

  Board: TicTacToeBoard,
};
