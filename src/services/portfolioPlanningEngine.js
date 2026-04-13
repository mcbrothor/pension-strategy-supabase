export const CASH_ASSET_CLASS = "현금MMF";

export const DEFAULT_RETIREMENT_PLAN = {
  currentAge: 40,
  retirementAge: 60,
  lifeExpectancy: 90,
  currentBalance: 0,
  monthlyContribution: 500000,
  monthlyNeed: 3000000,
  monthlyPension: 1000000,
  inflationPct: 2,
  withdrawalReturnPct: 3,
  targetCorpus: 0,
  targetCagr: 0,
  targetCagrCapped: false,
  yearsToRetirement: 20,
};

export const DEFAULT_CASH_DEPLOYMENT_STATE = {
  level1Done: false,
  level2Done: false,
  deployedCashPct: 0,
  lastDeployAt: null,
  restoredAt: null,
};

export const DEFAULT_ALLOCATION_POLICY = {
  baseCashPct: 10,
  glidePathStepPct: 2,
  glidePathTriggerYears: 10,
  maxSafePct: 60,
  cashDeploymentState: DEFAULT_CASH_DEPLOYMENT_STATE,
};

const SAFE_CLASS_HINTS = [
  "현금",
  "MMF",
  "채권",
  "단기채",
  "중기채",
  "장기채",
  "물가연동",
  "회사채",
  "국고채",
  "Treasury",
  "Bond",
  "Cash",
  "MMF",
];

const INCOME_CLASS_HINTS = ["채권", "배당", "리츠", "커버드콜", "인컴", "Bond", "Dividend", "REIT"];
const KOREA_EQUITY_HINTS = ["국내주식", "KR Stock", "코스피", "코스닥", "KOSPI", "KOSDAQ"];
const RISK_CLASS_HINTS = ["주식", "원자재", "금", "리츠", "테마", "Stock", "Commodity", "Gold", "REIT"];

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(Math.max(num, min), max);
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasAnyHint(value, hints) {
  const text = String(value || "");
  return hints.some((hint) => text.includes(hint));
}

function forceWeightSum100(weights, preferredKey = CASH_ASSET_CLASS) {
  const rounded = {};
  Object.entries(weights || {}).forEach(([key, value]) => {
    const num = toNumber(value);
    if (num > 0.0001) rounded[key] = Math.round(num * 10) / 10;
  });

  const entries = Object.entries(rounded);
  if (entries.length === 0) return { [preferredKey]: 100 };

  const sum = entries.reduce((acc, [, value]) => acc + value, 0);
  const diff = Math.round((100 - sum) * 10) / 10;
  if (Math.abs(diff) >= 0.1) {
    const targetKey =
      rounded[preferredKey] != null
        ? preferredKey
        : entries.sort((a, b) => b[1] - a[1])[0][0];
    rounded[targetKey] = Math.round((rounded[targetKey] + diff) * 10) / 10;
    if (rounded[targetKey] <= 0) delete rounded[targetKey];
  }

  return rounded;
}

export function normalizeWeights(weights, preferredKey = CASH_ASSET_CLASS) {
  const numeric = {};
  Object.entries(weights || {}).forEach(([key, value]) => {
    const num = toNumber(value);
    if (key && num > 0) numeric[key] = (numeric[key] || 0) + num;
  });

  const sum = Object.values(numeric).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return { [preferredKey]: 100 };

  const normalized = {};
  Object.entries(numeric).forEach(([key, value]) => {
    normalized[key] = (value / sum) * 100;
  });

  return forceWeightSum100(normalized, preferredKey);
}

export function compositionToWeights(composition = []) {
  return composition.reduce((acc, item) => {
    const weight = toNumber(item?.w);
    if (item?.cls && weight > 0) acc[item.cls] = (acc[item.cls] || 0) + weight;
    return acc;
  }, {});
}

export function applyCashScaling(rawWeights, baseCashPct, options = {}) {
  const cashKey = options.cashKey || CASH_ASSET_CLASS;
  const maxCashPct = options.maxCashPct ?? 30;
  const cashPct = clamp(baseCashPct, 0, maxCashPct);
  const normalized = normalizeWeights(rawWeights, cashKey);
  const investablePct = 100 - cashPct;
  const scaled = {};

  Object.entries(normalized).forEach(([key, weight]) => {
    scaled[key] = (scaled[key] || 0) + weight * (investablePct / 100);
  });
  scaled[cashKey] = (scaled[cashKey] || 0) + cashPct;

  return forceWeightSum100(scaled, cashKey);
}

