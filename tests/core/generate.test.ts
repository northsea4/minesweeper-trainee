import { describe, expect, it } from "vitest";
import { neighborsOf } from "../../src/core/board.ts";
import { replayCertificate } from "../../src/core/certificate.ts";
import { generateNoGuess, validatePreset } from "../../src/core/generator.ts";

const BEGINNER = { width: 9, height: 9, mines: 10 };

describe("preset validation", () => {
  it("rejects invalid presets", () => {
    expect(validatePreset({ width: 2, height: 9, mines: 10 })).toBe(false);
    expect(validatePreset({ width: 9, height: 2, mines: 10 })).toBe(false);
    expect(validatePreset({ width: 9, height: 9, mines: 0 })).toBe(false);
    expect(validatePreset({ width: 9, height: 9, mines: 9 * 9 - 8 })).toBe(false);
    expect(validatePreset(BEGINNER)).toBe(true);
  });
});

describe("no-guess generation", () => {
  it("never silently downgrades: an exhausted budget fails explicitly", () => {
    const result = generateNoGuess(
      { config: BEGINNER, seed: 1, firstIndex: 40, budget: { maxCandidates: 0 } },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("budget-exhausted");
  });

  it("returns boards whose certificate replays from the empty public state", () => {
    for (let seed = 0; seed < 12; seed++) {
      const result = generateNoGuess({ config: BEGINNER, seed, firstIndex: 40 });
      expect(result.ok, `seed=${seed}`).toBe(true);
      if (!result.ok) continue;
      const replay = replayCertificate(result.board, result.certificate);
      expect(replay.ok, `seed=${seed}`).toBe(true);
      expect(result.certificate.steps.length).toBeGreaterThan(0);
    }
  });

  it("keeps the first click and its neighbourhood mine-free", () => {
    const result = generateNoGuess({ config: BEGINNER, seed: 3, firstIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const index of [0, ...neighborsOf(0, BEGINNER)]) {
      expect(result.board.cells[index].mine).toBe(false);
    }
    expect(result.board.cells[0].adjacent).toBe(0);
  });

  it("is deterministic for a fixed request", () => {
    const a = generateNoGuess({ config: BEGINNER, seed: 5, firstIndex: 40 });
    const b = generateNoGuess({ config: BEGINNER, seed: 5, firstIndex: 40 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.boardKey).toEqual(b.boardKey);
      expect(a.certificate.steps).toEqual(b.certificate.steps);
    }
  });

  it("matches the golden vector", () => {
    const result = generateNoGuess({ config: BEGINNER, seed: 42, firstIndex: 40 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hashBoard(result.board)).toBe("3acd420b");
    expect(hashCertificate(result.certificate)).toBe("70159292");
  });
});

function hashBoard(board: { cells: { mine: boolean }[] }): string {
  const mine = board.cells.map((c) => (c.mine ? "1" : "0")).join("");
  return fnv1a(mine);
}

function hashCertificate(certificate: {
  steps: { action: string; index: number }[];
}): string {
  const text = certificate.steps.map((s) => `${s.action}:${s.index}`).join(",");
  return fnv1a(text);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
