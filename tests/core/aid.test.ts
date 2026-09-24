import { describe, expect, it } from "vitest";
import { nextAid } from "../../src/core/aid.ts";
import { neighborsOf } from "../../src/core/board.ts";
import { generateNoGuess } from "../../src/core/generator.ts";
import type { Board } from "../../src/core/types.ts";

function revealArea(board: Board, revealed: Map<number, number>, start: number): void {
  const config = { width: board.width, height: board.height, mines: board.mines };
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (revealed.has(index)) continue;
    revealed.set(index, board.cells[index].adjacent);
    if (board.cells[index].adjacent === 0) {
      for (const neighbor of neighborsOf(index, config)) {
        if (!revealed.has(neighbor)) stack.push(neighbor);
      }
    }
  }
}

function beginner(seed: number, firstIndex = 40) {
  const result = generateNoGuess({ config: { width: 9, height: 9, mines: 10 }, seed, firstIndex });
  if (!result.ok) throw new Error("generation failed");
  const revealed = new Map<number, number>();
  revealArea(result.board, revealed, firstIndex);
  return { board: result.board, revealed };
}

describe("nextAid", () => {
  it("returns a sound step derived from the current clues", () => {
    for (let seed = 0; seed < 8; seed++) {
      const { board, revealed } = beginner(seed);
      const aid = nextAid(board, revealed, new Set());
      expect(aid.step, `seed=${seed}`).not.toBeNull();
      if (!aid.step) continue;
      for (const cell of aid.step.proof.conclusion.cells) {
        if (aid.step.action === "reveal") expect(board.cells[cell].mine).toBe(false);
        else expect(board.cells[cell].mine).toBe(true);
      }
    }
  });

  it("reports a conflict when a proven-safe cell is flagged", () => {
    const { board, revealed } = beginner(1);
    const aid = nextAid(board, revealed, new Set());
    expect(aid.step?.action).toBe("reveal");
    const flagged = new Set([aid.step!.index]);
    const conflicted = nextAid(board, revealed, flagged);
    expect(conflicted.conflict).toBe(true);
  });

  it("ignores player flags as evidence for deductions", () => {
    const { board, revealed } = beginner(2);
    const base = nextAid(board, revealed, new Set());
    expect(base.step).not.toBeNull();
    const step = base.step!;
    let unrelated = -1;
    for (let cell = 0; cell < 81; cell++) {
      if (
        !revealed.has(cell) &&
        cell !== step.index &&
        !step.proof.conclusion.cells.includes(cell)
      ) {
        unrelated = cell;
        break;
      }
    }
    expect(unrelated).toBeGreaterThanOrEqual(0);
    const withWrongFlag = nextAid(board, revealed, new Set([unrelated]));
    expect(withWrongFlag.step).toEqual(step);
  });

  it("returns no step when nothing is certain", () => {
    const board: Board = {
      width: 9,
      height: 9,
      mines: 1,
      cells: Array.from({ length: 81 }, () => ({ mine: false, adjacent: 0 })),
    };
    const revealed = new Map([[40, 1]]);
    const aid = nextAid(board, revealed, new Set());
    expect(aid.step).toBeNull();
  });

  it("solves a whole board by repeatedly taking the next step", () => {
    const { board } = beginner(3);
    const revealed = new Map<number, number>();
    revealArea(board, revealed, 40);
    const flags = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const aid = nextAid(board, revealed, flags);
      if (!aid.step) break;
      if (aid.step.action === "reveal") {
        expect(board.cells[aid.step.index].mine).toBe(false);
        revealArea(board, revealed, aid.step.index);
      } else {
        expect(board.cells[aid.step.index].mine).toBe(true);
        flags.add(aid.step.index);
      }
    }
    expect(revealed.size).toBe(81 - 10);
  });
});
