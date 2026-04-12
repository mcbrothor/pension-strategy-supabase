export function sumAmounts(rows = []) {
  return rows.reduce((sum, row) => sum + (Number(row?.amt) || 0), 0);
}

export function buildDisplayHoldings(
  holdings = [],
  {
    evaluationAmount = 0,
    evaluationUpdatedAt = null,
    cashAssetClass = "현금MMF",
    cashName = "예수금(현금)",
  } = {}
) {
  const rows = Array.isArray(holdings) ? holdings : [];
  const accountValue = Math.max(0, Number(evaluationAmount) || 0);

  if (accountValue <= 0) {
    return rows.map((row, sourceIndex) => ({ ...row, sourceIndex, isComputedCash: false }));
  }

  const nonCashRows = [];
  const cashRows = [];

  rows.forEach((row, sourceIndex) => {
    const nextRow = { ...row, sourceIndex, isComputedCash: false };
    if (row?.cls === cashAssetClass) cashRows.push(nextRow);
    else nonCashRows.push(nextRow);
  });

  const nonCashTotal = sumAmounts(nonCashRows);
  const cashAmount = Math.max(0, accountValue - nonCashTotal);
  const existingCash = cashRows[0];

  if (!existingCash && cashAmount <= 0) return nonCashRows;

  return [
    ...nonCashRows,
    {
      ...(existingCash || {}),
      sourceIndex: existingCash?.sourceIndex ?? -1,
      isComputedCash: !existingCash,
      etf: existingCash?.etf || cashName,
      code: existingCash?.code || "CASH",
      cls: cashAssetClass,
      qty: 0,
      price: 0,
      amt: cashAmount,
      costAmt: Number(existingCash?.costAmt) || cashAmount,
      updatedAt: existingCash?.updatedAt || evaluationUpdatedAt || null,
    },
  ];
}

export function computePrincipalReturn(principalTotal, evaluationAmount) {
  const principal = Number(principalTotal) || 0;
  const accountValue = Number(evaluationAmount) || 0;

  if (principal <= 0 || accountValue <= 0) return null;

  const amount = accountValue - principal;
  return {
    amount,
    pct: (amount / principal) * 100,
  };
}
