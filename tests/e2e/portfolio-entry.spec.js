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

  test("manual add stays persisted after reload and shows holding return", async ({ page }) => {
    await page.route("**/api/kis-price**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ticker: "999998", name: "E2E MOCK", price: 10000 }),
      });
    });

    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    const before = await page.getByTestId("holdings-row").count();

    await page.getByTestId("portfolio-principal-input").fill("50000");
    await page.getByTestId("manual-name-input").click();
    await page.getByTestId("manual-name-input").fill("E2E MOCK");
    await page.getByTestId("manual-code-input").fill("999998");
    await page.getByTestId("manual-qty-input").fill("2");
    await page.getByTestId("manual-price-input").fill("10000");
    await page.getByTestId("manual-cost-input").fill("18000");
    await page.getByTestId("manual-add-button").click();

    await expect(page.getByTestId("holdings-row")).toHaveCount(before + 1);
    await expect(page.getByTestId("holdings-table")).toContainText("E2E MOCK");
    await expect(page.getByTestId("holdings-table")).toContainText("999998");
    await expect(page.getByTestId("holdings-table")).toContainText("마지막 업데이트");
    await expect(page.getByTestId("holding-return").last()).toContainText("11.1%");
    await expect(page.getByTestId("portfolio-principal-summary")).toContainText("5만");
    await expect(page.getByTestId("portfolio-principal-return")).toContainText("+");

    await page.getByTestId("tab-daily").click();
    await expect(page.locator("body")).toContainText("E2E MOCK");

    await page.reload();
    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();
    await expect(page.getByTestId("holdings-table")).toContainText("E2E MOCK");
    await expect(page.getByTestId("holdings-table")).toContainText("999998");
    await expect(page.getByTestId("holding-return").last()).toContainText("11.1%");
  });

  test("manual add resolves ticker from typed name", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    const before = await page.getByTestId("holdings-row").count();

    await page.getByTestId("manual-name-input").fill("코리아top10");
    await page.getByTestId("manual-qty-input").fill("2");
    await page.getByTestId("manual-price-input").fill("10000");
    await page.getByTestId("manual-cost-input").fill("18000");
    await page.getByTestId("manual-add-button").click();

    await expect(page.getByTestId("holdings-row")).toHaveCount(before + 1);
    await expect(page.getByTestId("holdings-table")).toContainText("292150");
  });

  test("manual add merges into an existing holding instead of disappearing", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    const beforeCount = await page.getByTestId("holdings-row").count();
    const totalSummary = page.getByText(/자산 합계/);
    const beforeTotalText = await totalSummary.textContent();

    await page.getByTestId("manual-code-input").fill("360750");
    await page.getByTestId("manual-qty-input").fill("1");
    await page.getByTestId("manual-price-input").fill("10000");
    await page.getByTestId("manual-cost-input").fill("9000");
    await page.getByTestId("manual-add-button").click();

    await expect(page.getByTestId("holdings-row")).toHaveCount(beforeCount);
    await expect(page.getByTestId("holdings-table")).toContainText("360750");
    await expect(totalSummary).not.toHaveText(beforeTotalText || "");
    await expect(page.getByTestId("holdings-table")).toContainText("마지막 업데이트");
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
      '"asset_class","name","ticker","qty","price","amount","cost_amount"',
      '"미국주식","E2E 테스트 ETF","999999","3","20000","60000","58000"',
      '"현금MMF","E2E 테스트 현금","CASH-E2E","0","0","150000","150000"',
    ].join("\n");

    const csvPath = path.join(os.tmpdir(), `holdings-e2e-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csv, "utf8");

    await page.getByTestId("csv-upload-input").setInputFiles(csvPath);
    await page.getByTestId("csv-import-confirm").click();

    await expect(page.getByTestId("holdings-table")).toContainText("E2E 테스트 ETF");
    await expect(page.getByTestId("holdings-table")).toContainText("999999");
  });

  test("restore button recovers the latest locally saved holdings backup", async ({ page }) => {
    await page.addInitScript(() => {
      const backupPayload = [
        {
          savedAt: "2026-04-11T03:15:00.000Z",
          portfolio: {
            strategy: "allseason",
            principalTotal: 120000,
            holdings: [
              {
                etf: "복구 테스트 ETF",
                code: "RESTORE1",
                cls: "미국주식",
                qty: 3,
                price: 40000,
                amt: 120000,
                costAmt: 100000,
                updatedAt: "2026-04-11T03:15:00.000Z",
              },
            ],
          },
        },
      ];

      window.localStorage.setItem("portfolio_state:demo", JSON.stringify({ strategy: "allseason", principalTotal: 0, holdings: [] }));
      window.localStorage.setItem("portfolio_state_backup:demo", JSON.stringify(backupPayload));
    });

    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    await expect(page.getByTestId("restore-portfolio-button")).toBeVisible();
    await page.getByTestId("restore-portfolio-button").click();
    await expect(page.getByTestId("holdings-table")).toContainText("복구 테스트 ETF");
    await expect(page.getByTestId("holdings-table")).toContainText("RESTORE1");
    await expect(page.getByTestId("holding-return")).toContainText("20.0%");
  });
});

