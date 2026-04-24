function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(Math.max(num, min), max);
}

function sumWeights(weights = {}) {
  return Object.values(weights).reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function normalize(weights = {}, cashKey = "현금") {
  const next = {};
  Object.entries(weights).forEach(([key, value]) => {
    const num = Number(value) || 0;
    if (num > 0) next[key] = num;
  });

  const total = sumWeights(next);
  if (total <= 0) return { [cashKey]: 100 };

  Object.keys(next).forEach((key) => {
    next[key] = (next[key] / total) * 100;
  });
  return next;
}

function isRiskAsset(assetClass) {
  return ["미국 주식", "국내 주식", "실물자산"].includes(assetClass);
}

export function buildOverlaySignalSummary(signals = {}) {
  const cape = Number(signals.cape?.value);
  const creditSpread = Number(signals.creditSpread?.spread);
  const vix = Number(signals.vix);
  const yieldSpread = Number(signals.yieldSpread);

  const valuationShift =
    Number.isFinite(cape)
      ? cape >= 30 ? -15 : cape <= 20 ? 10 : 0
      : 0;
  const macroShift =
    (Number.isFinite(vix) ? (vix >= 35 ? -10 : vix >= 25 ? -5 : vix <= 15 ? 5 : 0) : 0) +
    (Number.isFinite(yieldSpread) ? (yieldSpread < 0 ? -10 : yieldSpread < 0.5 ? -5 : 0) : 0) +
    (Number.isFinite(creditSpread) ? (creditSpread >= 6 ? -10 : creditSpread >= 4 ? -5 : creditSpread <= 3 ? 3 : 0) : 0);

  return {
    valuationShift,
    macroShift,
    totalShift: valuationShift + macroShift,
    cape,
    creditSpread,
    vix,
    yieldSpread,
  };
}

export function applyAdaptiveOverlay(baseWeights = {}, strategy = {}, signals = {}, options = {}) {
  const cashKey = options.cashKey || "현금";
  const normalized = normalize(baseWeights, cashKey);
  const overlays = strategy?.overlays || {};
  const equityBand = strategy?.equityBand || { min: 40, max: 80, base: 60 };
  const signalSummary = buildOverlaySignalSummary(signals);

  const riskKeys = Object.keys(normalized).filter(isRiskAsset);
  const safeKeys = Object.keys(normalized).filter((key) => !isRiskAsset(key));
  const currentRisk = riskKeys.reduce((acc, key) => acc + normalized[key], 0);
  const baseRisk = Number(equityBand.base ?? currentRisk);
  const shiftedRisk = clamp(
    baseRisk +
      (overlays.valuation ? signalSummary.valuationShift : 0) +
      (overlays.macro ? signalSummary.macroShift : 0),
    Number(equityBand.min ?? 0),
    Number(equityBand.max ?? 100)
  );

  const next = { ...normalized };
  if (riskKeys.length > 0 && currentRisk > 0) {
    riskKeys.forEach((key) => {
      next[key] = shiftedRisk * (normalized[key] / currentRisk);
    });
  }

  const safeTarget = 100 - shiftedRisk;
  const currentSafe = safeKeys.reduce((acc, key) => acc + normalized[key], 0);
  if (safeKeys.length > 0 && currentSafe > 0) {
    safeKeys.forEach((key) => {
      next[key] = safeTarget * (normalized[key] / currentSafe);
    });
  } else {
    next[cashKey] = safeTarget;
  }

  return {
    targets: normalize(next, cashKey),
    overlaySummary: signalSummary,
    targetEquity: shiftedRisk,
  };
}

export function applyVolTargetOverlay(targets = {}, realizedVol = null, targetVol = 12, cashKey = "현금") {
  const normalized = normalize(targets, cashKey);
  const vol = Number(realizedVol);
  if (!Number.isFinite(vol) || vol <= 0) {
    return {
      targets: normalized,
      volScale: 1,
    };
  }

  const volScale = clamp(targetVol / vol, 0.7, 1.2);
  const riskKeys = Object.keys(normalized).filter(isRiskAsset);
  const safeKeys = Object.keys(normalized).filter((key) => !isRiskAsset(key));
  const riskTotal = riskKeys.reduce((acc, key) => acc + normalized[key], 0);
  const scaledRiskTotal = clamp(riskTotal * volScale, 0, 100);
  const next = { ...normalized };

  if (riskTotal > 0) {
    riskKeys.forEach((key) => {
      next[key] = scaledRiskTotal * (normalized[key] / riskTotal);
    });
  }

  const safeTotal = 100 - scaledRiskTotal;
  const currentSafe = safeKeys.reduce((acc, key) => acc + normalized[key], 0);
  if (safeKeys.length > 0 && currentSafe > 0) {
    safeKeys.forEach((key) => {
      next[key] = safeTotal * (normalized[key] / currentSafe);
    });
  } else {
    next[cashKey] = safeTotal;
  }

  return {
    targets: normalize(next, cashKey),
    volScale: Math.round(volScale * 100) / 100,
  };
}
