import { expect, type Locator, type Page } from "@playwright/test";

export function cell(page: Page, index: number): Locator {
  return page.locator(`.cell[data-index="${index}"]`);
}

export async function snapshot(page: Page) {
  return page.evaluate(() => {
    const api = window.__ms;
    if (!api) throw new Error("debug api missing");
    return api.snapshot();
  });
}

export async function waitForPlaying(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__ms));
  await expect
    .poll(async () => (await snapshot(page)).state.status, { timeout: 20_000 })
    .toBe("playing");
}

export async function center(page: Page, index: number): Promise<{ x: number; y: number }> {
  const box = await cell(page, index).boundingBox();
  if (!box) throw new Error("cell not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function dispatchPointer(
  page: Page,
  index: number,
  type: string,
  pointerId: number,
): Promise<void> {
  const { x, y } = await center(page, index);
  await cell(page, index).dispatchEvent(type, {
    pointerId,
    pointerType: "touch",
    isPrimary: pointerId === 1,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerdown" ? 1 : 0,
    bubbles: true,
    cancelable: true,
  });
}

export function neighbors(index: number, width = 9, height = 9): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      out.push(ny * width + nx);
    }
  }
  return out;
}
