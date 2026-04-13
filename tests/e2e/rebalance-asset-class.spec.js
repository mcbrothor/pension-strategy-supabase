import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const USER_ID = "asset-class-ui-user";
const MOCK_HOLDINGS = [
  {
    id: 1,
    user_id: USER_ID,
    ticker: "379800",
    name: "KODEX 미국S&P500",
    asset_class: "미국주식",
    quantity: 120,
    current_price: 50000,
    amount: 6000000,
    cost_amt: 5200000,
    updated_at: "2026-04-13T00:00:00.000Z",
  },
  {
    id: 2,
    user_id: USER_ID,
    ticker: "465580",
    name: "ACE 미국빅테크TOP7 Plus",
    asset_class: "미국주식",
    quantity: 80,
    current_price: 50000,
    amount: 4000000,
    cost_amt: 3600000,
    updated_at: "2026-04-13T00:00:00.000Z",
  },
  {
    id: 3,
    user_id: USER_ID,
    ticker: "292150",
    name: "TIGER 코리아TOP10",
    asset_class: "국내주식",
    quantity: 100,
    current_price: 30000,
    amount: 3000000,
    cost_amt: 2900000,
    updated_at: "2026-04-13T00:00:00.000Z",
  },
  {
    id: 4,
    user_id: USER_ID,
    ticker: "411060",
    name: "ACE KRX금현물",
    asset_class: "금",
    quantity: 100,
    current_price: 20000,
    amount: 2000000,
    cost_amt: 1800000,
    updated_at: "2026-04-13T00:00:00.000Z",
  },
  {
    id: 5,
    user_id: USER_ID,
    ticker: "CASH",
    name: "예수금(현금)",
    asset_class: "현금MMF",
    quantity: 0,
    current_price: 0,
    amount: 1000000,
    cost_amt: 1000000,
    updated_at: "2026-04-13T00:00:00.000Z",
  },
];

const MOCK_CONFIG = {
  user_id: USER_ID,
  strategy_id: "allweather",
  principal_total: 13500000,
  evaluation_amount: 16000000,
  evaluation_updated_at: "2026-04-13T00:00:00.000Z",
  principal_updated_at: "2026-04-13T00:00:00.000Z",
};

function buildHistory(ticker, count = 253) {
  const baseDate = new Date("2025-04-01T00:00:00Z");
  const offset = String(ticker).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 17;
  const dates = Array.from({ length: count }, (_, index) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + index);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  });
  const prices = dates.map((_, index) => 100 + offset + index * (0.15 + offset / 1000) + (index % 19 === 0 ? offset / 5 : 0));

  return { ticker, dates, prices };
}

function readSupabaseUrl() {
  const raw = fs.readFileSync(path.resolve(".env.local"), "utf8");
  const line = raw.split(/\r?\n/).find((item) => item.startsWith("VITE_SUPABASE_URL="));
  return line?.split("=")[1]?.trim();
}

function authStorageKey() {
  const projectRef = new URL(readSupabaseUrl()).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function encodeBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(userId) {
  return [
    encodeBase64Url({ alg: "HS256", typ: "JWT" }),
    encodeBase64Url({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }),
    "test-signature",
  ].join(".");
}

function fakeSession(userId) {
  return {
    access_token: fakeJwt(userId),
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "asset-class-ui-test@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

async function mockPortfolioApi(page) {
  await page.addInitScript(
    ({ key, session, userId }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
      window.localStorage.setItem("last_auth_user_id", userId);
    },
    {
      key: authStorageKey(),
      session: fakeSession(USER_ID),
      userId: USER_ID,
    }
  );

  await page.route("**/rest/v1/holdings**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_HOLDINGS) });
  });

  await page.route("**/rest/v1/config**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CONFIG) });
  });

  await page.route("**/rest/v1/snapshots**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route("**/rest/v1/stock_master**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route("**/api/vix", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, vix: 18.2, source: "UI test", updatedAt: "2026-04-13T00:00:00.000Z" }),
    });
  });

  await page.route("**/api/market-signals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fearGreed: { score: 52, labelKo: "중립" },
        yieldCurve: { spread: 0.4, statusKo: "완만한 정상" },
        unemployment: { rate: 4.0 },
        compositeScore: 1,
        fetchedAt: "2026-04-13T00:00:00.000Z",
      }),
    });
  });

  await page.route("**/api/momentum", async (route) => {
    const up = Array.from({ length: 13 }, (_, index) => 100 + index);
    const mildUp = Array.from({ length: 13 }, (_, index) => 100 + index * 0.5);
    const down = Array.from({ length: 13 }, (_, index) => 112 - index);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        strategyId: route.request().postDataJSON()?.strategyId || "gtaa5",
        data: {
          priceSeries: {
            미국주식: { monthlyCloses: up },
            선진국주식: { monthlyCloses: mildUp },
            미국중기채권: { monthlyCloses: up },
            미국장기채권: { monthlyCloses: up },
            원자재: { monthlyCloses: down },
            부동산리츠: { monthlyCloses: down },
            금: { monthlyCloses: up },
            신흥국주식: { monthlyCloses: down },
            현금MMF: { monthlyCloses: mildUp },
          },
          dailyCloses: Array.from({ length: 220 }, (_, index) => 100 + index * 0.1),
          unempData: { rate: 4.0, avg12m: 4.2, isBelow: true },
        },
        mode: "role_based_momentum",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    });
  });

  await page.route("**/api/kis-history**", async (route) => {
    const url = new URL(route.request().url());
    const ticker = url.searchParams.get("ticker");
    const count = Number(url.searchParams.get("count"));
    if (count !== 253) throw new Error(`1Y risk history should request 253 daily closes, got ${count}`);
    const history = buildHistory(ticker, count);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...history,
        source: "KIS",
        requestedCount: count,
        dataPoints: history.prices.length,
        pageCount: 4,
      }),
    });
  });
}

