import { describe, expect, it } from "vitest";
import {
  boardKey,
  newGame,
  newGameWithBoard,
  reduce,
  remainingMines,
} from "../../src/core/rules.ts";
import { generateBoard } from "../../src/core/generator.ts";
import type { Board, BoardConfig, Cell } from "../../src/core/types.ts";

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

const CONFIG: BoardConfig = { width: 4, height: 4, mines: 2 };
const MINE_BOARD = mkBoard(4, 4, [5, 10]);

function fresh(): ReturnType<typeof newGameWithBoard> {
  return newGameWithBoard(CONFIG, MINE_BOARD, 7, 3);
}

function freshChallenge(): ReturnType<typeof newGameWithBoard> {
  return newGameWithBoard(CONFIG, MINE_BOARD, 7, 3, "challenge");
}

describe("reveal", () => {
  it("becomes playable only after a certified board is started", () => {
    const ready = newGame(CONFIG, 1);
    expect(ready.status).toBe("ready");
    const ignored = reduce(ready, { type: "reveal", index: 12 });
    expect(ignored.status).toBe("ready");
    const board = generateBoard(CONFIG, 1, 12);
    const started = reduce(ready, { type: "start", board, firstIndex: 12 });
    expect(started.status).toBe("playing");
    expect(started.board).not.toBeNull();
    expect(started.firstIndex).toBe(12);
    expect(reduce(started, { type: "reveal", index: 12 }).marks[12]).toBe("revealed");
  });

  it("reveals a numbered cell but does not expand", () => {
    const next = reduce(fresh(), { type: "reveal", index: 6 });
    expect(next.marks[6]).toBe("revealed");
    expect(next.revealedCount).toBe(1);
    expect(next.status).toBe("playing");
  });

  it("expands the connected zero region and its frontier", () => {
    const next = reduce(fresh(), { type: "reveal", index: 3 });
    expect(next.marks[3]).toBe("revealed");
    for (const index of [2, 6, 7]) expect(next.marks[index]).toBe("revealed");
    expect(next.revealedCount).toBe(4);
    for (const index of [0, 1, 4]) expect(next.marks[index]).toBe("hidden");
  });

  it("does nothing when revealing an already revealed cell", () => {
    const first = reduce(fresh(), { type: "reveal", index: 6 });
    const second = reduce(first, { type: "reveal", index: 6 });
    expect(second).toEqual(first);
  });

  it("loses when a mine is revealed", () => {
    const next = reduce(freshChallenge(), { type: "reveal", index: 5 });
    expect(next.status).toBe("lost");
    expect(next.reviewIndex).toBe(5);
  });

  it("wins once every non-mine cell is revealed, without flagging mines", () => {
    const winBoard = mkBoard(3, 3, [8]);
    let state = newGameWithBoard({ width: 3, height: 3, mines: 1 }, winBoard, 2, 0);
    state = reduce(state, { type: "reveal", index: 0 });
    expect(state.status).toBe("won");
    expect(state.revealedCount).toBe(8);
    expect(state.flaggedCount).toBe(0);
  });
});

describe("flagging", () => {
  it("toggles a hidden cell between hidden and flagged", () => {
    const marked = reduce(fresh(), { type: "toggleFlag", index: 0 });
    expect(marked.marks[0]).toBe("flagged");
    const unmarked = reduce(marked, { type: "toggleFlag", index: 0 });
    expect(unmarked.marks[0]).toBe("hidden");
  });

  it("cannot flag a revealed cell", () => {
    const revealed = reduce(fresh(), { type: "reveal", index: 6 });
    const flagged = reduce(revealed, { type: "toggleFlag", index: 6 });
    expect(flagged.marks[6]).toBe("revealed");
  });

  it("reports remaining mines as total minus flags (can be negative)", () => {
    const state = reduce(fresh(), { type: "toggleFlag", index: 0 });
    expect(remainingMines(state)).toBe(1);
    const two = reduce(reduce(fresh(), { type: "toggleFlag", index: 0 }), {
      type: "toggleFlag",
      index: 1,
    });
    expect(remainingMines(two)).toBe(0);
    const three = reduce(two, { type: "toggleFlag", index: 3 });
    expect(remainingMines(three)).toBe(-1);
  });

  it("keeps flagged cells hidden during a chain expansion", () => {
    const flagged = reduce(fresh(), { type: "toggleFlag", index: 6 });
    const expanded = reduce(flagged, { type: "reveal", index: 3 });
    expect(expanded.marks[6]).toBe("flagged");
    expect(expanded.revealedCount).toBe(3);
  });
});

describe("chord", () => {
  it("reveals unflagged neighbours when the flag count matches the number", () => {
    let state = fresh();
    state = reduce(state, { type: "reveal", index: 3 });
    state = reduce(state, { type: "toggleFlag", index: 5 });
    expect(state.marks[5]).toBe("flagged");
    state = reduce(state, { type: "chord", index: 2 });
    expect(state.marks[2]).toBe("revealed");
    expect(state.marks[1]).toBe("revealed");
    expect(state.status).toBe("playing");
    expect(state.revealedCount).toBe(5);
  });

  it("is a no-op on a hidden or zero cell", () => {
    let state = fresh();
    state = reduce(state, { type: "reveal", index: 3 });
    const onHidden = reduce(state, { type: "chord", index: 0 });
    expect(onHidden).toEqual(state);
    const onZero = reduce(state, { type: "chord", index: 3 });
    expect(onZero).toEqual(state);
  });

  it("loses when a wrong flag lets the chord open a mine", () => {
    let state = freshChallenge();
    state = reduce(state, { type: "reveal", index: 3 });
    state = reduce(state, { type: "toggleFlag", index: 1 });
    state = reduce(state, { type: "chord", index: 2 });
    expect(state.status).toBe("lost");
  });
});

describe("restart", () => {
  it("starts a fresh ready game with a new seed and board key", () => {
    const started = reduce(newGame(CONFIG, 1), {
      type: "start",
      board: generateBoard(CONFIG, 1, 3),
      firstIndex: 3,
    });
    const playing = reduce(started, { type: "reveal", index: 3 });
    const keyBefore = boardKey(playing);
    const restarted = reduce(playing, { type: "restart" });
    expect(restarted.status).toBe("ready");
    expect(restarted.seed).not.toBe(playing.seed);
    expect(boardKey(restarted)).toBeNull();
    const replayStarted = reduce(restarted, {
      type: "start",
      board: generateBoard(CONFIG, restarted.seed, 3),
      firstIndex: 3,
    });
    const reRevealed = reduce(replayStarted, { type: "reveal", index: 3 });
    expect(boardKey(reRevealed)).not.toEqual(keyBefore);
  });

  it("accepts an explicit seed for reproducible restarts", () => {
    const restarted = reduce(newGame(CONFIG, 1), { type: "restart", seed: 99 });
    expect(restarted.seed).toBe(99);
  });
});

describe("board key", () => {
  it("is null until the board starts and stable afterwards", () => {
    const ready = newGame(CONFIG, 5);
    expect(boardKey(ready)).toBeNull();
    const started = reduce(ready, {
      type: "start",
      board: generateBoard(CONFIG, 5, 3),
      firstIndex: 3,
    });
    const playing = reduce(started, { type: "reveal", index: 3 });
    const key = boardKey(playing)!;
    expect(key.seed).toBe(5);
    expect(key.firstIndex).toBe(3);
    expect(key.policyVersion).toBeGreaterThan(0);
    expect(key).toEqual(boardKey(reduce(playing, { type: "toggleFlag", index: 0 })));
  });
});
