import { describe, expect, it } from "vitest";
import { neighborsOf } from "../../src/core/board.ts";
import { generateBoard } from "../../src/core/generator.ts";

describe("random candidate board", () => {
  it("never places a mine on the first cell or any of its neighbours", () => {
    const config = { width: 9, height: 9, mines: 10 };
    for (let seed = 0; seed < 200; seed++) {
      for (const firstIndex of [0, 8, 40, 80]) {
        const board = generateBoard(config, seed, firstIndex);
        const forbidden = new Set([firstIndex, ...neighborsOf(firstIndex, config)]);
        for (const index of forbidden) {
          expect(board.cells[index].mine, `seed=${seed} index=${index}`).toBe(false);
        }
        expect(board.cells[firstIndex].adjacent).toBe(0);
      }
    }
  });

  it("places exactly the requested number of mines", () => {
    for (let seed = 0; seed < 50; seed++) {
      const board = generateBoard({ width: 9, height: 9, mines: 10 }, seed, 40);
      expect(board.cells.filter((c) => c.mine)).toHaveLength(10);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateBoard({ width: 9, height: 9, mines: 10 }, 123, 40);
    const b = generateBoard({ width: 9, height: 9, mines: 10 }, 123, 40);
    expect(a).toEqual(b);
  });
});
