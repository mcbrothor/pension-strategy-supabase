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
