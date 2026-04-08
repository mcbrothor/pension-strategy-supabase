import assert from "node:assert/strict";
import { buildPerformanceSummary, parseHistoryDate } from "../src/utils/performance.js";
import { aggregateByAssetClass, calculateIRPRiskRatio, calculateCompositeSplit } from "../src/services/rebalanceEngine.js";

const now = new Date("2026-04-08T00:00:00+09:00");

{
  const parsed = parseHistoryDate("12/18", now);
  assert.equal(parsed.getFullYear(), 2025);
  assert.equal(parsed.getMonth(), 11);
  assert.equal(parsed.getDate(), 18);
}

{
  const portfolio = {
    history: [
      { date: "2026-01-08", total: 10000000 },
      { date: "오늘", total: 11000000 },
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
  const results = aggregateByAssetClass([
    { cls: "미국주식", amt: 8000000, costAmt: 7000000, target: 60 },
    { cls: "현금MMF", amt: 2000000, costAmt: 2000000, target: 40 },
  ], 10000000);
  const stock = results.find(item => item.cls === "미국주식");
  assert.equal(stock.cur, 80);
  assert.equal(stock.diff, 20);
  assert.equal(stock.actionAmt, 2000000);
  assert.equal(calculateIRPRiskRatio(results), 80);
}

{
  assert.equal(calculateCompositeSplit(36, 18, -0.2), 7);
  assert.equal(calculateCompositeSplit(16, 80, 1.0), 1);
}

console.log("smoke tests passed");
