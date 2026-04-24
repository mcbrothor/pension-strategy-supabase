function ymdToDate(value) {
  if (!value) return null;
  const text = String(value).replace(/[^0-9]/g, "");
  if (text.length !== 8) return null;
  return new Date(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)));
}

export function getBenchmarkTicker(strategy = {}) {
  return strategy?.benchmark === "balanced_60_40"
    ? { ticker: "AOR", label: "60/40 혼합 지수", type: "overseas" }
    : { ticker: "SPY", label: "S&P 500 지수", type: "overseas" };
}

export async function fetchBenchmarkHistory(strategy, period = "3Y", count = null) {
  const meta = getBenchmarkTicker(strategy);
  const params = new URLSearchParams({
    ticker: meta.ticker,
    type: meta.type,
    period,
  });
  if (count) params.set("count", String(count));
  const response = await fetch(`/api/kis-history?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Benchmark fetch failed (${response.status})`);
  }
  const data = await response.json();
  return {
    ...meta,
    prices: data.prices || [],
    dates: data.dates || [],
    source: data.source || "KIS",
    updatedAt: data.updatedAt || null,
  };
}

export function calculateBenchmarkReturn(history, targetDays = null) {
  if (!history?.prices?.length) return null;
  const prices = history.prices;
  const dates = history.dates || [];
  const end = Number(prices[prices.length - 1]);
  if (!Number.isFinite(end) || end <= 0) return null;

  let startIndex = 0;
  if (targetDays && dates.length === prices.length) {
    const endDate = ymdToDate(dates[dates.length - 1]);
    startIndex = dates.findIndex((date) => {
      const parsed = ymdToDate(date);
      if (!parsed || !endDate) return false;
      return (endDate - parsed) / 86400000 >= targetDays;
    });
    if (startIndex < 0) startIndex = 0;
  }

  const start = Number(prices[startIndex]);
  if (!Number.isFinite(start) || start <= 0) return null;
  return ((end / start) - 1) * 100;
}

export function buildBenchmarkCurveFromHistory(history = {}, initialCapital = 1000000, targetLength = null) {
  const prices = Array.isArray(history.prices) ? history.prices : [];
  if (prices.length < 2) return [];
  const source = targetLength ? prices.slice(-targetLength) : prices;
  const base = Number(source[0]);
  if (!Number.isFinite(base) || base <= 0) return [];
  return source.map((price, index) => ({
    day: index,
    value: Math.round(initialCapital * (Number(price) / base)),
  }));
}
