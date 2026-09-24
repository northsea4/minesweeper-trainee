import { expect, test } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

test("plays offline after the first load", async ({ page, context }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await cell(page, 40).click();
  await waitForPlaying(page);
  expect((await snapshot(page)).state.board).not.toBeNull();
  await context.setOffline(false);
});

test("makes no external network requests", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
  });
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await cell(page, 40).click();
  await waitForPlaying(page);
  const expected = new URL(page.url()).origin;
  expect([...origins]).toEqual([expected]);
});

test("clears all local data and returns to a fresh state", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("settings").locator("summary").click();
  await page.getByTestId("clear-data").click();
  await page.waitForFunction(() => Boolean(window.__ms));
  await expect(page.getByTestId("status")).toContainText("点第一格开始");
  await page.getByTestId("history").locator("summary").click();
  await expect(page.getByTestId("history-item")).toHaveCount(0);
});
