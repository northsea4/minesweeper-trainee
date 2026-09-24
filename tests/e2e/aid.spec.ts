import { expect, test, type Page } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

async function revealAHiddenSafeCell(page: Page): Promise<void> {
  const snap = await snapshot(page);
  const next = snap.state.board!.cells.findIndex(
    (c, index) => !c.mine && snap.state.marks[index] === "hidden",
  );
  await cell(page, next).click();
}

test("help steps through the ladder without acting on its own", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const before = await snapshot(page);

  await page.getByTestId("help").click();
  const hint = await snapshot(page);
  expect(hint.aidKind).toBe("hint");
  expect(hint.aidTarget).not.toBeNull();
  await expect(page.getByTestId("hintbar")).not.toBeEmpty();
  expect(await page.locator(".cell--hl").count()).toBeGreaterThan(0);
  expect(hint.state.revealedCount).toBe(before.state.revealedCount);

  await revealAHiddenSafeCell(page);
  await page.getByTestId("help").click();
  const smart = await snapshot(page);
  expect(smart.aidKind).toBe("smart");
  await expect(page.getByTestId("hintbar")).toContainText("数字");
});

test("the try-once gate blocks consecutive help", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("help").click();
  await expect(page.getByTestId("help")).toBeDisabled();
  await revealAHiddenSafeCell(page);
  await expect(page.getByTestId("help")).toBeEnabled();
});

test("a marker that contradicts the proof raises a conflict notice", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("help").click();
  const target = (await snapshot(page)).aidTarget!;
  await cell(page, target).click({ button: "right" });
  await page.getByTestId("help").click();
  const conflicted = await snapshot(page);
  expect(conflicted.aidConflict).toBe(true);
  await expect(page.getByTestId("hintbar")).toContainText("标记可能有误");
});

test("the ladder can reach the leader, which solves the board", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=2&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("help").click();
  await revealAHiddenSafeCell(page);
  await page.getByTestId("help").click();
  await revealAHiddenSafeCell(page);
  await page.getByTestId("help").click();
  await expect.poll(async () => (await snapshot(page)).state.status, { timeout: 40_000 }).toBe("won");
});

test("the help entry is nudged after an idle stretch in training", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await expect(page.getByTestId("help")).not.toHaveClass(/aids__button--nudge/);
  await expect(page.getByTestId("help")).toHaveClass(/aids__button--nudge/, { timeout: 12_000 });
});

test("challenge mode offers no aid entry points", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await expect(page.getByTestId("aids")).toHaveCount(0);
});
