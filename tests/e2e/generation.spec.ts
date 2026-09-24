import { expect, test } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

test("an unsupported preset fails explicitly and offers a retry", async ({ page }) => {
  await page.goto("/?w=2&h=2&m=1&seed=1");
  await cell(page, 0).click();
  await expect(page.getByTestId("error")).toBeVisible();
  await expect(page.getByTestId("error")).toContainText("不合法");
  const snap = await snapshot(page);
  expect(snap.state.board).toBeNull();
  expect(snap.state.status).toBe("ready");
});

test("the built-in expert preset generates a playable no-guess board", async ({ page }) => {
  await page.goto("/?seed=2");
  await page.getByLabel("难度").selectOption("expert");
  await expect(cell(page, 200)).toHaveCount(1);
  await cell(page, 200).click();
  await waitForPlaying(page);
  const snap = await snapshot(page);
  expect(snap.state.board!.cells.filter((c) => c.mine)).toHaveLength(99);
});
