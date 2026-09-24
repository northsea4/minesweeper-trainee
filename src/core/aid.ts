import { analyze, type Deduction } from "./analyze.ts";
import { neighborsOf } from "./board.ts";
import type { Board } from "./types.ts";

export interface AidResult {
  step: Deduction | null;
  conflict: boolean;
  solved: boolean;
}

/**
 * Finds the next certain action a learner could take from the current public
 * state, reusing the same `analyze` and proofs as generation. Player flags are
 * ignored as evidence: they are only used to avoid re-suggesting a cell and to
 * report a conflicting (possibly wrong) mark.
 */
export function nextAid(
  board: Board,
  revealedNumbers: ReadonlyMap<number, number>,
  playerFlags: ReadonlySet<number>,
  maxSteps = 5000,
): AidResult {
  const knownMines = new Set<number>();
  const revealed = new Map(revealedNumbers);
  const totalSafe = board.cells.length - board.mines;
  let step: Deduction | null = null;
  let conflict = false;

  for (let iteration = 0; iteration < maxSteps; iteration++) {
    if (revealed.size >= totalSafe) break;
    const result = analyze({
      width: board.width,
      height: board.height,
      mines: board.mines,
      revealedNumbers: revealed,
      knownMines,
    });
    if (result.status !== "progress" || result.deductions.length === 0) break;

    let applied = false;
    for (const deduction of result.deductions) {
      if (deduction.action !== "reveal") continue;
      if (revealed.has(deduction.index)) continue;
      if (playerFlags.has(deduction.index)) {
        conflict = true;
        continue;
      }
      if (!step) step = deduction;
      revealArea(board, revealed, deduction.index);
      applied = true;
      break;
    }
    if (applied) continue;

    for (const deduction of result.deductions) {
      if (deduction.action !== "mark-mine") continue;
      if (knownMines.has(deduction.index)) continue;
      knownMines.add(deduction.index);
      if (!step && !playerFlags.has(deduction.index)) step = deduction;
      applied = true;
      break;
    }
    if (!applied) break;
  }

  return { step, conflict, solved: revealed.size >= totalSafe };
}

function revealArea(
  board: Board,
  revealed: Map<number, number>,
  start: number,
): void {
  const config = { width: board.width, height: board.height, mines: board.mines };
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (revealed.has(index)) continue;
    if (board.cells[index].mine) continue;
    revealed.set(index, board.cells[index].adjacent);
    if (board.cells[index].adjacent === 0) {
      for (const neighbor of neighborsOf(index, config)) {
        if (!revealed.has(neighbor)) stack.push(neighbor);
      }
    }
  }
}
