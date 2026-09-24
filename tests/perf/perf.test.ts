import { describe, expect, it } from "vitest";
import { generateBoard, generateNoGuess, validatePreset } from "../../src/core/generator.ts";
import { newGame, reduce } from "../../src/core/rules.ts";
import { serializeGame } from "../../src/core/save.ts";
import type { BoardConfig } from "../../src/core/types.ts";

const BEGINNER: BoardConfig = { width: 9, height: 9, mines: 10 };
const EXPERT: BoardConfig = { width: 30, height: 16, mines: 99 };

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

describe("generation budget", () => {
  it("generates the default preset within p95 300ms and p99 800ms", () => {
    const samples: number[] = [];
    for (let seed = 0; seed < 20; seed++) {
      const start = performance.now();
      const result = generateNoGuess({ config: BEGINNER, seed, firstIndex: 40 });
      samples.push(performance.now() - start);
      expect(result.ok, `seed=${seed}`).toBe(true);
    }
    expect(percentile(samples, 95)).toBeLessThanOrEqual(300);
    expect(percentile(samples, 99)).toBeLessThanOrEqual(800);
  });

  it("either meets the extreme-preset budget or fails explicitly", () => {
    const samples: number[] = [];
    for (let seed = 0; seed < 5; seed++) {
      const start = performance.now();
      const result = generateNoGuess({
        config: EXPERT,
        seed,
        firstIndex: 200,
        budget: { deadlineMs: 2000 },
      });
      samples.push(performance.now() - start);
      if (result.ok) continue;
      expect(result.reason === "budget-exhausted" || result.reason === "cancelled").toBe(true);
    }
    // Enforced at ~2s; allow one in-flight certification step of overshoot.
    expect(percentile(samples, 95)).toBeLessThanOrEqual(2200);
  });
});

describe("input and persistence budget", () => {
  it("keeps a reveal well under a 60fps frame", () => {
    const board = generateBoard(BEGINNER, 3, 40);
    let state = reduce(newGame(BEGINNER, 3, "training"), {
      type: "start",
      board,
      firstIndex: 40,
    });
    state = reduce(state, { type: "reveal", index: 40 });
    const samples: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const start = performance.now();
      reduce(state, { type: "toggleFlag", index: i % state.marks.length });
      samples.push(performance.now() - start);
    }
    expect(percentile(samples, 95)).toBeLessThan(16);
  });

  it("serialises a snapshot within the 50ms commit budget", () => {
    const board = generateBoard(EXPERT, 3, 200);
    const state = reduce(newGame(EXPERT, 3, "challenge"), {
      type: "start",
      board,
      firstIndex: 200,
    });
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      serializeGame(state, i, i);
      samples.push(performance.now() - start);
    }
    expect(percentile(samples, 95)).toBeLessThan(50);
  });
});

describe("measured density cap", () => {
  it("accepts measured-safe densities and rejects denser presets", () => {
    // docs/perf/baseline.md records 9x9 reliably generating up to ~30 mines.
    const result = generateNoGuess({
      config: { ...BEGINNER, mines: 30 },
      seed: 1,
      firstIndex: 40,
      budget: { deadlineMs: 2000 },
    });
    expect(result.ok).toBe(true);
    expect(validatePreset({ ...BEGINNER, mines: 30 })).toBe(true);
    expect(validatePreset({ ...BEGINNER, mines: 32 })).toBe(false);
  });
});
