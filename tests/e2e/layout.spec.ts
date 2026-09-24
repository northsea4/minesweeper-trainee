import { expect, test, type Page } from "@playwright/test";
import { snapshot, waitForPlaying } from "./support.ts";

function activeIndex(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-index") ?? null);
}

test("keyboard moves focus, reveals, and flags", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.locator('.cell[data-index="40"]').focus();
  await page.keyboard.press("ArrowRight");
  expect(await activeIndex(page)).toBe("41");
  await page.keyboard.press(" ");
  await waitForPlaying(page);
  const snap = await snapshot(page);
  expect(snap.state.marks[41]).toBe("revealed");

  const hidden = snap.state.marks.findIndex((mark) => mark === "hidden");
  await page.locator(`.cell[data-index="${hidden}"]`).focus();
  await page.keyboard.press("f");
  expect((await snapshot(page)).state.marks[hidden]).toBe("flagged");
});

test("revealed numbers carry a non-colour cue", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.locator('.cell[data-index="40"]').click();
  await waitForPlaying(page);
  await expect(page.locator(".cell--dots").first()).toBeVisible();
});

test("theme can be forced to dark and back to system", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.getByTestId("settings").locator("summary").click();
  await page.getByTestId("theme").selectOption("dark");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.getByTestId("theme").selectOption("system");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});

test("layout survives a 360x640 viewport without clipping controls", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await expect(page.getByTestId("status")).toBeVisible();
  await expect(page.getByTestId("pause")).toBeVisible();
  const board = page.getByTestId("board");
  const box = await board.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(360);
});
