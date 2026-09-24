import { describe, expect, it } from "vitest";
import {
  type GameRecord,
  makeRecord,
  personalBest,
  ranking,
  recentFor,
} from "../../src/core/records.ts";

const PRESET = { width: 9, height: 9, mines: 10 };
const OTHER = { width: 16, height: 16, mines: 40 };
let counter = 0;

function record(overrides: Partial<Parameters<typeof makeRecord>[0]> = {}): GameRecord {
  counter++;
  return makeRecord({
    id: `r${counter}`,
    config: PRESET,
    boardKey: null,
    mode: "challenge",
    outcome: "won",
    durationMs: 1000,
    aids: { hint: 0, smart: 0, leader: 0, revives: 0 },
    timestamp: counter,
    ...overrides,
  });
}

describe("score eligibility", () => {
  it("marks only won challenge games as valid", () => {
    expect(record({ mode: "challenge", outcome: "won" }).valid).toBe(true);
    expect(record({ mode: "challenge", outcome: "lost" }).valid).toBe(false);
    expect(record({ mode: "challenge", outcome: "abandoned" }).valid).toBe(false);
    expect(record({ mode: "training", outcome: "won" }).valid).toBe(false);
  });
});

describe("ranking", () => {
  it("keeps training and abandoned games out of the ranking", () => {
    const records = [
      record({ mode: "training", outcome: "won", durationMs: 10 }),
      record({ mode: "challenge", outcome: "abandoned", durationMs: 20 }),
      record({ mode: "challenge", outcome: "lost", durationMs: 30 }),
      record({ mode: "challenge", outcome: "won", durationMs: 5000 }),
      record({ mode: "challenge", outcome: "won", durationMs: 3000 }),
    ];
    const ranked = ranking(records, PRESET);
    expect(ranked.map((r) => r.durationMs)).toEqual([3000, 5000]);
  });

  it("computes the personal best per preset, ignoring other presets", () => {
    const records = [
      record({ durationMs: 5000 }),
      record({ durationMs: 3000 }),
      record({ config: OTHER, durationMs: 100 }),
      record({ mode: "training", durationMs: 1 }),
    ];
    expect(personalBest(records, PRESET)?.durationMs).toBe(3000);
    expect(personalBest(records, OTHER)?.durationMs).toBe(100);
    expect(personalBest([], PRESET)).toBeNull();
  });

  it("returns the most recent 200 games for a preset", () => {
    const records = Array.from({ length: 250 }, () => record());
    const recent = recentFor(records, PRESET);
    expect(recent).toHaveLength(200);
    expect(recent[0].timestamp).toBeGreaterThan(recent[1].timestamp);
  });
});
