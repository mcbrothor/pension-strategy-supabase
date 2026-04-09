import assert from "node:assert/strict";
import { buildPerformanceSummary, parseHistoryDate } from "../src/utils/performance.js";
import {
  aggregateByAssetClass,
  calculateIRPRiskRatio,
  calculateCompositeSplit,
  generateActionTickets,
} from "../src/services/rebalanceEngine.js";

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
  assert.equal(calculateCompositeSplit(36, 18, -0.2), 7);
  assert.equal(calculateCompositeSplit(16, 80, 1.0), 1);
}

console.log("smoke tests passed");