test.describe("Rebalance UI asset-class display", () => {
  test.beforeEach(async ({ page }) => {
    await mockPortfolioApi(page);
  });

  test("daily allocation panel shows asset classes, not ETF names", async ({ page }) => {
    await page.goto("/");

    const panel = page.getByTestId("asset-class-allocation-panel");
    await expect(panel).toContainText("자산군별 자산 배분");
    await expect(panel).toContainText("리밸런싱 판단은 자산군 단위로만 표시합니다.");
    await expect(panel).toContainText("미국주식");
    await expect(panel).toContainText("현금MMF");
    await expect(panel).not.toContainText("KODEX 미국S&P500");
    await expect(panel).not.toContainText("ACE 미국빅테크TOP7 Plus");
    await expect(panel).not.toContainText("예수금(현금)");
  });

  test("order plan action list shows asset-class adjustment amounts only", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-orders").click();

    await expect(page.getByText("자산군별 조정안")).toBeVisible();
    await expect(page.getByText("ETF별 매매 종목과 수량은 별도로 결정하세요.")).toBeVisible();

    const list = page.getByTestId("asset-class-action-list");
    await expect(list).toBeVisible();
    await expect(list).toContainText("자산군별 조정 체크리스트");
    await expect(list).toContainText("미국주식");
    await expect(list).not.toContainText("KODEX 미국S&P500");
    await expect(list).not.toContainText("ACE 미국빅테크TOP7 Plus");
    await expect(list).not.toContainText("TIGER 코리아TOP10");
    await expect(list).not.toContainText("예수금(현금)");
  });

  test("benchmark rebalance adjustment card groups amounts by asset class only", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-validation").click();

    const card = page.getByTestId("benchmark-rebalance-adjustments");
    await expect(card).toBeVisible();
    await expect(card).toContainText("리밸런싱 조정 금액");
    await expect(card).toContainText("미국주식");
    await expect(card).toContainText("국내주식");
    await expect(card).toContainText("금");
    await expect(card).not.toContainText("KODEX 미국S&P500");
    await expect(card).not.toContainText("ACE 미국빅테크TOP7 Plus");
    await expect(card).not.toContainText("TIGER 코리아TOP10");
    await expect(card).not.toContainText("예수금(현금)");
  });

  test("dynamic strategy selection shows momentum calculation detail and formula", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-validation").click();
    await page.getByTestId("strategy-card-gtaa5").click();

    const detail = page.getByTestId("momentum-calculation-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("동적 배분 계산 상세");
    await expect(detail).toContainText("원천 신호");
    await expect(detail).toContainText("도출 과정");
    await expect(detail).toContainText("계산 로직");
    await expect(detail).toContainText("SMA10_i");
    await expect(detail).toContainText("정책 반영 후 최종 비중");
    await expect(detail).toContainText("현금MMF");
  });

  test("top KPI risk metrics use one-year realized portfolio history", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("kpi-cvar")).toContainText("실현 252일");
    await expect(page.getByTestId("kpi-mdd")).toContainText("실현 252일");
    await expect(page.getByTestId("kpi-data-grade")).toContainText("A");
  });

  test("monthly report renders LLM-ready asset metadata and pension-account constraint text", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-report").click();

    await expect(page.getByText("개인 연금 운용 보고서")).toBeVisible();
    await expect(page.getByText("자산 상세 분석표 (LLM-Ready)")).toBeVisible();
    await expect(page.getByText("자산명(티커)")).toBeVisible();
    await expect(page.getByText("자산군 태그")).toBeVisible();
    await expect(page.getByRole("cell", { name: "KODEX 미국S&P500 (379800)" })).toBeVisible();
    await expect(page.getByText("[미국 주식]").first()).toBeVisible();
    await expect(page.getByText("은퇴 준비도 진단 메타데이터")).toBeVisible();
    await expect(page.getByText("연금저축 · 위험자산 한도 없음")).toBeVisible();
    await expect(page.getByText("연금저축 · 위험자산 한도 70%")).toHaveCount(0);
  });
});
