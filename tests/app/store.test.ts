import { describe, expect, it } from "vitest";
import { Store } from "../../src/app/store.ts";
import { generateBoard } from "../../src/core/generator.ts";
import { newGame, reduce } from "../../src/core/rules.ts";
import { serializeGame } from "../../src/core/save.ts";
import type { GameMode } from "../../src/core/types.ts";

function savedGame(mode: GameMode, elapsedMs: number, timestamp: number) {
  const config = { width: 9, height: 9, mines: 10 };
  const started = reduce(newGame(config, 7, mode), {
    type: "start",
    board: generateBoard(config, 7, 40),
    firstIndex: 40,
  });
  const playing = reduce(started, { type: "reveal", index: 40 });
  return serializeGame(playing, elapsedMs, timestamp);
}

describe("Store.fromSaved", () => {
  it("counts the off-line gap for challenge games", () => {
    const saved = savedGame("challenge", 1000, 1000);
    const store = Store.fromSaved(saved, undefined, () => 6000);
    expect(store.getElapsedMs()).toBe(6000);
  });

  it("does not count the off-line gap for training games", () => {
    const saved = savedGame("training", 1000, 1000);
    const store = Store.fromSaved(saved, undefined, () => 6000);
    expect(store.getElapsedMs()).toBe(1000);
  });
});
