import { expect, test } from "@playwright/test";
import { cell, snapshot } from "./support.ts";

test("an unsupported preset fails explicitly and offers a retry", async ({ page }) => {
  await page.goto("/?w=2&h=2&m=1&seed=1");
  await cell(page, 0).click();
  await expect(page.getByTestId("error")).toBeVisible();
  await expect(page.getByTestId("error")).toContainText("不合法");
  const snap = await snapshot(page);
  expect(snap.state.board).toBeNull();
  expect(snap.state.status).toBe("ready");
});
