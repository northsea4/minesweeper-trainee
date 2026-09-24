import { emptyBoard, neighborsOf } from "./board.ts";
import { makeRng } from "./rng.ts";
import type { Board, BoardConfig } from "./types.ts";

export function minePositions(
  config: BoardConfig,
  seed: number,
  firstIndex: number,
): number[] {
  const { width, height, mines } = config;
  const total = width * height;
  const forbidden = new Set([firstIndex, ...neighborsOf(firstIndex, config)]);
  const allowed: number[] = [];
  for (let index = 0; index < total; index++) {
    if (!forbidden.has(index)) allowed.push(index);
  }
  const rng = makeRng(seed);
  const count = Math.min(mines, allowed.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (allowed.length - i));
    const tmp = allowed[i];
    allowed[i] = allowed[j];
    allowed[j] = tmp;
  }
  return allowed.slice(0, count);
}

export function generateBoard(config: BoardConfig, seed: number, firstIndex: number): Board {
  const board = emptyBoard(config);
  for (const index of minePositions(config, seed, firstIndex)) {
    board.cells[index].mine = true;
  }
  for (let index = 0; index < board.cells.length; index++) {
    if (board.cells[index].mine) continue;
    board.cells[index].adjacent = neighborsOf(index, config).filter(
      (n) => board.cells[n].mine,
    ).length;
  }
  return board;
}