export function calculateGlidePathMinimum({
  currentAge,
  retirementAge,
  baseSafePct = 0,
  annualStepPct = 2,
  triggerYears = 10,
  maxSafePct = 60,
} = {}) {
  const yearsToRetirement = Math.max(0, toNumber(retirementAge) - toNumber(currentAge));
  if (yearsToRetirement >= triggerYears) return clamp(baseSafePct, 0, maxSafePct);

  const rampYears = triggerYears - yearsToRetirement;
  return clamp(baseSafePct + rampYears * annualStepPct, 0, maxSafePct);
}

export function isSafeAssetClass(assetClass) {
  return hasAnyHint(assetClass, SAFE_CLASS_HINTS);
}

export function applySafeAssetFloor(rawWeights, minSafePct, options = {}) {
  const cashKey = options.cashKey || CASH_ASSET_CLASS;
  const floorPct = clamp(minSafePct, 0, 100);
  const weights = normalizeWeights(rawWeights, cashKey);
  const safeTotal = Object.entries(weights).reduce(
    (acc, [key, value]) => acc + (key === cashKey || isSafeAssetClass(key) ? value : 0),
    0
  );

  if (safeTotal >= floorPct) return forceWeightSum100(weights, cashKey);

  const shortage = floorPct - safeTotal;
  const riskTotal = Object.entries(weights).reduce(
    (acc, [key, value]) => acc + (key !== cashKey && !isSafeAssetClass(key) ? value : 0),
    0
  );

  const adjusted = { ...weights };
  if (riskTotal <= 0) {
    adjusted[cashKey] = (adjusted[cashKey] || 0) + shortage;
    return forceWeightSum100(adjusted, cashKey);
  }

  const reduction = Math.min(shortage, riskTotal);
  Object.entries(weights).forEach(([key, value]) => {
    if (key !== cashKey && !isSafeAssetClass(key)) {
      adjusted[key] = value - reduction * (value / riskTotal);
    }
  });
  adjusted[cashKey] = (adjusted[cashKey] || 0) + reduction;

  return forceWeightSum100(adjusted, cashKey);
}

export function applyPolicyToTargetWeights(rawWeights, policy = {}, retirementPlan = {}) {
  const mergedPolicy = {
    ...DEFAULT_ALLOCATION_POLICY,
    ...policy,
  };
  const mergedPlan = {
    ...DEFAULT_RETIREMENT_PLAN,
    ...retirementPlan,
  };

  const cashScaled = applyCashScaling(rawWeights, mergedPolicy.baseCashPct);
  const glideFloor = calculateGlidePathMinimum({
    currentAge: mergedPlan.currentAge,
    retirementAge: mergedPlan.retirementAge,
    annualStepPct: mergedPolicy.glidePathStepPct,
    triggerYears: mergedPolicy.glidePathTriggerYears,
    maxSafePct: mergedPolicy.maxSafePct,
  });

  return applySafeAssetFloor(cashScaled, glideFloor);
}

export function futureValueWithMonthlyContributions(initialBalance, monthlyContribution, annualRate, years) {
  const months = Math.max(0, Math.round(toNumber(years) * 12));
  const annual = toNumber(annualRate);
  const monthlyRate = annual / 12;
  let balance = Math.max(0, toNumber(initialBalance));
  const contribution = Math.max(0, toNumber(monthlyContribution));

  for (let i = 0; i < months; i += 1) {
    balance = balance * (1 + monthlyRate) + contribution;
  }

  return balance;
}

export function solveTargetCagr({ currentBalance, monthlyContribution, targetCorpus, years }) {
  const target = Math.max(0, toNumber(targetCorpus));
  const initial = Math.max(0, toNumber(currentBalance));
  const monthly = Math.max(0, toNumber(monthlyContribution));
  const horizon = Math.max(0.01, toNumber(years));

  if (target <= futureValueWithMonthlyContributions(initial, monthly, -0.95, horizon)) {
    return { targetCagr: -0.95, capped: false };
  }

  let low = -0.95;
  let high = 0.5;
  let capped = false;

  if (futureValueWithMonthlyContributions(initial, monthly, high, horizon) < target) {
    high = 1;
    capped = futureValueWithMonthlyContributions(initial, monthly, high, horizon) < target;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const value = futureValueWithMonthlyContributions(initial, monthly, mid, horizon);
    if (value >= target) high = mid;
    else low = mid;
  }

  return { targetCagr: high, capped };
}

