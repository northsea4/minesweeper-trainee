import { expect, test } from "@playwright/test";
import { cell, snapshot, waitForPlaying } from "./support.ts";

test("resumes an in-progress game after a reload", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7&mode=training");
  await cell(page, 40).click();
  await waitForPlaying(page);
  await page.waitForTimeout(500);
  const before = await snapshot(page);

  await page.reload();
  await waitForPlaying(page);
  const after = await snapshot(page);
  expect(after.boardKey).toEqual(before.boardKey);
  expect(after.state.marks).toEqual(before.state.marks);
});

test("saving a custom preset validates and de-duplicates names", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.getByTestId("presets").locator("summary").click();
  await page.getByLabel("预设名称").fill("测试预设");
  await page.getByLabel("宽度").fill("5");
  await page.getByLabel("高度").fill("5");
  await page.getByLabel("雷数").fill("3");
  await page.getByTestId("save-preset").click();
  await expect(page.getByTestId("preset-item")).toHaveCount(1);
  await expect(page.getByTestId("preset-item").first()).toContainText("测试预设");

  await page.getByLabel("预设名称").fill("测试预设");
  await page.getByTestId("save-preset").click();
  await expect(page.getByTestId("preset-item")).toHaveCount(2);
  await expect(page.getByTestId("preset-item").nth(1)).toContainText("测试预设 (2)");
});

test("rejects an invalid import with a readable reason", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.getByTestId("presets").locator("summary").click();
  const invalid = JSON.stringify({
    schemaVersion: 1,
    presets: [{ name: "坏", width: 2, height: 2, mines: 1 }],
  });
  await page.getByTestId("import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(invalid),
  });
  await expect(page.getByTestId("data-message")).toContainText("导入失败");
  await expect(page.getByTestId("preset-item")).toHaveCount(0);
});

test("merges a valid import", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=7");
  await page.getByTestId("presets").locator("summary").click();
  const valid = JSON.stringify({
    schemaVersion: 1,
    exportedAt: 1,
    presets: [{ id: "p1", name: "导入预设", width: 6, height: 6, mines: 5, createdAt: 1 }],
    records: [],
    save: null,
  });
  await page.getByTestId("import-file").setInputFiles({
    name: "ok.json",
    mimeType: "application/json",
    buffer: Buffer.from(valid),
  });
  await expect(page.getByTestId("data-message")).toContainText("已合并导入");
  await expect(page.getByTestId("preset-item")).toContainText("导入预设");
});
