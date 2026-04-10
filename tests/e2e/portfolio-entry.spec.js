import { test, expect } from "@playwright/test";

test.describe("Portfolio Entry Auth Guard", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
  });

  test("shows a Supabase login requirement message when no session is available", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    await expect(page.locator("text=현재 Supabase 로그인 세션이 확인되지 않아 보유 자산을 저장할 수 없습니다.")).toBeVisible();
  });

  test("disables asset mutation controls until Supabase login is restored", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    await expect(page.getByTestId("manual-class-select")).toBeDisabled();
    await expect(page.getByTestId("manual-name-input")).toBeDisabled();
    await expect(page.getByTestId("manual-qty-input")).toBeDisabled();
    await expect(page.getByTestId("manual-price-input")).toBeDisabled();
    await expect(page.getByTestId("manual-cost-input")).toBeDisabled();
    await expect(page.getByTestId("manual-code-input")).toBeDisabled();
    await expect(page.getByTestId("manual-add-button")).toBeDisabled();
    await expect(page.getByTestId("portfolio-principal-input")).toBeDisabled();
  });

  test("starts from an empty holdings state without a Supabase session", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-subtab-assets").click();

    await expect(page.getByTestId("holdings-row")).toHaveCount(0);
    await expect(page.getByTestId("holdings-table")).not.toContainText("TIGER 코리아TOP10");
  });
});

test.describe("Portfolio Entry Save Logic", () => {
  test("existing and new holdings are split into update and insert payloads", async ({ page }) => {
    await page.goto("/");

    const payloads = await page.evaluate(() => {
      const items = [
        { id: 1, code: "EXIST1", etf: "기존 종목", cls: "미국주식", qty: 1, price: 1000, amt: 1000, costAmt: 900 },
        { code: "NEW001", etf: "신규 종목", cls: "국내주식", qty: 2, price: 2000, amt: 4000, costAmt: 3500 },
      ];

      const normalized = items
        .filter((it) => it.code && (Number(it.qty) > 0 || Number(it.amt) > 0))
        .map((it) => {
          const payload = {
            user_id: "user-1",
            ticker: it.code,
            name: it.etf || "",
            asset_class: it.cls || "",
            quantity: Number(it.qty) || 0,
            current_price: Number(it.price) || 0,
            cost_amt: Number(it.costAmt) || 0,
            amount: Number(it.amt) || 0,
            updated_at: "2026-04-11T00:00:00.000Z",
          };
          if (it.id) payload.id = it.id;
          return payload;
        });

      const existingItems = normalized.filter((it) => it.id != null);
      const newItems = normalized
        .map(({ id, ...rest }) => (id != null ? { id, ...rest } : rest))
        .filter((it) => it.id == null)
        .map(({ id, ...rest }) => rest);

      return { existingItems, newItems };
    });

    expect(payloads.existingItems).toHaveLength(1);
    expect(payloads.existingItems[0].id).toBe(1);
    expect(payloads.newItems).toHaveLength(1);
    expect(payloads.newItems[0].ticker).toBe("NEW001");
    expect(payloads.newItems[0].id).toBeUndefined();
  });
});
