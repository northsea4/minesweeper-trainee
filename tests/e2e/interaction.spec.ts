import { expect, test } from "@playwright/test";
import { cell, center, dispatchPointer, neighbors, snapshot, waitForPlaying } from "./support.ts";

test("release mode cancels a reveal when the pointer leaves the cell", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  const first = await center(page, 40);
  const other = await center(page, 0);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(other.x, other.y, { steps: 5 });
  await page.mouse.up();
  const snap = await snapshot(page);
  expect(snap.state.status).toBe("ready");
  expect(snap.state.board).toBeNull();
});

test("press mode reveals on pointer down", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.getByTestId("reveal-mode").click();
  await expect(page.getByTestId("reveal-mode")).toHaveText("按下即生效");
  const target = await center(page, 40);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.up();
  await waitForPlaying(page);
});

test("touch long press flags instead of revealing", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await dispatchPointer(page, 40, "pointerdown", 1);
  await page.waitForTimeout(600);
  await dispatchPointer(page, 40, "pointerup", 1);
  const snap = await snapshot(page);
  expect(snap.state.marks[40]).toBe("flagged");
  expect(snap.state.status).toBe("ready");
});

test("a second finger cancels the current aim", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await dispatchPointer(page, 40, "pointerdown", 1);
  await dispatchPointer(page, 41, "pointerdown", 2);
  await dispatchPointer(page, 40, "pointerup", 1);
  await dispatchPointer(page, 41, "pointerup", 2);
  const snap = await snapshot(page);
  expect(snap.state.status).toBe("ready");
  expect(snap.state.board).toBeNull();
});

test("desktop right-click flags and middle-click chords", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const before = await snapshot(page);
  const board = before.state.board!;
  const number = board.cells.findIndex((c, i) => {
    if (c.mine || c.adjacent === 0 || before.state.marks[i] !== "revealed") return false;
    return neighbors(i).some((n) => !board.cells[n].mine && before.state.marks[n] === "hidden");
  });
  expect(number).toBeGreaterThanOrEqual(0);
  const mineNeighbors = neighbors(number).filter((n) => board.cells[n].mine);
  expect(mineNeighbors.length).toBeGreaterThan(0);
  for (const mine of mineNeighbors) {
    await cell(page, mine).click({ button: "right" });
    expect((await snapshot(page)).state.marks[mine]).toBe("flagged");
  }
  await cell(page, number).click({ button: "middle" });
  const after = await snapshot(page);
  expect(after.state.revealedCount).toBeGreaterThan(before.state.revealedCount);
});

test("training mode revives after hitting a mine without losing the timer", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const started = await snapshot(page);
  const mines = started.state.board!.cells
    .map((c, index) => (c.mine ? index : -1))
    .filter((index) => index >= 0);
  expect(mines.length).toBeGreaterThan(0);

  await page.waitForTimeout(300);
  await cell(page, mines[0]).click();

  const revived = await snapshot(page);
  expect(revived.reviveCount).toBe(1);
  expect(revived.state.status).toBe("playing");
  expect(revived.state.revealedCount).toBe(started.state.revealedCount);
  expect(revived.state.reviewIndex).toBe(mines[0]);
  expect(revived.frozen).toBe(true);
  expect(revived.elapsedMs).toBeGreaterThan(started.elapsedMs);

  await page.waitForTimeout(800);
  const settled = await snapshot(page);
  expect(settled.frozen).toBe(false);
  expect(settled.state.reviewIndex).toBeNull();
});
