import { expect, test } from "@playwright/test";
import { cell, neighbors, snapshot, waitForPlaying } from "./support.ts";

test("walking skeleton: start, reveal, flag, chord, win", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=42");

  await expect(page.getByTestId("status")).toContainText("点第一格开始");
  await expect(page.locator(".cell")).toHaveCount(81);

  await cell(page, 40).click();
  await waitForPlaying(page);

  const opened = await snapshot(page);
  expect(opened.state.revealedCount).toBeGreaterThan(0);
  expect(opened.boardKey?.firstIndex).toBe(40);

  const board = opened.state.board!;
  const chordCell = board.cells.findIndex((c, index) => {
    if (c.mine || c.adjacent === 0 || opened.state.marks[index] !== "revealed") return false;
    return neighbors(index).some(
      (n) => !board.cells[n].mine && opened.state.marks[n] === "hidden",
    );
  });
  expect(chordCell, "board should present a chordable numbered cell").toBeGreaterThanOrEqual(0);

  for (const index of neighbors(chordCell)) {
    if (board.cells[index].mine) await cell(page, index).click({ button: "right" });
  }

  const flagged = await snapshot(page);
  expect(flagged.state.flaggedCount).toBeGreaterThan(0);
  await expect(page.getByTestId("remaining")).toContainText(
    String(10 - flagged.state.flaggedCount),
  );

  await cell(page, chordCell).click({ button: "middle" });
  const chorded = await snapshot(page);
  expect(chorded.state.revealedCount).toBeGreaterThan(opened.state.revealedCount);

  for (let guard = 0; guard < 200; guard++) {
    const current = await snapshot(page);
    if (current.state.status === "won") break;
    expect(current.state.status).toBe("playing");
    const next = current.state.board!.cells.findIndex(
      (c, index) => !c.mine && current.state.marks[index] === "hidden",
    );
    expect(next).toBeGreaterThanOrEqual(0);
    await cell(page, next).click();
  }

  const won = await snapshot(page);
  expect(won.state.status).toBe("won");
  expect(won.state.revealedCount).toBe(71);
  expect(won.elapsedMs).toBeGreaterThan(0);
  await expect(page.getByTestId("status")).toContainText("胜利");

  const firstKey = won.boardKey;
  await page.getByRole("button", { name: "新游戏" }).click();
  await expect(page.getByTestId("status")).toContainText("点第一格开始");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const restarted = await snapshot(page);
  expect(restarted.boardKey).not.toEqual(firstKey);
});

test("new game works on the default screen (no seed param)", async ({ page }) => {
  await page.goto("/");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const before = await snapshot(page);

  await page.getByRole("button", { name: "新游戏" }).click();
  await expect(page.getByTestId("status")).toContainText("点第一格开始");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const after = await snapshot(page);
  expect(after.boardKey).not.toEqual(before.boardKey);
});
