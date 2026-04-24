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

function rounded(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

function fmtPct(value) {
  const num = rounded(value, 1);
  if (num == null) return "N/A";
  return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
}

function fmtPrice(value) {
  const num = rounded(value, 2);
  if (num == null) return "N/A";
  return num.toLocaleString();
}

function cleanTargets(targets) {
  return Object.fromEntries(
    Object.entries(targets || {})
      .filter(([key, value]) => !String(key).startsWith("_") && Number(value) > 0)
      .map(([key, value]) => [key, rounded(value, 1)])
  );
}

function baseDetail(strategyId, title, summary, formula, dataBasis) {
  return {
    strategyId,
    title,
    summary,
    formula,
    dataBasis,
    steps: [],
    rows: [],
    rawTargets: {},
  };
}

export function computeGTAA5Decision(priceSeries, composition) {
  const targets = {};
  const dynamics = composition.filter(c => c.role === "dynamic");
  let allocated = 0;
  const rows = [];

  for (const c of dynamics) {
    const closes = priceSeries[c.cls]?.monthlyCloses || [];
    const last = closes[closes.length - 1];
    const m10 = ma(closes, 10);
    const hasData = closes.length >= 11 && last != null && m10 != null;
    const passed = hasData && last >= m10;
    const weight = passed ? (c.w || 20) : 0;
    targets[c.cls] = weight;
    allocated += weight;
    rows.push({
      assetClass: c.cls,
      role: "상대 자산",
      signal: hasData ? `최근 월말 ${fmtPrice(last)} / 10개월 평균 ${fmtPrice(m10)}` : `월봉 ${closes.length}개로 부족`,
      rule: "최근 월말 종가 >= 10개월 이동평균",
      value: hasData ? `${fmtPrice(last)} ${passed ? ">=" : "<"} ${fmtPrice(m10)}` : "N/A",
      result: passed ? `${weight}% 편입` : "0% 편입",
      passed,
    });
  }

  const cashCls = composition.find(c => c.cls === "현금")?.cls || "현금";
  targets[cashCls] = (targets[cashCls] || 0) + Math.max(0, 100 - allocated);

  const detail = baseDetail(
    "gtaa5",
    "GTAA 5 모멘텀 계산",
    "5개 위험자산의 최근 월말 종가가 각 자산의 10개월 이동평균 위에 있으면 편입하고, 탈락한 비중은 현금으로 대기합니다.",
    [
      "For each asset i:",
      "SMA10_i = average(last 10 monthly closes)",
      "target_i = original_weight_i if close_i >= SMA10_i else 0",
      "cash = 100 - sum(target_i)",
    ].join("\n"),
    "월봉 종가 10개월 이동평균 기준"
  );
  detail.steps = [
    "각 후보 자산의 최근 월말 종가와 10개월 이동평균을 계산합니다.",
    "종가가 10개월 이동평균 이상인 자산만 원래 전략 비중으로 편입합니다.",
    `편입 비중 합계 ${rounded(allocated, 1)}%, 나머지 ${rounded(targets[cashCls], 1)}%는 현금으로 배정합니다.`,
  ];
  detail.rows = rows;
  detail.rawTargets = cleanTargets(targets);
  return { targets, detail };
}

export function computeGTAA5Targets(priceSeries, composition) {
  return computeGTAA5Decision(priceSeries, composition).targets;
}

export function computeDualMomentumDecision(priceSeries, composition) {
  const indicator = composition.find(c => c.role === "indicator");
  const relTargets = composition.filter(c => c.role === "relative_target");
  const defensive = composition.find(c => c.role === "defensive");
  const cashCls = "현금";

  const usRet = retPctFromCloses(priceSeries[indicator?.cls]?.monthlyCloses || [], 12);
  const cashRet = retPctFromCloses(priceSeries[cashCls]?.monthlyCloses || [], 12);
  
  const targets = {};
  composition.forEach(c => targets[c.cls] = 0);
  const rows = [
    {
      assetClass: indicator?.cls || "미국 주식",
      role: "절대/상대 모멘텀 기준",
      signal: "12개월 수익률",
      rule: "미국 주식 12개월 수익률 > 현금 12개월 수익률",
      value: `${fmtPct(usRet)} vs ${fmtPct(cashRet)}`,
      result: usRet != null && cashRet != null && usRet > cashRet ? "Risk-On 통과" : "Risk-Off",
      passed: usRet != null && cashRet != null && usRet > cashRet,
    },
  ];

  // 절대 모멘텀: 현금보다 못하면 방어 자산
  if (usRet == null || cashRet == null || usRet <= cashRet) {
    if (defensive) targets[defensive.cls] = 100;
    else targets[cashCls] = 100;
    const detail = baseDetail(
      "dual_momentum",
      "듀얼 모멘텀 계산",
      "먼저 미국 주식의 12개월 절대 모멘텀이 현금보다 좋은지 확인하고, 통과하지 못하면 방어자산으로 이동합니다.",
      [
        "absolute = return_12m(미국 주식) > return_12m(현금)",
        "if absolute is false: target_defensive = 100%",
        "if absolute is true: choose max(return_12m(미국 주식), return_12m(상대후보))",
      ].join("\n"),
      "월봉 종가 12개월 수익률 기준"
    );
    detail.steps = [
      `미국 주식 12개월 수익률 ${fmtPct(usRet)}와 현금 ${fmtPct(cashRet)}를 비교했습니다.`,
      `절대 모멘텀 미통과로 ${defensive?.cls || cashCls} 100%를 선택했습니다.`,
    ];
    detail.rows = rows;
    detail.rawTargets = cleanTargets(targets);
    return { targets, detail };
  }

  // 상대 모멘텀: 지표 vs 상대 타겟들 중 최고 수익률
  let bestCls = indicator.cls;
  let bestRet = usRet;

  for (const rt of relTargets) {
    const r = retPctFromCloses(priceSeries[rt.cls]?.monthlyCloses || [], 12);
    rows.push({
      assetClass: rt.cls,
      role: "상대 모멘텀 후보",
      signal: "12개월 수익률",
      rule: "후보 중 최고 수익률 선택",
      value: fmtPct(r),
      result: r != null && r > bestRet ? "현재 최고" : "비교",
      passed: r != null && r > bestRet,
    });
    if (r != null && r > bestRet) {
      bestRet = r;
      bestCls = rt.cls;
    }
  }

  targets[bestCls] = 100;
  const detail = baseDetail(
    "dual_momentum",
    "듀얼 모멘텀 계산",
    "절대 모멘텀 통과 후 미국 주식과 상대 후보의 12개월 수익률을 비교해 가장 강한 자산에 100% 배정합니다.",
    [
      "absolute = return_12m(미국 주식) > return_12m(현금)",
      "if absolute is true:",
      "winner = argmax(return_12m(미국주식), return_12m(상대후보들))",
      "target_winner = 100%",
    ].join("\n"),
    "월봉 종가 12개월 수익률 기준"
  );
  detail.steps = [
    `절대 모멘텀 통과: 미국 주식 ${fmtPct(usRet)} > 현금 ${fmtPct(cashRet)}.`,
    `상대 모멘텀 최고 자산은 ${bestCls} (${fmtPct(bestRet)})입니다.`,
    `${bestCls}에 100%를 배정했습니다.`,
  ];
  detail.rows = rows.map(row => row.assetClass === bestCls ? { ...row, result: "최종 선택", passed: true } : row);
  detail.rawTargets = cleanTargets(targets);
  return { targets, detail };
}

export function computeDualMomentumTargets(priceSeries, composition) {
  return computeDualMomentumDecision(priceSeries, composition).targets;
}

export function computeLAADecision(priceSeries, dailyCloses, unempData, composition) {
  const targets = {};
  const fixed = composition.filter(c => c.role === "fixed");
  const attack = composition.find(c => c.role === "attack");
  const defensive = composition.find(c => c.role === "defensive");
  
  // 고정 비중 적용
  fixed.forEach(c => targets[c.cls] = c.w || 0);

  const momentumWeight = 25;
  const indicatorCls = "미국 주식";

  let dualConditionResult = null; 
  let conditionSource = "fallback";
  let conditionText = "";
  let conditionValue = "";

  try {
    if (dailyCloses && dailyCloses.length >= 200 && unempData) {
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      const sma200 = dailyCloses.slice(-200).reduce((s, v) => s + v, 0) / 200;
      const isAbove200DMA = currentPrice > sma200;
      const isUnempBelow = unempData.isBelow;

      dualConditionResult = isAbove200DMA && isUnempBelow;
      conditionSource = "dual";
      conditionText = "SPY 종가 > 200일 이동평균 AND 실업률 < 12개월 평균";
      conditionValue = `${fmtPrice(currentPrice)} ${isAbove200DMA ? ">" : "<="} ${fmtPrice(sma200)} / ${unempData.rate}% ${isUnempBelow ? "<" : ">="} ${rounded(unempData.avg12m, 2)}%`;
    } else if (dailyCloses && dailyCloses.length >= 200) {
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      const sma200 = dailyCloses.slice(-200).reduce((s, v) => s + v, 0) / 200;
      dualConditionResult = currentPrice > sma200;
      conditionSource = "200dma_only";
      conditionText = "SPY 종가 > 200일 이동평균";
      conditionValue = `${fmtPrice(currentPrice)} ${dualConditionResult ? ">" : "<="} ${fmtPrice(sma200)}`;
    }
  } catch (e) {
    console.warn("LAA parsing error:", e.message);
  }

  // Fallback
  if (dualConditionResult === null) {
    const ret = retPctFromCloses(priceSeries[indicatorCls]?.monthlyCloses || [], 12);
    dualConditionResult = ret != null && ret >= 0;
    conditionSource = "12m_momentum";
    conditionText = "미국 주식 12개월 수익률 >= 0";
    conditionValue = fmtPct(ret);
  }

  if (dualConditionResult) {
    if (attack) targets[attack.cls] = (targets[attack.cls] || 0) + momentumWeight;
  } else {
    const safeCls = defensive?.cls || "현금";
    targets[safeCls] = (targets[safeCls] || 0) + momentumWeight;
  }

  targets._conditionSource = conditionSource;
  const rawTargets = cleanTargets(targets);
  const detail = baseDetail(
    "laa",
    "LAA 계산",
    "국내 주식, 실물자산, 장기채는 각 25% 고정하고, 남은 25% 공격 슬리브를 미국 주식 또는 현금에 배정합니다.",
    [
      "fixed = 국내 주식 25% + 실물자산 25% + 장기채 25%",
      "risk_on = SPY close > SMA200 AND unemployment < unemployment_12m_avg",
      "fallback: if macro data missing, use SPY 12m return >= 0",
      "if risk_on: 미국 주식 += 25%",
      "else: 현금 += 25%",
    ].join("\n"),
    conditionSource === "dual" ? "SPY 일봉 200일선 + FRED 실업률" : conditionSource === "200dma_only" ? "SPY 일봉 200일선" : "월봉 12개월 수익률 폴백"
  );
  detail.steps = [
    "고정 슬리브 75%를 먼저 배정했습니다.",
    `${conditionText} 조건을 평가했습니다.`,
    `${dualConditionResult ? "Risk-On" : "Risk-Off"} 판정으로 ${dualConditionResult ? attack?.cls : defensive?.cls || "현금"}에 공격 슬리브 25%를 배정했습니다.`,
  ];
  detail.rows = [
    ...fixed.map(c => ({
      assetClass: c.cls,
      role: "고정 슬리브",
      signal: "상시 편입",
      rule: "전략 고정 비중",
      value: `${c.w || 0}%`,
      result: `${c.w || 0}% 편입`,
      passed: true,
    })),
    {
      assetClass: attack?.cls || "미국 주식",
      role: "공격 슬리브 판정",
      signal: conditionText,
      rule: "Risk-On이면 공격자산, 아니면 방어자산",
      value: conditionValue,
      result: dualConditionResult ? `${attack?.cls || "미국 주식"} 25%` : `${defensive?.cls || "현금"} 25%`,
      passed: dualConditionResult,
    },
  ];
  detail.rawTargets = rawTargets;
  detail.conditionSource = conditionSource;
  return { targets, detail };
}

export function computeLAATargets(priceSeries, dailyCloses, unempData, composition) {
  return computeLAADecision(priceSeries, dailyCloses, unempData, composition).targets;
}

export function computeDAADecision(priceSeries, composition) {
  const score = (closes) => {
    const r1 = retPctFromCloses(closes, 1), r3 = retPctFromCloses(closes, 3), r6 = retPctFromCloses(closes, 6), r12 = retPctFromCloses(closes, 12);
    if ([r1, r3, r6, r12].some(v => v == null)) return null;
    return 12 * r1 + 4 * r3 + 2 * r6 + 1 * r12;
  };

  const canaries = composition.filter(c => c.role === "canary");
  let posCount = 0;
  const rows = [];
  for (const c of canaries) {
    const closes = priceSeries[c.cls]?.monthlyCloses || [];
    const r1 = retPctFromCloses(closes, 1);
    const r3 = retPctFromCloses(closes, 3);
    const r6 = retPctFromCloses(closes, 6);
    const r12 = retPctFromCloses(closes, 12);
    const s = score(closes);
    const passed = s != null && s > 0;
    if (passed) posCount++;
    rows.push({
      assetClass: c.cls,
      role: "카나리아",
      signal: "가중 모멘텀 점수",
      rule: "12×1M + 4×3M + 2×6M + 1×12M > 0",
      value: s == null ? "N/A" : `${rounded(s, 1)} (1M ${fmtPct(r1)}, 3M ${fmtPct(r3)}, 6M ${fmtPct(r6)}, 12M ${fmtPct(r12)})`,
      result: passed ? "양수" : "음수/결측",
      passed,
    });
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

  const detail = baseDetail(
    "daa",
    "DAA 카나리아 계산",
    "카나리아 자산 2개의 가중 모멘텀 점수로 Risk-On/Risk-Off 비율을 정하고, 공격/방어 그룹에 배분합니다.",
    [
      "score_i = 12 * return_1m + 4 * return_3m + 2 * return_6m + return_12m",
      "positive_canaries = count(score_i > 0)",
      "if positive_canaries == 2: attack 100%, defensive 0%",
      "if positive_canaries == 1: attack 50%, defensive 50%",
      "if positive_canaries == 0: attack 0%, defensive 100%",
      "within each group: weight = group_weight * w_ratio / sum(w_ratio)",
    ].join("\n"),
    "월봉 종가 1/3/6/12개월 가중 모멘텀 기준"
  );
  detail.steps = [
    `카나리아 양수 개수는 ${posCount}/${canaries.length}개입니다.`,
    `공격 비중 ${attackW}%, 방어 비중 ${defensiveW}%로 결정했습니다.`,
    "각 그룹 안에서는 w_ratio 비율대로 나누었습니다.",
  ];
  detail.rows = [
    ...rows,
    ...attackGroup.map(c => ({
      assetClass: c.cls,
      role: "공격 그룹",
      signal: `공격 비중 ${attackW}%`,
      rule: "w_ratio 비례 배분",
      value: `w_ratio ${c.w_ratio || 1}`,
      result: `${targets[c.cls] || 0}%`,
      passed: attackW > 0,
    })),
    ...defensiveGroup.map(c => ({
      assetClass: c.cls,
      role: "방어 그룹",
      signal: `방어 비중 ${defensiveW}%`,
      rule: "w_ratio 비례 배분",
      value: `w_ratio ${c.w_ratio || 1}`,
      result: `${targets[c.cls] || 0}%`,
      passed: defensiveW > 0,
    })),
  ];
  detail.rawTargets = cleanTargets(targets);
  return { targets, detail };
}

export function computeDAATargets(priceSeries, composition) {
  return computeDAADecision(priceSeries, composition).targets;
}

export function computeTargetDecision(strategyId, data, composition) {
  if (!data || !data.priceSeries) throw new Error("데이터 부족");
  const { priceSeries, dailyCloses, unempData } = data;

  if (strategyId === "gtaa5") return computeGTAA5Decision(priceSeries, composition);
  if (strategyId === "dual_momentum") return computeDualMomentumDecision(priceSeries, composition);
  if (strategyId === "laa") return computeLAADecision(priceSeries, dailyCloses, unempData, composition);
  if (strategyId === "daa") return computeDAADecision(priceSeries, composition);

  return {
    targets: {},
    detail: baseDetail(strategyId, "알 수 없는 동적 전략", "지원되지 않는 전략입니다.", "N/A", "N/A"),
  };
}

export function computeTargets(strategyId, data, composition) {
  return computeTargetDecision(strategyId, data, composition).targets;
}
