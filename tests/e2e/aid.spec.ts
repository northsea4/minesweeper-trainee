import { expect, test } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

test("hint and smart hint use explainable proofs without acting", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const before = await snapshot(page);

  await page.getByTestId("hint").click();
  const hint = await snapshot(page);
  expect(hint.aidKind).toBe("hint");
  expect(hint.aidTarget).not.toBeNull();
  await expect(page.getByTestId("hintbar")).not.toBeEmpty();
  expect(await page.locator(".cell--hl").count()).toBeGreaterThan(0);
  expect(hint.state.revealedCount).toBe(before.state.revealedCount);

  await page.getByTestId("smart").click();
  const smart = await snapshot(page);
  expect(smart.aidKind).toBe("smart");
  await expect(page.getByTestId("hintbar")).toContainText("数字");
});

test("a marker that contradicts the proof raises a conflict notice", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("hint").click();
  const target = (await snapshot(page)).aidTarget!;
  await cell(page, target).click({ button: "right" });
  await page.getByTestId("hint").click();
  const conflicted = await snapshot(page);
  expect(conflicted.aidConflict).toBe(true);
  await expect(page.getByTestId("hintbar")).toContainText("标记可能有误");
});

test("leader executes certain steps until the board is solved", async ({ page }) => {
  await page.goto("/?w=5&h=5&m=3&seed=2&mode=training");
  await cell(page, 12).click();
  await waitForPlaying(page);
  await page.getByTestId("leader").click();
  await expect.poll(async () => (await snapshot(page)).state.status, { timeout: 25_000 }).toBe("won");
});

test("challenge mode offers no aid entry points", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await expect(page.getByTestId("aids")).toHaveCount(0);
});
