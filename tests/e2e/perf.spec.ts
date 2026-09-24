import { expect, test, type Page } from "@playwright/test";
import { cell, waitForPlaying } from "./support.ts";

function p95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

async function revealLatency(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const api = window.__ms!;
    const snap = api.snapshot();
    const next = snap.state.board!.cells.findIndex(
      (c, index) => !c.mine && snap.state.marks[index] === "hidden",
    );
    if (next < 0) return 0;
    const start = performance.now();
    api.dispatch({ type: "reveal", index: next });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
}

test("input-to-visual latency stays within the 100ms budget", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await cell(page, 40).click();
  await waitForPlaying(page);

  const samples: number[] = [];
  for (let i = 0; i < 12; i++) {
    const ms = await revealLatency(page);
    if (ms > 0) samples.push(ms);
  }
  expect(samples.length).toBeGreaterThan(3);
  expect(p95(samples)).toBeLessThanOrEqual(100);
});

test("pause and resume respond within the 100ms budget", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=challenge");
  await cell(page, 40).click();
  await waitForPlaying(page);

  const measure = (action: "pause" | "resume") =>
    page.evaluate(async (type) => {
      const start = performance.now();
      window.__ms!.dispatch({ type } as never);
      await new Promise(requestAnimationFrame);
      return performance.now() - start;
    }, action);

  expect(await measure("pause")).toBeLessThanOrEqual(100);
  expect(await measure("resume")).toBeLessThanOrEqual(100);
});
