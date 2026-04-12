import React from "react";
import { calculateAverageCorrelationFromHistory, generateRiskReport } from "../services/riskEngine.js";
import { getStrat } from "../utils/helpers.js";

const HISTORY_TARGET_COUNTS = {
  "1Y": 253,
  "3Y": 757,
  all: 1261,
};
const MIN_HISTORY_COUNTS = {
  "1Y": 180,
  "3Y": 500,
  all: 180,
};
const historyCache = new Map();

function getHistoryTargetCount(period) {
  return HISTORY_TARGET_COUNTS[period] || HISTORY_TARGET_COUNTS["1Y"];
}

function getMinimumHistoryCount(period) {
  return MIN_HISTORY_COUNTS[period] || MIN_HISTORY_COUNTS["1Y"];
}

function isOverseasTicker(ticker) {
  const code = String(ticker || "").trim().toUpperCase();
  return !/^[0-9A-Z]{6}$/.test(code);
}

function buildRiskHoldings(portfolio) {
  const total = portfolio.holdings.reduce((sum, h) => sum + (Number(h.amt) || 0), 0) || portfolio.total || 0;
  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round((Number(h.amt) || 0) / total * 1000) / 10 : 0;
    return { ...h, cur };
  });
  const historyEligibleHoldings = holdings.filter(h => h.code && h.code !== "CASH" && h.cls !== "현금MMF");

  return { total, holdings, historyEligibleHoldings };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchHoldingHistory(holding, period, targetCount) {
  const type = isOverseasTicker(holding.code) ? "overseas" : "domestic";
  const key = `${holding.code}|${type}|${period}|${targetCount}`;

  if (!historyCache.has(key)) {
    const url = `/api/kis-history?ticker=${encodeURIComponent(holding.code)}&type=${type}&period=${encodeURIComponent(period)}&count=${targetCount}`;
    const promise = fetch(url)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data.prices) || data.prices.length < 2) return null;
        return {
          ...data,
          ticker: data.ticker || holding.code,
          etf: holding.etf,
          cls: holding.cls,
        };
      })
      .catch((error) => {
        console.warn(`History fetch failed for ${holding.code}:`, error.message);
        return null;
      });

    historyCache.set(key, promise);
  }

  return historyCache.get(key);
}

export function usePortfolioRiskReport(portfolio, period = "1Y") {
  const [historicalData, setHistoricalData] = React.useState(null);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  const strategy = React.useMemo(() => getStrat(portfolio.strategy), [portfolio.strategy]);
  const annualExpRet = strategy?.annualRet?.base || 0.08;
  const targetCount = getHistoryTargetCount(period);
  const minimumHistoryCount = getMinimumHistoryCount(period);

  const { total, holdings, historyEligibleHoldings } = React.useMemo(
    () => buildRiskHoldings(portfolio),
    [portfolio.holdings, portfolio.total]
  );
  const holdingsKey = React.useMemo(
    () => historyEligibleHoldings.map(h => `${h.code}:${h.amt}`).join("|"),
    [historyEligibleHoldings]
  );

  React.useEffect(() => {
    if (!historyEligibleHoldings || historyEligibleHoldings.length === 0) {
      setHistoricalData([]);
      setLoadingHistory(false);
      return;
    }

    let isMounted = true;

    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const results = await mapWithConcurrency(
          historyEligibleHoldings,
          3,
          (holding) => fetchHoldingHistory(holding, period, targetCount)
        );
        const validData = results.filter(item => item && Array.isArray(item.prices) && item.prices.length >= minimumHistoryCount);
        if (isMounted) setHistoricalData(validData);
      } catch (error) {
        console.error("리스크 이력 로드 실패:", error.message);
        if (isMounted) setHistoricalData([]);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }

    fetchHistory();
    return () => { isMounted = false; };
  }, [holdingsKey, period, targetCount, minimumHistoryCount]);

  const report = React.useMemo(
    () => generateRiskReport(holdings, annualExpRet, period, historicalData),
    [holdings, annualExpRet, period, historicalData]
  );
  const avgCorrelation = React.useMemo(
    () => calculateAverageCorrelationFromHistory(holdings, historicalData),
    [holdings, historicalData]
  );
  const validHistoryCount = historicalData?.length || 0;
  const excludedHoldings = React.useMemo(
    () => historyEligibleHoldings.filter(h => !historicalData?.find(d => d.ticker === h.code)),
    [historyEligibleHoldings, historicalData]
  );

  return {
    annualExpRet,
    avgCorrelation,
    excludedHoldings,
    historicalData,
    historyEligibleHoldings,
    loadingHistory,
    minimumHistoryCount,
    report,
    targetCount,
    total,
    validHistoryCount,
    holdings,
  };
}
