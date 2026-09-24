import { describe, expect, it } from "vitest";
import {
  isPlayable,
  isTimerRunning,
  newGame,
  newGameWithBoard,
  reduce,
} from "../../src/core/rules.ts";
import type { Board, Cell } from "../../src/core/types.ts";

function mkBoard(width: number, height: number, mineIndices: number[]): Board {
  const mines = new Set(mineIndices);
  const cells: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mine = mines.has(y * width + x);
      let adjacent = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mines.has(ny * width + nx)) adjacent++;
        }
      }
      cells.push({ mine, adjacent });
    }
  }
  return { width, height, mines: mineIndices.length, cells };
}

const CONFIG = { width: 4, height: 4, mines: 2 };
const BOARD = mkBoard(4, 4, [5, 10]);

function playing(mode: "training" | "challenge") {
  return newGameWithBoard(CONFIG, BOARD, 7, 3, mode);
}

describe("lifecycle transitions", () => {
  it("starts ready and points to a certified board", () => {
    const ready = newGame(CONFIG, 1);
    expect(ready.status).toBe("ready");
    expect(isPlayable(ready)).toBe(true);
    const started = reduce(ready, { type: "start", board: BOARD, firstIndex: 3 });
    expect(started.status).toBe("playing");
  });

  it("pauses and resumes only from playing", () => {
    const ready = newGame(CONFIG, 1);
    expect(reduce(ready, { type: "pause" })).toBe(ready);
    expect(reduce(ready, { type: "resume" })).toBe(ready);

    const live = playing("training");
    const paused = reduce(live, { type: "pause" });
    expect(paused.status).toBe("paused");
    expect(reduce(paused, { type: "pause" })).toBe(paused);
    expect(reduce(paused, { type: "resume" }).status).toBe("playing");
  });

  it("gives up from playing or paused, marking an abandoned game", () => {
    const live = playing("training");
    const abandoned = reduce(live, { type: "giveUp" });
    expect(abandoned.status).toBe("abandoned");
    expect(reduce(abandoned, { type: "giveUp" })).toBe(abandoned);

    const paused = reduce(live, { type: "pause" });
    expect(reduce(paused, { type: "giveUp" }).status).toBe("abandoned");
    expect(reduce(newGame(CONFIG, 1), { type: "giveUp" }).status).toBe("ready");
  });

  it("blocks reveals and flags once paused or abandoned", () => {
    const paused = reduce(playing("training"), { type: "pause" });
    expect(isPlayable(paused)).toBe(false);
    expect(reduce(paused, { type: "reveal", index: 6 })).toBe(paused);
    expect(reduce(paused, { type: "toggleFlag", index: 6 })).toBe(paused);
  });
});

describe("timer running per mode", () => {
  it("stops on pause in training and keeps running in challenge", () => {
    expect(isTimerRunning(playing("training"))).toBe(true);
    expect(isTimerRunning(reduce(playing("training"), { type: "pause" }))).toBe(false);
    expect(isTimerRunning(reduce(playing("challenge"), { type: "pause" }))).toBe(true);
    expect(isTimerRunning(newGame(CONFIG, 1))).toBe(false);
  });
});

describe("mode differences on hitting a mine", () => {
  it("auto-revives in training without a loss", () => {
    const next = reduce(playing("training"), { type: "reveal", index: 5 });
    expect(next.status).toBe("playing");
    expect(next.revives).toBe(1);
    expect(next.reviewIndex).toBe(5);
    expect(next.marks[5]).toBe("hidden");
    const cleared = reduce(next, { type: "clearReview" });
    expect(cleared.reviewIndex).toBeNull();
    expect(cleared.status).toBe("playing");
  });

  it("loses in challenge", () => {
    const next = reduce(playing("challenge"), { type: "reveal", index: 5 });
    expect(next.status).toBe("lost");
    expect(next.revives).toBe(0);
    expect(next.reviewIndex).toBe(5);
  });
});
