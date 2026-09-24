import { describe, expect, it } from "vitest";
import { newGame, reduce } from "../../src/core/rules.ts";
import { neighborsOf } from "../../src/core/board.ts";

describe("board generation (first click safety)", () => {
  it("never places a mine on the first cell or any of its neighbours", () => {
    const config = { width: 9, height: 9, mines: 10 };
    for (let seed = 0; seed < 200; seed++) {
      for (const firstIndex of [0, 8, 40, 80]) {
        const state = reduce(newGame(config, seed), { type: "reveal", index: firstIndex });
        const board = state.board!;
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
      const state = reduce(newGame({ width: 9, height: 9, mines: 10 }, seed), {
        type: "reveal",
        index: 40,
      });
      expect(state.board!.cells.filter((c) => c.mine)).toHaveLength(10);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = reduce(newGame({ width: 9, height: 9, mines: 10 }, 123), { type: "reveal", index: 40 });
    const b = reduce(newGame({ width: 9, height: 9, mines: 10 }, 123), { type: "reveal", index: 40 });
    expect(a.board).toEqual(b.board);
  });
});
