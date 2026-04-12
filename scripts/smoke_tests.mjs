import assert from "node:assert/strict";
import { buildPerformanceSummary, parseHistoryDate } from "../src/utils/performance.js";
import {
  aggregateByAssetClass,
  calculateIRPRiskRatio,
  calculateCompositeSplit,
  generateActionTickets,
} from "../src/services/rebalanceEngine.js";
import { calculateAverageCorrelationFromHistory, generateRiskReport } from "../src/services/riskEngine.js";
import { getHistoryTargetCount, normalizePriceRows } from "../api/kis-history.js";
import { parseHoldingsCsvText, buildHoldingsCsvTemplate } from "../src/utils/holdingsCsv.js";
import { buildDisplayHoldings, computePrincipalReturn, sumAmounts } from "../src/utils/portfolioDisplay.js";

const now = new Date("2026-04-08T00:00:00+09:00");

{
  const parsed = parseHistoryDate("12/18", now);
  assert.equal(parsed.getFullYear(), 2025);
  assert.equal(parsed.getMonth(), 11);
  assert.equal(parsed.getDate(), 18);
}

{
  const todayKo = parseHistoryDate("\uc624\ub298", now);
  const todayEn = parseHistoryDate("today", now);
  assert.equal(todayKo.getTime(), now.getTime());
  assert.equal(todayEn.getTime(), now.getTime());
}

{
  const portfolio = {
    history: [
      { date: "2026-01-08", total: 10000000 },
      { date: "today", total: 11000000 },
    ],
  };
  const holdings = [
    { amt: 7000000, costAmt: 6000000 },
    { amt: 4000000, costAmt: 4000000 },
  ];
  const summary = buildPerformanceSummary(portfolio, holdings, 11000000, 0.08, now);
  assert.equal(summary.costTotal, 10000000);
  assert.equal(summary.unrealizedPnl, 1000000);
  assert.equal(Math.round(summary.unrealizedReturn * 10) / 10, 10);
  assert.equal(Math.round(summary.periodReturn * 10) / 10, 10);
  assert.ok(summary.benchmarkGap > 0);
}

{
  // User-like sample portfolio: IRP account with stock overweight and MMF buffer.
  const holdings = [
    { cls: "US Stock", amt: 12600000, costAmt: 11800000, target: 55 },
    { cls: "Developed Stock", amt: 4200000, costAmt: 4000000, target: 15 },
    { cls: "KR Bond", amt: 3200000, costAmt: 3300000, target: 20 },
    { cls: "MMF", amt: 1000000, costAmt: 1000000, target: 10 },
  ];

  const total = holdings.reduce((sum, item) => sum + item.amt, 0);
  const grouped = aggregateByAssetClass(holdings, total);

  const riskRatio = calculateIRPRiskRatio(grouped);
  assert.equal(riskRatio, 80);

  const stock = grouped.find((item) => item.cls === "US Stock");
  assert.equal(stock.cur, 60);
  assert.equal(stock.diff, 5);
  assert.equal(stock.actionAmt, 1050000);

  const tickets = generateActionTickets(grouped, {
    vix: 31,
    fearGreed: 32,
    yieldSpread: -0.1,
    stopLoss: -10,
    mdd: -7,
    mddLimit: -12,
    accountType: "IRP",
    irpRiskRatio: riskRatio,
  });

  const sellTicket = tickets.find((item) => item.assetClass === "US Stock" && item.actionType === "sell");
  const buyTicket = tickets.find((item) => item.assetClass === "KR Bond" && item.actionType === "buy");

  assert.ok(sellTicket, "US Stock sell ticket should exist");
  assert.ok(buyTicket, "KR Bond buy ticket should exist");
  assert.ok(buyTicket.splitPlan >= 3, "High-stress market should recommend split buying");
}

{
  const holdings = [
    { code: "AAA", etf: "미국주식 ETF 1", cls: "미국주식", amt: 6000000, costAmt: 6000000, target: 30 },
    { code: "BBB", etf: "미국주식 ETF 2", cls: "미국주식", amt: 4000000, costAmt: 4000000, target: 30 },
    { code: "CASH", etf: "예수금(현금)", cls: "현금MMF", amt: 0, costAmt: 0, target: 70 },
  ];

  const total = holdings.reduce((sum, item) => sum + item.amt, 0);
  const grouped = aggregateByAssetClass(holdings, total);

  assert.equal(grouped.filter((item) => item.cls === "미국주식").length, 1);
  assert.equal(grouped.find((item) => item.cls === "미국주식").actionAmt, 7000000);

  const tickets = generateActionTickets(grouped, {
    vix: 18,
    fearGreed: null,
    yieldSpread: null,
    stopLoss: -20,
    mdd: -5,
    mddLimit: -15,
    accountType: "연금저축",
    irpRiskRatio: calculateIRPRiskRatio(grouped),
  });

  assert.equal(tickets.filter((item) => item.assetClass === "미국주식").length, 1);
  assert.equal(tickets.some((item) => String(item.assetClass).includes("ETF")), false);
}

{
  assert.equal(calculateCompositeSplit(36, 18, -0.2), 7);
  assert.equal(calculateCompositeSplit(16, 80, 1.0), 1);
}

{
  const csv = buildHoldingsCsvTemplate();
  const parsed = parseHoldingsCsvText(csv);
  assert.equal(parsed.length >= 2, true);
  assert.equal(parsed[0].code, "360750");
  assert.equal(parsed[0].qty, 15);
  assert.equal(parsed[0].amt, 180000);
}

