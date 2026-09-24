import { neighborsOf } from "./board.ts";
import type { Board } from "./types.ts";

/**
 * Expands a reveal from `start`, returning each newly revealed cell. A cell is
 * skipped (and not traversed through) when `isVisited` already reports it, so
 * flagged or already-revealed cells block the flood.
 */
export function floodReveal(
  board: Board,
  start: number,
  isVisited: (index: number) => boolean,
): number[] {
  const config = { width: board.width, height: board.height, mines: board.mines };
  const freshly: number[] = [];
  const seen = new Set<number>();
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (seen.has(index) || isVisited(index)) continue;
    if (board.cells[index].mine) continue;
    seen.add(index);
    freshly.push(index);
    if (board.cells[index].adjacent === 0) {
      for (const neighbor of neighborsOf(index, config)) {
        if (!seen.has(neighbor) && !isVisited(neighbor)) stack.push(neighbor);
      }
    }
  }
  return freshly;
}
