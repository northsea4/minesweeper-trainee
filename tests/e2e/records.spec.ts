import { expect, test, type Page } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

async function solveViaDebug(page: Page): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    const snap = await snapshot(page);
    if (snap.state.status !== "playing") return;
    const next = snap.state.board!.cells.findIndex(
      (c, index) => !c.mine && snap.state.marks[index] === "hidden",
    );
    if (next < 0) return;
    await page.evaluate((index) => window.__ms!.dispatch({ type: "reveal", index }), next);
  }
}

test("a training win is recorded but never ranked", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await solveViaDebug(page);
  await expect.poll(async () => (await snapshot(page)).state.status).toBe("won");

  await page.getByTestId("history").locator("summary").click();
  await expect(page.getByTestId("history-item").first()).toContainText("训练 · 不计排名");
  await expect(page.getByTestId("pb")).toContainText("—");
});

test("a challenge win is a valid score and sets a personal best", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await solveViaDebug(page);
  await expect.poll(async () => (await snapshot(page)).state.status).toBe("won");

  await page.getByTestId("history").locator("summary").click();
  await expect(page.getByTestId("history-item").first()).toContainText("有效");
  await expect(page.getByTestId("pb")).not.toContainText("—");
});

test("giving up in challenge is recorded as no result", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.getByTestId("giveup").click();
  await expect.poll(async () => (await snapshot(page)).state.status).toBe("abandoned");

  await page.getByTestId("history").locator("summary").click();
  await expect(page.getByTestId("history-item").first()).toContainText("无结果");
});
