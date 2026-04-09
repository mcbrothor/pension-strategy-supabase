import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test.describe("Portfolio Entry Flows", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
  });

  test("manual add updates holdings immediately", async ({ page }) => {
    await page.route("**/api/kis-price**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ticker: "360750", name: "E2E MOCK", price: 10000 }),
      });
    });

    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    const before = await page.getByTestId("holdings-row").count();

    await page.getByTestId("manual-code-input").fill("360750");
    await page.getByTestId("manual-qty-input").fill("2");
    await page.getByTestId("manual-price-input").fill("10000");
    await page.getByTestId("manual-add-button").click();

    await expect(page.getByTestId("holdings-row")).toHaveCount(before + 1);
  });

  test("template download and csv upload are reflected in holdings", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("csv-template-download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("holdings_template.csv");

    const csv = [
      `"asset_class","name","ticker","qty","price","amount","cost_amount"`,
      `"미국주식","E2E 테스트 ETF","999999","3","20000","60000","58000"`,
      `"현금MMF","E2E 테스트 현금","CASH-E2E","0","0","150000","150000"`,
    ].join("\n");

    const csvPath = path.join(os.tmpdir(), `holdings-e2e-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csv, "utf8");

    await page.getByTestId("csv-upload-input").setInputFiles(csvPath);
    await page.getByTestId("csv-import-confirm").click();

    await expect(page.getByTestId("holdings-table")).toContainText("E2E 테스트 ETF");
    await expect(page.getByTestId("holdings-table")).toContainText("999999");
  });
});
