import { neighborsOf } from "../../src/core/board.ts";

export interface ForcedCells {
  safe: Set<number>;
  mine: Set<number>;
  models: number;
}

/**
 * Independent exact oracle: enumerates every mine placement consistent with the
 * public clues and the total mine count, then reports cells that are safe/mine in
 * every model. Intentionally separate from the production analyzer.
 */
export function forcedCells(
  width: number,
  height: number,
  mines: number,
  revealedNumbers: ReadonlyMap<number, number>,
  knownMines: ReadonlySet<number>,
): ForcedCells {
  const total = width * height;
  const unknown: number[] = [];
  for (let index = 0; index < total; index++) {
    if (!revealedNumbers.has(index) && !knownMines.has(index)) unknown.push(index);
  }
  const need = mines - knownMines.size;
  const constraints = [...revealedNumbers].map(([index, value]) => ({
    neighbours: neighborsOf(index, { width, height }),
    value,
  }));

  const safe = new Set(unknown);
  const mine = new Set(unknown);
  const chosen: number[] = [];
  let models = 0;

  const isConsistent = (): boolean => {
    for (const constraint of constraints) {
      let count = 0;
      for (const neighbour of constraint.neighbours) {
        if (knownMines.has(neighbour) || chosen.includes(neighbour)) count++;
      }
      if (count !== constraint.value) return false;
    }
    return true;
  };

  const record = (): void => {
    models++;
    const inModel = new Set(chosen);
    for (const cell of unknown) {
      if (inModel.has(cell)) safe.delete(cell);
      else mine.delete(cell);
    }
  };

  const walk = (start: number, remaining: number): void => {
    if (remaining === 0) {
      if (isConsistent()) record();
      return;
    }
    for (let i = start; i <= unknown.length - remaining; i++) {
      chosen.push(unknown[i]);
      walk(i + 1, remaining - 1);
      chosen.pop();
    }
  };

  if (need < 0 || need > unknown.length) {
    return { safe: new Set(), mine: new Set(), models: 0 };
  }
  walk(0, need);
  return { safe, mine, models };
}
