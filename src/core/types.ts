export const ALGORITHM_VERSION = 1;
export const PRNG_VERSION = 1;

export type CellMark = "hidden" | "flagged" | "revealed";

export interface BoardConfig {
  width: number;
  height: number;
  mines: number;
}

export interface BoardKey {
  algorithmVersion: number;
  prngVersion: number;
  seed: number;
  width: number;
  height: number;
  mines: number;
  firstIndex: number;
}

export interface Cell {
  mine: boolean;
  adjacent: number;
}

export interface Board {
  width: number;
  height: number;
  mines: number;
  cells: Cell[];
}

export type GameStatus = "ready" | "playing" | "won" | "lost";

export interface GameState {
  config: BoardConfig;
  seed: number;
  status: GameStatus;
  firstIndex: number | null;
  board: Board | null;
  marks: CellMark[];
  revealedCount: number;
  flaggedCount: number;
  reviewIndex: number | null;
}

export type GameAction =
  | { type: "reveal"; index: number }
  | { type: "toggleFlag"; index: number }
  | { type: "chord"; index: number }
  | { type: "restart"; seed?: number };
