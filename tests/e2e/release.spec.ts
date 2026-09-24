import { expect, test, type Page } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

async function solveViaDebug(page: Page): Promise<void> {
  for (let guard = 0; guard < 300; guard++) {
    const snap = await snapshot(page);
    if (snap.state.status !== "playing") return;
    if (!snap.state.board) return;
    const next = snap.state.board.cells.findIndex(
      (c, index) => !c.mine && snap.state.marks[index] === "hidden",
    );
    if (next < 0) return;
    await page.evaluate((index) => window.__ms!.dispatch({ type: "reveal", index }), next);
  }
}

test("a full training game can be won with aids and revives", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/?w=9&h=9&m=10&seed=11&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);

  const snap = await snapshot(page);
  const mine = snap.state.board!.cells.findIndex((c) => c.mine);
  await cell(page, mine).click();
  await expect.poll(async () => (await snapshot(page)).reviveCount).toBe(1);
  await page.waitForTimeout(800);
  // The revive proactively explains itself with a smart hint.
  await expect(page.getByTestId("hintbar")).toContainText("数字");
  expect((await snapshot(page)).aidKind).toBe("smart");

  await solveViaDebug(page);
  await expect.poll(async () => (await snapshot(page)).state.status).toBe("won");
  expect(errors).toEqual([]);
});

test("a full challenge game yields a valid score", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=11&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await solveViaDebug(page);
  await expect.poll(async () => (await snapshot(page)).state.status).toBe("won");
  await page.getByTestId("history").locator("summary").click();
  await expect(page.getByTestId("history-item").first()).toContainText("有效");
});
