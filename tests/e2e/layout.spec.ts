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

test("a wide board fits its container without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/?w=30&h=16&m=30&seed=1");
  const board = page.getByTestId("board");
  const overflow = await board.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("numbers stay vertically centred when the dot cue is off", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.locator('.cell[data-index="40"]').click();
  await waitForPlaying(page);
  await page.getByTestId("settings").locator("summary").click();
  await page.getByTestId("dots").uncheck();
  await expect(page.locator(".cell--dots")).toHaveCount(0);
  const offset = await page
    .locator(".cell--n1")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return Math.abs(text.top + text.height / 2 - (box.top + box.height / 2));
    });
  expect(offset).toBeLessThan(4);
});

