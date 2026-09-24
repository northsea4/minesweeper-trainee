import { neighborsOf } from "./board.ts";
import { PRNG_VERSION } from "./rng.ts";
import {
  ALGORITHM_VERSION,
  POLICY_VERSION,
  type Board,
  type BoardConfig,
  type BoardKey,
  type CellMark,
  type GameAction,
  type GameMode,
  type GameState,
  type GameStatus,
} from "./types.ts";

function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

export function isTimerRunning(state: GameState): boolean {
  if (state.status === "playing") return true;
  return state.status === "paused" && state.mode === "challenge";
}

export function isPlayable(state: GameState): boolean {
  return state.status === "ready" || state.status === "playing";
}

export function newGame(
  config: BoardConfig,
  seed: number,
  mode: GameMode = "training",
): GameState {
  return {
    config,
    mode,
    seed,
    status: "ready",
    firstIndex: null,
    board: null,
    marks: new Array<CellMark>(config.width * config.height).fill("hidden"),
    revealedCount: 0,
    flaggedCount: 0,
    reviewIndex: null,
    revives: 0,
  };
}

export function newGameWithBoard(
  config: BoardConfig,
  board: Board,
  seed: number,
  firstIndex: number,
  mode: GameMode = "training",
): GameState {
  return {
    ...newGame(config, seed, mode),
    status: "playing",
    firstIndex,
    board,
  };
}

export function boardKey(state: GameState): BoardKey | null {
  if (state.firstIndex === null || state.board === null) return null;
  return {
    algorithmVersion: ALGORITHM_VERSION,
    policyVersion: POLICY_VERSION,
    prngVersion: PRNG_VERSION,
    seed: state.seed,
    width: state.config.width,
    height: state.config.height,
    mines: state.config.mines,
    firstIndex: state.firstIndex,
  };
}

export function remainingMines(state: GameState): number {
  return state.config.mines - state.flaggedCount;
}

function floodReveal(
  board: Board,
  marks: CellMark[],
  start: number,
  config: BoardConfig,
): number {
  const stack = [start];
  let revealed = 0;
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (marks[index] !== "hidden") continue;
    if (board.cells[index].mine) continue;
    marks[index] = "revealed";
    revealed++;
    if (board.cells[index].adjacent === 0) {
      for (const neighbor of neighborsOf(index, config)) {
        if (marks[neighbor] === "hidden") stack.push(neighbor);
      }
    }
  }
  return revealed;
}

function applyReveal(state: GameState, index: number): GameState {
  if (index < 0 || index >= state.marks.length) return state;
  if (state.marks[index] !== "hidden") return state;
  const board = state.board;
  if (board === null) return state;
  if (board.cells[index].mine) {
    if (state.mode === "challenge") {
      return { ...state, status: "lost", reviewIndex: index };
    }
    return { ...state, reviewIndex: index, revives: state.revives + 1 };
  }
  const marks = state.marks.slice();
  const revealed = floodReveal(board, marks, index, state.config);
  const revealedCount = state.revealedCount + revealed;
  const won = revealedCount === state.marks.length - board.mines;
  const status: GameStatus = won ? "won" : "playing";
  return { ...state, marks, revealedCount, status };
}

function reveal(state: GameState, index: number): GameState {
  if (!isPlayable(state)) return state;
  if (index < 0 || index >= state.marks.length) return state;
  if (state.marks[index] === "flagged") return state;
  if (state.status === "ready") {
    if (state.board === null) return state;
    return applyReveal({ ...state, status: "playing" }, index);
  }
  return applyReveal(state, index);
}

function start(state: GameState, board: Board, firstIndex: number, seed?: number): GameState {
  if (state.status !== "ready") return state;
  if (state.board !== null) return state;
  if (firstIndex < 0 || firstIndex >= state.marks.length) return state;
  return { ...state, board, firstIndex, seed: seed ?? state.seed, status: "playing" };
}

function toggleFlag(state: GameState, index: number): GameState {
  if (state.status !== "ready" && state.status !== "playing") return state;
  if (index < 0 || index >= state.marks.length) return state;
  const marks = state.marks.slice();
  let flaggedCount = state.flaggedCount;
  if (marks[index] === "revealed") return state;
  if (marks[index] === "flagged") {
    marks[index] = "hidden";
    flaggedCount--;
  } else {
    marks[index] = "flagged";
    flaggedCount++;
  }
  return { ...state, marks, flaggedCount };
}

function chord(state: GameState, index: number): GameState {
  if (state.status !== "playing" || state.board === null) return state;
  if (index < 0 || index >= state.marks.length) return state;
  if (state.marks[index] !== "revealed") return state;
  const adjacent = state.board.cells[index].adjacent;
  if (adjacent === 0) return state;
  const neighbors = neighborsOf(index, state.config);
  const flags = neighbors.filter((n) => state.marks[n] === "flagged").length;
  if (flags !== adjacent) return state;
  let current = state;
  for (const neighbor of neighbors) {
    if (current.marks[neighbor] === "hidden") {
      current = applyReveal(current, neighbor);
      if (current.status === "lost") return current;
    }
  }
  return current;
}

function pause(state: GameState): GameState {
  if (state.status !== "playing") return state;
  return { ...state, status: "paused" };
}

function resume(state: GameState): GameState {
  if (state.status !== "paused") return state;
  return { ...state, status: "playing" };
}

function giveUp(state: GameState): GameState {
  if (state.status !== "playing" && state.status !== "paused") return state;
  return { ...state, status: "abandoned" };
}

function clearReview(state: GameState): GameState {
  if (state.reviewIndex === null) return state;
  return { ...state, reviewIndex: null };
}

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "restart":
      return newGame(state.config, action.seed ?? nextSeed(state.seed), state.mode);
    case "start":
      return start(state, action.board, action.firstIndex, action.seed);
    case "reveal":
      return reveal(state, action.index);
    case "toggleFlag":
      return toggleFlag(state, action.index);
    case "chord":
      return chord(state, action.index);
    case "pause":
      return pause(state);
    case "resume":
      return resume(state);
    case "giveUp":
      return giveUp(state);
    case "clearReview":
      return clearReview(state);
  }
}