export function calculateRetirementTarget(plan = {}) {
  const merged = {
    ...DEFAULT_RETIREMENT_PLAN,
    ...plan,
  };
  const currentAge = toNumber(merged.currentAge, DEFAULT_RETIREMENT_PLAN.currentAge);
  const retirementAge = Math.max(currentAge + 1, toNumber(merged.retirementAge, DEFAULT_RETIREMENT_PLAN.retirementAge));
  const lifeExpectancy = Math.max(retirementAge + 1, toNumber(merged.lifeExpectancy, DEFAULT_RETIREMENT_PLAN.lifeExpectancy));
  const yearsToRetirement = Math.max(retirementAge - currentAge, 1);
  const retirementYears = Math.max(lifeExpectancy - retirementAge, 1);
  const inflationRate = toNumber(merged.inflationPct, 0) / 100;
  const withdrawalRate = toNumber(merged.withdrawalReturnPct, 0) / 100 / 12;
  const futureMonthlyNeed = Math.max(0, toNumber(merged.monthlyNeed)) * Math.pow(1 + inflationRate, yearsToRetirement);
  const netMonthlyNeed = Math.max(futureMonthlyNeed - Math.max(0, toNumber(merged.monthlyPension)), 0);
  const retirementMonths = retirementYears * 12;
  const targetCorpus =
    netMonthlyNeed <= 0
      ? 0
      : withdrawalRate > 0
        ? netMonthlyNeed * (1 - Math.pow(1 + withdrawalRate, -retirementMonths)) / withdrawalRate
        : netMonthlyNeed * retirementMonths;
  const solved = solveTargetCagr({
    currentBalance: merged.currentBalance,
    monthlyContribution: merged.monthlyContribution,
    targetCorpus,
    years: yearsToRetirement,
  });

  return {
    ...merged,
    currentAge,
    retirementAge,
    lifeExpectancy,
    yearsToRetirement,
    retirementYears,
    futureMonthlyNeed: Math.round(futureMonthlyNeed),
    netMonthlyNeed: Math.round(netMonthlyNeed),
    targetCorpus: Math.round(targetCorpus),
    targetCagr: solved.targetCagr,
    targetCagrCapped: solved.capped,
  };
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Infinity;
  return Math.floor(Math.abs(right - left) / 86400000);
}

function deployCash(weights, deploymentPct, cashKey = CASH_ASSET_CLASS) {
  const normalized = normalizeWeights(weights, cashKey);
  const deployable = Math.min(Math.max(0, deploymentPct), normalized[cashKey] || 0);
  if (deployable <= 0) return normalized;

  const riskEntries = Object.entries(normalized).filter(([key]) => key !== cashKey);
  const riskTotal = riskEntries.reduce((acc, [, value]) => acc + value, 0);
  const adjusted = { ...normalized, [cashKey]: (normalized[cashKey] || 0) - deployable };

  if (riskTotal <= 0) return forceWeightSum100(adjusted, cashKey);

  riskEntries.forEach(([key, value]) => {
    adjusted[key] = value + deployable * (value / riskTotal);
  });

  return forceWeightSum100(adjusted, cashKey);
}

export function evaluateBuyTheFear({
  baseWeights,
  baseCashPct,
  state = {},
  signals = {},
  now = new Date().toISOString(),
  minDaysBetweenDeployments = 10,
  minRecoveryHoldDays = 20,
} = {}) {
  const cashKey = signals.cashKey || CASH_ASSET_CLASS;
  const normalizedState = {
    ...DEFAULT_CASH_DEPLOYMENT_STATE,
    ...state,
  };
  const targetWeights = applyCashScaling(baseWeights, baseCashPct, { cashKey });
  const daysSinceDeploy = daysBetween(normalizedState.lastDeployAt, now);
  const vix = toNumber(signals.vix, null);
  const prevVix = toNumber(signals.prevVix, null);
  const spyClose = toNumber(signals.spyClose, null);
  const spySma200 = toNumber(signals.spySma200, null);
  const remainingCashPct = Math.max(0, (targetWeights[cashKey] || 0) - toNumber(normalizedState.deployedCashPct));
  const canDeploy = daysSinceDeploy >= minDaysBetweenDeployments;
  const hasVix = Number.isFinite(vix);
  const vixFalling = Number.isFinite(vix) && Number.isFinite(prevVix) && vix < prevVix;
  const spyAboveSma200 = Number.isFinite(spyClose) && Number.isFinite(spySma200) && spyClose > spySma200;
  const recoveryAllowed = daysSinceDeploy >= minRecoveryHoldDays;

  if (normalizedState.deployedCashPct > 0 && recoveryAllowed && ((hasVix && vix < 20) || spyAboveSma200)) {
    return {
      action: "restore_base_cash",
      level: 0,
      deploymentPct: 0,
      targetWeights,
      nextState: {
        ...DEFAULT_CASH_DEPLOYMENT_STATE,
        restoredAt: now,
      },
      reasons: ["VIX 안정화 또는 SPY 200일선 회복으로 평시 현금 비중을 복구합니다."],
    };
  }

  if (!normalizedState.level2Done && canDeploy && hasVix && vix > 40 && remainingCashPct > 0) {
    const confirmed = vixFalling || spyAboveSma200;
    if (confirmed) {
      const deploymentPct = remainingCashPct * 0.5;
      return {
        action: "deploy_cash",
        level: 2,
        deploymentPct,
        targetWeights: deployCash(targetWeights, toNumber(normalizedState.deployedCashPct) + deploymentPct, cashKey),
        nextState: {
          ...normalizedState,
          level2Done: true,
          deployedCashPct: toNumber(normalizedState.deployedCashPct) + deploymentPct,
          lastDeployAt: now,
        },
        reasons: ["VIX 40 초과 후 반전/추세 확인이 있어 남은 현금의 50%를 추가 투입합니다."],
      };
    }

    return {
      action: "wait_for_confirmation",
      level: 2,
      deploymentPct: 0,
      targetWeights: deployCash(targetWeights, toNumber(normalizedState.deployedCashPct), cashKey),
      nextState: normalizedState,
      reasons: ["VIX 40 초과지만 VIX 하락 반전 또는 SPY 200일선 확인 전까지 2차 투입을 보류합니다."],
    };
  }

  if (!normalizedState.level1Done && canDeploy && hasVix && vix > 30 && remainingCashPct > 0) {
    const deploymentPct = remainingCashPct * 0.3;
    return {
      action: "deploy_cash",
      level: 1,
      deploymentPct,
      targetWeights: deployCash(targetWeights, deploymentPct, cashKey),
      nextState: {
        ...normalizedState,
        level1Done: true,
        deployedCashPct: toNumber(normalizedState.deployedCashPct) + deploymentPct,
        lastDeployAt: now,
      },
      reasons: ["VIX 30 초과로 평시 현금의 30%를 기존 전략 비율대로 1차 투입합니다."],
    };
  }

  return {
    action: "hold",
    level: 0,
    deploymentPct: 0,
    targetWeights: deployCash(targetWeights, toNumber(normalizedState.deployedCashPct), cashKey),
    nextState: normalizedState,
    reasons: ["신규 현금 투입 또는 복구 조건이 충족되지 않았습니다."],
  };
}