{
  const holdings = [
    { etf: "A", code: "A", cls: "미국주식", amt: 26500000 },
    { etf: "B", code: "B", cls: "국내주식", amt: 12000000 },
    { etf: "C", code: "C", cls: "금", amt: 10000000 },
  ];
  const displayRows = buildDisplayHoldings(holdings, {
    evaluationAmount: 65000000,
    cashAssetClass: "현금MMF",
  });
  const cash = displayRows.find((row) => row.cls === "현금MMF");
  assert.equal(cash.etf, "예수금(현금)");
  assert.equal(cash.amt, 16500000);
  assert.equal(sumAmounts(displayRows), 65000000);
}

{
  const displayRows = buildDisplayHoldings(
    [
      { etf: "A", code: "A", cls: "미국주식", amt: 50000000 },
      { etf: "CASH", code: "CASH", cls: "현금MMF", amt: 1000000 },
    ],
    {
      evaluationAmount: 65000000,
      cashAssetClass: "현금MMF",
    }
  );
  const cash = displayRows.find((row) => row.cls === "현금MMF");
  assert.equal(cash.amt, 15000000);
  assert.equal(sumAmounts(displayRows), 65000000);
}

{
  const result = computePrincipalReturn(55000000, 65000000);
  assert.equal(result.amount, 10000000);
  assert.equal(Math.round(result.pct * 10) / 10, 18.2);
  assert.equal(computePrincipalReturn(55000000, 0), null);
}

{
  const holdings = [
    { code: "292150", etf: "TIGER 코리아TOP10", cls: "국내주식", amt: 2651575, target: 0 },
    { code: "379800", etf: "KODEX 미국S&P500", cls: "미국주식", amt: 6080425, target: 0 },
    { code: "411060", etf: "ACE KRX금현물", cls: "금", amt: 4470405, target: 0 },
    { code: "469830", etf: "SOL 초단기채권액티브", cls: "국내채권", amt: 10737000, target: 0 },
    { code: "481060", etf: "KODEX 미국30년국채타겟커버드콜", cls: "글로벌채권", amt: 7536100, target: 0 },
    { code: "CASH", etf: "예수금(현금)", cls: "현금MMF", amt: 3966120, target: 0 },
  ];
  const report = generateRiskReport(holdings, 0.085, "1Y", null);
  assert.ok(report.metrics.vol > 0, "current-weight risk volatility should be positive");
  assert.ok(report.metrics.sharpe > 0, "current-weight sharpe should be positive");
  assert.equal(report.riskContribution.some(item => item.cls === "현금MMF"), true);
  assert.equal(report.riskContribution.filter(item => item.cls === "미국주식").length, 1);
}

{
  const holdings = [
    { code: "AAA", etf: "A", cls: "미국주식", amt: 6000000, target: 0 },
    { code: "BBB", etf: "B", cls: "국내채권", amt: 3000000, target: 0 },
    { code: "CASH", etf: "예수금(현금)", cls: "현금MMF", amt: 1000000, target: 0 },
  ];
  const historicalData = [
    { ticker: "AAA", prices: [100, 102, 101, 105, 103, 106] },
    { ticker: "BBB", prices: [100, 100.1, 100.05, 100.2, 100.15, 100.3] },
  ];
  const report = generateRiskReport(holdings, 0.085, "1Y", historicalData);
  assert.equal(report.calcMode, "realized");
  assert.ok(report.metrics.vol > 0, "realized risk should use amount weights when targets are zero");
  assert.ok(report.metrics.mdd > 0, "realized risk should produce drawdown from price history");
}

{
  assert.equal(getHistoryTargetCount("1Y"), 253);
  assert.equal(getHistoryTargetCount("3Y"), 757);
  assert.equal(getHistoryTargetCount("all"), 1261);
  assert.equal(getHistoryTargetCount("1Y", 300), 300);
  assert.equal(getHistoryTargetCount("1Y", 5000), 1261);

  const rows = normalizePriceRows(
    [
      { stck_bsop_date: "20260412", stck_clpr: "101" },
      { stck_bsop_date: "20260410", stck_clpr: "100" },
      { stck_bsop_date: "20260411", stck_clpr: null },
    ],
    false
  );
  assert.deepEqual(rows.map((item) => item.date), ["20260410", "20260412"]);
  assert.deepEqual(rows.map((item) => item.price), [100, 101]);
}

{
  const baseDate = new Date("2025-04-01T00:00:00Z");
  const dates = Array.from({ length: 253 }, (_, index) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + index);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  });
  const holdings = [
    { code: "AAA", etf: "A", cls: "미국주식", amt: 6000000, target: 0 },
    { code: "BBB", etf: "B", cls: "국내채권", amt: 4000000, target: 0 },
  ];
  const historicalData = [
    { ticker: "AAA", dates, prices: dates.map((_, index) => 100 + index + (index % 7 === 0 ? 2 : 0)) },
    { ticker: "BBB", dates, prices: dates.map((_, index) => 100 + index * 0.25 + (index % 11 === 0 ? 1 : 0)) },
  ];
  const report = generateRiskReport(holdings, 0.085, "1Y", historicalData);
  const corr = calculateAverageCorrelationFromHistory(holdings, historicalData);
  assert.equal(report.calcMode, "realized");
  assert.equal(report.dataPoints, 252);
  assert.equal(report.assetCount, 2);
  assert.equal(typeof corr, "number");
}

console.log("smoke tests passed");
