import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("start screen has no serious accessibility violations", async ({ page }) => {
  await page.goto("/?w=9&h=9&m=10&seed=42");
  await page.locator(".cell").first().click();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  for (const violation of serious) {
    console.error(violation.id, violation.help, JSON.stringify(violation.nodes, null, 2));
  }
  expect(serious).toEqual([]);
});