function classifyAssetLocation(item = {}) {
  const text = `${item.cls || ""} ${item.etf || ""} ${item.name || ""}`;
  if (hasAnyHint(text, INCOME_CLASS_HINTS)) return "tax_deferred";
  if (hasAnyHint(text, KOREA_EQUITY_HINTS)) return "tax_free_or_taxable";
  if (hasAnyHint(text, RISK_CLASS_HINTS)) return "risk_asset";
  return "neutral";
}

export function isRiskAssetForIrp(item = {}) {
  const text = `${item.cls || ""} ${item.etf || ""} ${item.name || ""}`;
  if (isSafeAssetClass(text)) return false;
  return hasAnyHint(text, RISK_CLASS_HINTS) || !hasAnyHint(text, SAFE_CLASS_HINTS);
}

export function optimizeAssetLocation(items = [], accountLimits = {}) {
  const limits = {
    irpRiskLimitPct: 70,
    ...accountLimits,
  };

  let irpRiskPct = 0;
  const suggestions = items.map((item) => {
    const weight = toNumber(item.target ?? item.weight ?? item.cur);
    const bucket = classifyAssetLocation(item);
    const riskAsset = isRiskAssetForIrp(item);
    let preferredAccount = "일반계좌";
    let reason = "과세상 특성이 중립적이므로 잔여 계좌에 배치합니다.";

    if (bucket === "tax_deferred") {
      preferredAccount = "연금저축/IRP";
      reason = "분배금·이자 성격이 있어 과세이연 계좌가 유리합니다.";
    } else if (bucket === "tax_free_or_taxable") {
      preferredAccount = "ISA/일반계좌";
      reason = "국내 상장 주식형 ETF는 ISA 또는 일반계좌 우선 배치가 유리합니다.";
    } else if (bucket === "risk_asset") {
      preferredAccount = "연금저축";
      reason = "위험자산은 IRP 70% 한도를 먼저 확인해야 합니다.";
    }

    if (preferredAccount.includes("IRP") && riskAsset) {
      irpRiskPct += weight;
      if (irpRiskPct > limits.irpRiskLimitPct) {
        preferredAccount = "연금저축/ISA";
        reason = `IRP 위험자산 ${limits.irpRiskLimitPct}% 한도 초과 방지를 위해 IRP 밖에 배치합니다.`;
      }
    }

    return {
      ...item,
      preferredAccount,
      reason,
      assetLocationBucket: bucket,
      irpRiskAsset: riskAsset,
    };
  });

  return {
    suggestions,
    irpRiskPct: Math.round(irpRiskPct * 10) / 10,
    warnings:
      irpRiskPct > limits.irpRiskLimitPct
        ? [`IRP 위험자산 예상 비중 ${Math.round(irpRiskPct * 10) / 10}%로 한도 ${limits.irpRiskLimitPct}%를 초과합니다.`]
        : [],
  };
}
