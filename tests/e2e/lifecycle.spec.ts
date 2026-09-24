import { expect, test } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

test("training pause stops the timer", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.waitForTimeout(300);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause-mask")).toBeVisible();
  const paused = await snapshot(page);
  expect(paused.state.status).toBe("paused");
  await page.waitForTimeout(600);
  const stillPaused = await snapshot(page);
  expect(stillPaused.elapsedMs).toBe(paused.elapsedMs);

  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause-mask")).toBeHidden();
  await page.waitForTimeout(300);
  const resumed = await snapshot(page);
  expect(resumed.elapsedMs).toBeGreaterThan(stillPaused.elapsedMs);
});

test("challenge pause keeps the timer running", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.waitForTimeout(300);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause-mask")).toBeVisible();
  const paused = await snapshot(page);
  await page.waitForTimeout(600);
  const later = await snapshot(page);
  expect(later.elapsedMs).toBeGreaterThan(paused.elapsedMs);
});

test("giving up ends the game with no result", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("giveup").click();
  const snap = await snapshot(page);
  expect(snap.state.status).toBe("abandoned");
  await expect(page.getByTestId("status")).toContainText("已放弃");
});

test("challenge mode loses on a mine without a revive", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const started = await snapshot(page);
  const mine = started.state.board!.cells.findIndex((c) => c.mine);
  await cell(page, mine).click();
  const snap = await snapshot(page);
  expect(snap.state.status).toBe("lost");
  expect(snap.reviveCount).toBe(0);
});
