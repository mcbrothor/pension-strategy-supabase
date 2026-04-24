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
    cashCode = "CASH",
  } = {}
) {
  const rows = Array.isArray(holdings) ? holdings : [];
  const accountValue = Math.max(0, Number(evaluationAmount) || 0);

  const nonCashRows = [];
  const cashRows = [];

  rows.forEach((row, sourceIndex) => {
    const nextRow = { ...row, sourceIndex, isComputedCash: false };
    if (row?.code === cashCode) cashRows.push(nextRow);
    else nonCashRows.push(nextRow);
  });

  const nonCashTotal = sumAmounts(nonCashRows);
  const cashAmount =
    accountValue > 0
      ? Math.max(0, accountValue - nonCashTotal)
      : Math.max(0, Number(cashRows[0]?.amt) || 0);
  const existingCash = cashRows[0];

  return [
    ...nonCashRows,
    {
      ...(existingCash || {}),
      sourceIndex: existingCash?.sourceIndex ?? -1,
      isComputedCash: true,
      etf: existingCash?.etf || cashName,
      code: existingCash?.code || cashCode,
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
