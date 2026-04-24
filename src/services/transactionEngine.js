function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value) {
  return UUID_REGEX.test(String(value || "").trim());
}

function createTransactionId(item = {}, index = 0) {
  if (isUuidLike(item.id)) return item.id;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tx-${index}-${item.tradeDate || item.trade_date || "unknown"}`;
}

export function normalizeTransaction(item = {}, index = 0) {
  return {
    id: createTransactionId(item, index),
    tradeDate: item.tradeDate || item.trade_date || new Date().toISOString().slice(0, 10),
    ticker: item.ticker || item.code || "",
    name: item.name || item.etf || "",
    assetClass: item.assetClass || item.asset_class || item.cls || "",
    side: String(item.side || "buy").toLowerCase() === "sell" ? "sell" : "buy",
    quantity: toNumber(item.quantity ?? item.qty),
    price: toNumber(item.price),
    fee: toNumber(item.fee),
    memo: item.memo || "",
    createdAt: item.createdAt || item.created_at || null,
  };
}

export function sortTransactions(transactions = []) {
  return [...transactions]
    .map(normalizeTransaction)
    .sort((a, b) => {
      const dateDiff = new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function buildTransactionLedger(transactions = []) {
  const positions = new Map();
  const realizedByTicker = {};
  let realizedPnl = 0;
  let totalFees = 0;

  for (const tx of sortTransactions(transactions)) {
    const ticker = tx.ticker || tx.name || "UNKNOWN";
    const prev = positions.get(ticker) || {
      ticker,
      assetClass: tx.assetClass || "",
      quantity: 0,
      costBasis: 0,
    };
    totalFees += tx.fee;

    if (tx.side === "buy") {
      prev.quantity += tx.quantity;
      prev.costBasis += tx.quantity * tx.price + tx.fee;
      if (tx.assetClass) prev.assetClass = tx.assetClass;
      positions.set(ticker, prev);
      continue;
    }

    const avgCost = prev.quantity > 0 ? prev.costBasis / prev.quantity : 0;
    const sellQty = Math.min(prev.quantity, tx.quantity);
    const proceeds = sellQty * tx.price - tx.fee;
    const costOut = sellQty * avgCost;
    const pnl = proceeds - costOut;
    realizedPnl += pnl;
    realizedByTicker[ticker] = (realizedByTicker[ticker] || 0) + pnl;

    prev.quantity = Math.max(prev.quantity - sellQty, 0);
    prev.costBasis = Math.max(prev.costBasis - costOut, 0);
    positions.set(ticker, prev);
  }

  return {
    positions,
    realizedPnl,
    totalFees,
    realizedByTicker,
  };
}

export function summarizeTransactionPerformance(transactions = [], holdings = []) {
  const ledger = buildTransactionLedger(transactions);
  let unrealizedPnl = 0;
  const contributionByAssetClass = {};

  for (const holding of holdings || []) {
    const ticker = holding.code || holding.ticker || holding.etf || "UNKNOWN";
    const position = ledger.positions.get(ticker);
    const costBasis = position?.costBasis ?? toNumber(holding.costAmt);
    const amt = toNumber(holding.amt);
    const assetClass = holding.cls || holding.assetClass || position?.assetClass || "기타";
    const pnl = costBasis > 0 ? amt - costBasis : 0;
    unrealizedPnl += pnl;
    contributionByAssetClass[assetClass] = (contributionByAssetClass[assetClass] || 0) + pnl;
  }

  return {
    realizedPnl: Math.round(ledger.realizedPnl),
    unrealizedPnl: Math.round(unrealizedPnl),
    totalFees: Math.round(ledger.totalFees),
    contributionByAssetClass: Object.fromEntries(
      Object.entries(contributionByAssetClass).map(([key, value]) => [key, Math.round(value)])
    ),
  };
}
