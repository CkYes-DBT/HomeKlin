import { expect, test } from "@playwright/test";
import { createMonitorWorld, type MonitorWorld } from "./monitor-test-data";
import { signedInAs } from "./setup/auth-state";

// M1 on a phone: at 360 px the live monitor is one column of cards and nothing scrolls sideways, in
// Indonesian or in English (which runs longer). The spec makes its own streams and a job not checked
// in yet (e2e/monitor-test-data.ts), so both kinds of card are on the page, and removes them after.

test.describe.configure({ mode: "serial", timeout: 120_000 });

let data: MonitorWorld;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  data = await createMonitorWorld("m1m");
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await data?.cleanup();
});

test.describe("the live monitor at 360 px", () => {
  test.use({ ...signedInAs.admin, viewport: { width: 360, height: 780 } });

  for (const { lang, prefix, waiting } of [
    { lang: "id", prefix: "", waiting: "Belum check-in" },
    { lang: "en", prefix: "/en", waiting: "Not checked in" },
  ]) {
    test(`stacks the cards in one column without sideways scroll (${lang})`, async ({ page }) => {
      await page.goto(`${prefix}/admin/monitor`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const live = page.locator(`[data-feed="${data.live.weak.id}"]`);
      const late = page.locator(`[data-waiting="${data.waiting.id}"]`);
      await expect(live).toBeVisible();
      await expect(late).toContainText(waiting);

      // One column: every card starts at the same left edge and spans the content width.
      const boxes = [await live.boundingBox(), await late.boundingBox()];
      expect(boxes[0]?.x).toBe(boxes[1]?.x);
      expect(boxes[0]?.width).toBeGreaterThan(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    });
  }
});
