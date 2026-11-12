import { blitz } from "./blitz";
import { classic } from "./classic";
import { tictactoe } from "./tictactoe";
import type { GameMode } from "./types";

// The registry. Adding a mode means adding its module and one line here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const modes: GameMode<any, any>[] = [classic, tictactoe, blitz];

export const DEFAULT_MODE_ID = classic.id;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMode(id: string): GameMode<any, any> | undefined {
  return modes.find((mode) => mode.id === id);
}

export type * from "./types";
