import type { BoardConfig, CellMark, GameMode, GameState, GameStatus } from "./types.ts";

export const SAVE_SCHEMA_VERSION = 1;

export interface SerializedBoard {
  width: number;
  height: number;
  mines: number;
  mine: number[];
  adjacent: number[];
}

export interface SavedGame {
  schemaVersion: number;
  config: BoardConfig;
  mode: GameMode;
  seed: number;
  status: GameStatus;
  firstIndex: number | null;
  board: SerializedBoard | null;
  marks: CellMark[];
  revealedCount: number;
  flaggedCount: number;
  reviewIndex: number | null;
  revives: number;
  elapsedMs: number;
  timestamp: number;
}

export function serializeGame(
  state: GameState,
  elapsedMs: number,
  timestamp = 0,
): SavedGame {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    config: state.config,
    mode: state.mode,
    seed: state.seed,
    status: state.status,
    firstIndex: state.firstIndex,
    board: state.board
      ? {
          width: state.board.width,
          height: state.board.height,
          mines: state.board.mines,
          mine: state.board.cells.map((cell) => (cell.mine ? 1 : 0)),
          adjacent: state.board.cells.map((cell) => cell.adjacent),
        }
      : null,
    marks: [...state.marks],
    revealedCount: state.revealedCount,
    flaggedCount: state.flaggedCount,
    reviewIndex: state.reviewIndex,
    revives: state.revives,
    elapsedMs,
    timestamp,
  };
}

export function deserializeGame(saved: SavedGame): GameState {
  return {
    config: saved.config,
    mode: saved.mode,
    seed: saved.seed,
    status: saved.status,
    firstIndex: saved.firstIndex,
    board: saved.board
      ? {
          width: saved.board.width,
          height: saved.board.height,
          mines: saved.board.mines,
          cells: saved.board.mine.map((mine, index) => ({
            mine: mine === 1,
            adjacent: saved.board!.adjacent[index],
          })),
        }
      : null,
    marks: [...saved.marks],
    revealedCount: saved.revealedCount,
    flaggedCount: saved.flaggedCount,
    reviewIndex: saved.reviewIndex,
    revives: saved.revives,
  };
}

export function isResumable(saved: SavedGame | null): boolean {
  if (!saved) return false;
  return saved.status === "playing" || saved.status === "paused";
}

export function isCompatibleSave(saved: unknown): saved is SavedGame {
  if (typeof saved !== "object" || saved === null) return false;
  const candidate = saved as Partial<SavedGame>;
  return candidate.schemaVersion === SAVE_SCHEMA_VERSION && Array.isArray(candidate.marks);
}
