import { expect, test } from "@playwright/test";

interface Snapshot {
  state: {
    status: string;
    marks: string[];
    revealedCount: number;
    flaggedCount: number;
    board: { cells: { mine: boolean; adjacent: number }[] } | null;
  };
  boardKey: { seed: number; firstIndex: number } | null;
  elapsedMs: number;
}

async function snapshot(page: import("@playwright/test").Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const api = window.__ms;
    if (!api) throw new Error("debug api missing");
    return api.snapshot() as unknown as Snapshot;
  });
}

test("walking skeleton: start, reveal, flag, chord, win", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=42");

  await expect(page.getByTestId("status")).toContainText("点第一格开始");

  const cells = page.locator(".cell");
  await expect(cells).toHaveCount(81);

  await cells.nth(40).click();
  const opened = await snapshot(page);
  expect(opened.state.status).toBe("playing");
  expect(opened.state.revealedCount).toBeGreaterThan(0);
  expect(opened.boardKey?.firstIndex).toBe(40);
  await expect(page.getByTestId("status")).toContainText("进行中");

  const board = opened.state.board!;
  let revealedCount = opened.state.revealedCount;

  const chordCell = board.cells.findIndex((cell, index) => {
    if (cell.mine || cell.adjacent === 0 || opened.state.marks[index] !== "revealed") return false;
    return neighborsOf(index).some(
      (n) => !board.cells[n].mine && opened.state.marks[n] === "hidden",
    );
  });
  expect(chordCell, "board should present a chordable numbered cell").toBeGreaterThanOrEqual(0);

  for (const index of neighborsOf(chordCell)) {
    if (board.cells[index].mine) {
      await cells.nth(index).click({ button: "right" });
    }
  }

  const flagged = await snapshot(page);
  expect(flagged.state.flaggedCount).toBeGreaterThan(0);
  await expect(page.getByTestId("remaining")).toContainText(
    String(10 - flagged.state.flaggedCount),
  );

  await cells.nth(chordCell).click({ button: "middle" });
  const chorded = await snapshot(page);
  expect(chorded.state.revealedCount).toBeGreaterThan(revealedCount);
  revealedCount = chorded.state.revealedCount;

  for (let guard = 0; guard < 200; guard++) {
    const current = await snapshot(page);
    if (current.state.status === "won") break;
    expect(current.state.status).toBe("playing");
    const next = current.state.board!.cells.findIndex(
      (cell, index) => !cell.mine && current.state.marks[index] === "hidden",
    );
    expect(next).toBeGreaterThanOrEqual(0);
    await cells.nth(next).click();
  }

  const won = await snapshot(page);
  expect(won.state.status).toBe("won");
  expect(won.state.revealedCount).toBe(71);
  expect(won.elapsedMs).toBeGreaterThan(0);
  await expect(page.getByTestId("status")).toContainText("胜利");

  const firstKey = won.boardKey;
  await page.getByRole("button", { name: "新游戏" }).click();
  await expect(page.getByTestId("status")).toContainText("点第一格开始");
  await cells.nth(40).click();
  const restarted = await snapshot(page);
  expect(restarted.state.status).toBe("playing");
  expect(restarted.boardKey).not.toEqual(firstKey);
});

function neighborsOf(index: number, width = 9, height = 9): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      out.push(ny * width + nx);
    }
  }
  return out;
}
