import { describe, expect, it } from "vitest";
import {
  autonomy,
  canRequestHelp,
  independentAction,
  initialTraining,
  ladderCeiling,
  mistake,
  nextAidLevel,
  requestHelp,
  setGamesWon,
  shouldNudge,
  type TrainingState,
} from "../../src/core/training.ts";

function guided(): TrainingState {
  return initialTraining(0);
}

describe("autonomy derivation", () => {
  it("moves from guided to practising to independent by performance", () => {
    expect(autonomy(guided())).toBe("guided");
    expect(autonomy({ ...guided(), unaidedStreak: 3 })).toBe("practising");
    expect(autonomy({ ...guided(), unaidedStreak: 8 })).toBe("independent");
    expect(autonomy(setGamesWon(guided(), 2))).toBe("independent");
  });
});

describe("ladder and autonomy ceiling", () => {
  it("starts at hint and advances one level per help", () => {
    let state = guided();
    expect(nextAidLevel(state)).toBe("hint");
    state = requestHelp(state);
    expect(state.showAid).toBe("hint");
    state = independentAction(state);
    state = requestHelp(state);
    expect(state.showAid).toBe("smart");
    state = independentAction(state);
    state = requestHelp(state);
    expect(state.showAid).toBe("leader");
  });

  it("caps the ladder by autonomy", () => {
    const practising = { ...guided(), unaidedStreak: 3 };
    expect(ladderCeiling(practising)).toBe(1);
    let state: TrainingState = { ...practising, helpStep: 5 };
    state = requestHelp(state);
    expect(state.showAid).toBe("smart");

    const independent = { ...guided(), unaidedStreak: 8 };
    expect(ladderCeiling(independent)).toBe(0);
    const capped: TrainingState = { ...independent, helpStep: 5 };
    expect(requestHelp(capped).showAid).toBe("hint");
  });
});

describe("try-once gate", () => {
  it("blocks consecutive help until an independent action", () => {
    let state = requestHelp(guided());
    expect(canRequestHelp(state)).toBe(false);
    const blocked = requestHelp(state);
    expect(blocked).toBe(state);
    expect(blocked.helpStep).toBe(1);

    state = independentAction(state);
    expect(canRequestHelp(state)).toBe(true);
  });

  it("clears the gate after a mistake but drops the streak", () => {
    let state = { ...guided(), unaidedStreak: 4, blockedAid: true };
    state = mistake(state);
    expect(state.blockedAid).toBe(false);
    expect(state.unaidedStreak).toBe(0);
  });
});

describe("nudge", () => {
  it("fires only in training, when enabled, idle, and not already independent", () => {
    const state = guided();
    expect(shouldNudge(state, { mode: "training", nudgeEnabled: true, idleMs: 8000 })).toBe(true);
    expect(shouldNudge(state, { mode: "training", nudgeEnabled: true, idleMs: 5000 })).toBe(false);
    expect(shouldNudge(state, { mode: "challenge", nudgeEnabled: true, idleMs: 9000 })).toBe(false);
    expect(shouldNudge(state, { mode: "training", nudgeEnabled: false, idleMs: 9000 })).toBe(false);
    const independent = { ...guided(), unaidedStreak: 8 };
    expect(shouldNudge(independent, { mode: "training", nudgeEnabled: true, idleMs: 9000 })).toBe(
      false,
    );
  });

  it("never nudges while an aid is on screen", () => {
    const state = requestHelp(guided());
    expect(shouldNudge(state, { mode: "training", nudgeEnabled: true, idleMs: 9000 })).toBe(false);
  });
});
