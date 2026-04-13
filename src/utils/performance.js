export function parseHistoryDate(dateValue, now = new Date()) {
  if (!dateValue) return null;

  const normalized = String(dateValue).trim().toLowerCase();
  if (normalized === "today" || normalized === "\uc624\ub298") return now;

  const match = String(dateValue).match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const inferred = new Date(now.getFullYear(), month, day);
    if (inferred > now) inferred.setFullYear(inferred.getFullYear() - 1);
    return inferred;
  }

  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPercentValue(value) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function safePercentFromAmounts(currentValue, baseValue, options = {}) {
  const current = Number(currentValue);
  const base = Number(baseValue);
  const maxAbsPct = Number(options.maxAbsPct) || 500;

  if (!Number.isFinite(current) || !Number.isFinite(base) || current <= 0 || base <= 0) {
    return null;
  }

  const pct = ((current - base) / base) * 100;
  if (!Number.isFinite(pct)) return null;

  // Monthly reports should not show scale-error artifacts such as +3226.7%.
  // Treat extremely large snapshot returns as invalid report bases.
  if (Math.abs(pct) > maxAbsPct) return null;

  return pct;
}

export function normalizePercentInput(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (Math.abs(num) <= 1) return num * 100;
  return num;
}

export function buildPerformanceSummary(portfolio, holdings, total, annualExpRet, now = new Date()) {
  const holdingsCostTotal = holdings.reduce((sum, h) => sum + (Number(h.costAmt) || 0), 0);
  const costTotal = Number(portfolio?.principalTotal) > 0 ? Number(portfolio.principalTotal) : holdingsCostTotal;
  const unrealizedPnl = costTotal > 0 ? total - costTotal : null;
  const unrealizedReturn = safePercentFromAmounts(total, costTotal, { maxAbsPct: 1000 });

  const datedHistory = (portfolio.history || [])
    .map(item => ({
      ...item,
      parsedDate: parseHistoryDate(item.date, now),
      total: Number(item.total) || 0,
    }))
    .filter(item => item.total > 0)
    .sort((a, b) => {
      if (!a.parsedDate || !b.parsedDate) return 0;
      return a.parsedDate - b.parsedDate;
    });

  const validHistory = datedHistory.filter(item => safePercentFromAmounts(total, item.total) != null);
  const first = validHistory[0] || datedHistory[0] || null;
  const firstTotal = first?.total || null;
  const periodReturn = firstTotal ? safePercentFromAmounts(total, firstTotal) : null;
  const periodDays = first?.parsedDate ? Math.max(1, Math.round((now - first.parsedDate) / 86400000)) : null;
  const annualizedReturn = periodReturn != null && periodDays >= 30
    ? (Math.pow(1 + periodReturn / 100, 365 / periodDays) - 1) * 100
    : null;
  const benchmarkPeriodReturn = periodDays
    ? (Math.pow(1 + annualExpRet, periodDays / 365) - 1) * 100
    : null;
  const benchmarkGap = periodReturn != null && benchmarkPeriodReturn != null
    ? periodReturn - benchmarkPeriodReturn
    : null;

  return {
    costTotal,
    unrealizedPnl,
    unrealizedReturn,
    firstDate: first?.date || null,
    firstTotal,
    periodDays,
    periodReturn,
    annualizedReturn,
    benchmarkPeriodReturn,
    benchmarkGap,
    hasHistory: Boolean(firstTotal && periodReturn != null),
    hasReturnAnomaly: datedHistory.length > 0 && validHistory[0] !== datedHistory[0],
    returnAnomalyNote:
      datedHistory.length > 0 && validHistory[0] !== datedHistory[0]
        ? "스냅샷 기준 성과에서 스케일이 맞지 않는 과거 스냅샷을 제외했습니다."
        : null,
  };
}
