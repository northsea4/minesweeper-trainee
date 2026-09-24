import { describe, expect, it } from "vitest";
import { analyze } from "../../src/core/analyze.ts";
import { forcedCells } from "../support/oracle.ts";

describe("analyze direct rules", () => {
  it("proves all neighbours safe once every mine around a clue is known", () => {
    const result = analyze({
      width: 3,
      height: 3,
      mines: 1,
      revealedNumbers: new Map([[4, 1]]),
      knownMines: new Set([8]),
    });
    expect(result.status).toBe("progress");
    const safe = result.deductions.filter((d) => d.action === "reveal").map((d) => d.index).sort();
    expect(safe).toEqual([0, 1, 2, 3, 5, 6, 7]);
    expect(result.deductions.every((d) => d.proof.technique === "direct-safe")).toBe(true);
  });

  it("proves a single remaining neighbour is a mine", () => {
    const result = analyze({
      width: 3,
      height: 3,
      mines: 1,
      revealedNumbers: new Map([
        [4, 1],
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [5, 1],
        [6, 0],
        [7, 1],
      ]),
      knownMines: new Set(),
    });
    const mine = result.deductions.find((d) => d.action === "mark-mine");
    expect(mine?.index).toBe(8);
    expect(mine?.proof.technique).toBe("direct-mine");
  });

  it("uses subset difference to prove mines", () => {
    const result = analyze({
      width: 3,
      height: 2,
      mines: 2,
      revealedNumbers: new Map([
        [3, 1],
        [4, 2],
        [5, 1],
      ]),
      knownMines: new Set(),
    });
    const mines = result.deductions
      .filter((d) => d.action === "mark-mine")
      .map((d) => d.index)
      .sort();
    expect(mines).toContain(0);
    expect(mines).toContain(2);
    expect(result.deductions.some((d) => d.proof.technique === "subset")).toBe(true);
  });

  it("reasons only from proven mines, never from player flags", () => {
    const withoutProof = analyze({
      width: 3,
      height: 3,
      mines: 1,
      revealedNumbers: new Map([[4, 1]]),
      knownMines: new Set(),
    });
    expect(withoutProof.status).toBe("needs-guess");
    const withProof = analyze({
      width: 3,
      height: 3,
      mines: 1,
      revealedNumbers: new Map([[4, 1]]),
      knownMines: new Set([8]),
    });
    expect(withProof.status).toBe("progress");
    expect(withProof.deductions.every((d) => d.action === "reveal")).toBe(true);
  });

  it("reports needs-guess when nothing is provable", () => {
    const result = analyze({
      width: 9,
      height: 9,
      mines: 10,
      revealedNumbers: new Map([[40, 1]]),
      knownMines: new Set(),
    });
    expect(result.status).toBe("needs-guess");
    expect(result.deductions).toEqual([]);
  });
});

describe("analyze agrees with the exact oracle", () => {
  it("matches forced safe/mine cells on small states", () => {
    const cases = [
      {
        width: 3,
        height: 2,
        mines: 2,
        revealed: new Map([
          [3, 1],
          [4, 2],
          [5, 1],
        ]),
      },
      { width: 3, height: 3, mines: 1, revealed: new Map([[4, 1]]) },
      {
        width: 4,
        height: 4,
        mines: 3,
        revealed: new Map([
          [5, 1],
          [6, 1],
          [9, 1],
        ]),
      },
    ];
    for (const testCase of cases) {
      const result = analyze({
        width: testCase.width,
        height: testCase.height,
        mines: testCase.mines,
        revealedNumbers: testCase.revealed,
        knownMines: new Set(),
      });
      const oracle = forcedCells(
        testCase.width,
        testCase.height,
        testCase.mines,
        testCase.revealed,
        new Set(),
      );
      expect(oracle.models).toBeGreaterThan(0);
      const analyzedSafe = new Set(
        result.deductions.filter((d) => d.action === "reveal").map((d) => d.index),
      );
      const analyzedMine = new Set(
        result.deductions.filter((d) => d.action === "mark-mine").map((d) => d.index),
      );
      for (const cell of analyzedSafe) expect(oracle.safe.has(cell)).toBe(true);
      for (const cell of analyzedMine) expect(oracle.mine.has(cell)).toBe(true);
    }
  });
});
