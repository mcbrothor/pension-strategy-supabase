/**
 * 비즈니스 로직(전략 엔진): 프론트엔드에서 모멘텀 타겟 비중을 계산합니다.
 * 백엔드(api/momentum.js)에서 정리해서 전달해 준 순수 데이터를 바탕으로 
 * GTAA5, Dual Momentum, LAA, DAA 산출을 수행합니다.
 */

function retPctFromCloses(closes, monthsBack) {
  const n = closes.length;
  const i0 = n - monthsBack - 1, i1 = n - 1;
  if (i0 < 0 || i1 < 0) return null;
  const c0 = Number(closes[i0]), c1 = Number(closes[i1]);
  if (!c0 || isNaN(c1)) return null;
  return ((c1 / c0) - 1) * 100;
}

function ma(closes, window) {
  const n = closes.length;
  if (n < window) return null;
  let s = 0;
  for (let i = n - window; i < n; i++) s += Number(closes[i]);
  return s / window;
}

export function computeGTAA5Targets(priceSeries, composition) {
  const targets = {};
  const dynamics = composition.filter(c => c.role === "dynamic");
  let allocated = 0;

  for (const c of dynamics) {
    const closes = priceSeries[c.cls]?.monthlyCloses || [];
    if (closes.length < 11) { targets[c.cls] = 0; continue; }
    const last = closes[closes.length - 1];
    const m10 = ma(closes, 10);
    if (last >= m10) {
      targets[c.cls] = c.w || 20;
      allocated += targets[c.cls];
    } else {
      targets[c.cls] = 0;
    }
  }

  const cashCls = composition.find(c => c.cls === "현금MMF")?.cls || "현금MMF";
  targets[cashCls] = (targets[cashCls] || 0) + Math.max(0, 100 - allocated);
  return targets;
}

export function computeDualMomentumTargets(priceSeries, composition) {
  const indicator = composition.find(c => c.role === "indicator");
  const relTargets = composition.filter(c => c.role === "relative_target");
  const defensive = composition.find(c => c.role === "defensive");
  const cashCls = "현금MMF";

  const usRet = retPctFromCloses(priceSeries[indicator?.cls]?.monthlyCloses || [], 12);
  const cashRet = retPctFromCloses(priceSeries[cashCls]?.monthlyCloses || [], 12);
  
  const targets = {};
  composition.forEach(c => targets[c.cls] = 0);

  // 절대 모멘텀: 현금보다 못하면 방어 자산
  if (usRet == null || cashRet == null || usRet <= cashRet) {
    if (defensive) targets[defensive.cls] = 100;
    else targets[cashCls] = 100;
    return targets;
  }

  // 상대 모멘텀: 지표 vs 상대 타겟들 중 최고 수익률
  let bestCls = indicator.cls;
  let bestRet = usRet;

  for (const rt of relTargets) {
    const r = retPctFromCloses(priceSeries[rt.cls]?.monthlyCloses || [], 12);
    if (r != null && r > bestRet) {
      bestRet = r;
      bestCls = rt.cls;
    }
  }

  targets[bestCls] = 100;
  return targets;
}

export function computeLAATargets(priceSeries, dailyCloses, unempData, composition) {
  const targets = {};
  const fixed = composition.filter(c => c.role === "fixed");
  const attack = composition.find(c => c.role === "attack");
  const defensive = composition.find(c => c.role === "defensive");
  
  // 고정 비중 적용
  fixed.forEach(c => targets[c.cls] = c.w || 0);

  const momentumWeight = 25;
  const indicatorCls = "미국주식";

  let dualConditionResult = null; 
  let conditionSource = "fallback";

  try {
    if (dailyCloses && dailyCloses.length >= 200 && unempData) {
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      const sma200 = dailyCloses.slice(-200).reduce((s, v) => s + v, 0) / 200;
      const isAbove200DMA = currentPrice > sma200;
      const isUnempBelow = unempData.isBelow;

      dualConditionResult = isAbove200DMA && isUnempBelow;
      conditionSource = "dual";
    } else if (dailyCloses && dailyCloses.length >= 200) {
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      const sma200 = dailyCloses.slice(-200).reduce((s, v) => s + v, 0) / 200;
      dualConditionResult = currentPrice > sma200;
      conditionSource = "200dma_only";
    }
  } catch (e) {
    console.warn("LAA parsing error:", e.message);
  }

  // Fallback
  if (dualConditionResult === null) {
    const ret = retPctFromCloses(priceSeries[indicatorCls]?.monthlyCloses || [], 12);
    dualConditionResult = ret != null && ret >= 0;
    conditionSource = "12m_momentum";
  }

  if (dualConditionResult) {
    if (attack) targets[attack.cls] = (targets[attack.cls] || 0) + momentumWeight;
  } else {
    const safeCls = defensive?.cls || "현금MMF";
    targets[safeCls] = (targets[safeCls] || 0) + momentumWeight;
  }

  targets._conditionSource = conditionSource;
  return targets;
}

export function computeDAATargets(priceSeries, composition) {
  const score = (closes) => {
    const r1 = retPctFromCloses(closes, 1), r3 = retPctFromCloses(closes, 3), r6 = retPctFromCloses(closes, 6), r12 = retPctFromCloses(closes, 12);
    if ([r1, r3, r6, r12].some(v => v == null)) return null;
    return 12 * r1 + 4 * r3 + 2 * r6 + 1 * r12;
  };

  const canaries = composition.filter(c => c.role === "canary");
  let posCount = 0;
  for (const c of canaries) {
    const s = score(priceSeries[c.cls]?.monthlyCloses || []);
    if (s != null && s > 0) posCount++;
  }

  const targets = {};
  composition.forEach(c => targets[c.cls] = 0);

  const attackGroup = composition.filter(c => c.role === "attack");
  const defensiveGroup = composition.filter(c => c.role === "defensive");

  let attackW = 0, defensiveW = 0;
  if (posCount === 2) attackW = 100;
  else if (posCount === 1) { attackW = 50; defensiveW = 50; }
  else { defensiveW = 100; }

  if (attackW > 0) {
    const totalRatio = attackGroup.reduce((sum, c) => sum + (c.w_ratio || 1), 0);
    attackGroup.forEach(c => {
      targets[c.cls] = Math.round((c.w_ratio || 1) / totalRatio * attackW * 10) / 10;
    });
  }

  if (defensiveW > 0) {
    const totalRatio = defensiveGroup.reduce((sum, c) => sum + (c.w_ratio || 1), 0);
    defensiveGroup.forEach(c => {
      targets[c.cls] = (targets[c.cls] || 0) + Math.round((c.w_ratio || 1) / totalRatio * defensiveW * 10) / 10;
    });
  }

  return targets;
}

export function computeTargets(strategyId, data, composition) {
  if (!data || !data.priceSeries) throw new Error("데이터 부족");
  const { priceSeries, dailyCloses, unempData } = data;

  if (strategyId === "gtaa5") return computeGTAA5Targets(priceSeries, composition);
  if (strategyId === "dual_momentum") return computeDualMomentumTargets(priceSeries, composition);
  if (strategyId === "laa") return computeLAATargets(priceSeries, dailyCloses, unempData, composition);
  if (strategyId === "daa") return computeDAATargets(priceSeries, composition);

  return {}; // 알 수 없는 전략
}
