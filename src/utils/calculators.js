export function simulate(init, monthly, rate, years) {
  const r = rate / 12;
  let b = init;
  const t = [{ y: 0, b }];
  for (let yr = 1; yr <= years; yr++) {
    for (let m = 0; m < 12; m++) b = b * (1 + r) + monthly;
    t.push({ y: yr, b: Math.round(b) });
  }
  return t;
}

/**
 * 인플레이션을 반영한 실질 가치 시뮬레이션
 * @param {number} init 초기 자산
 * @param {number} monthly 월 납입액
 * @param {number} rate 수익률 (%)
 * @param {number} inflation 물가상승률 (%)
 * @param {number} years 기간
 */
export function simulateReal(init, monthly, rate, inflation, years) {
  const r = (rate - inflation) / 100 / 12; // 실질 수익률 (Fisher Equation 근사식)
  let b = init;
  const t = [{ y: 0, b }];
  for (let yr = 1; yr <= years; yr++) {
    for (let m = 0; m < 12; m++) b = b * (1 + r) + monthly;
    t.push({ y: yr, b: Math.round(b) });
  }
  return t;
}

export function calcNeededContrib(target, rate, years, init) {
  const r = rate / 100 / 12, fv = init * Math.pow(1 + r, years * 12), rem = target - fv;
  if (rem <= 0) return 0;
  return Math.ceil(rem / ((Math.pow(1 + r, years * 12) - 1) / r) / 10000) * 10000;
}

export function checkWithdraw(bal, monthly, rate, years) {
  const r = rate / 100 / 12;
  let b = bal;
  for (let m = 0; m < years * 12; m++) {
    b = b * (1 + r) - monthly;
    if (b <= 0) return { ok: false, yr: Math.floor(m / 12) };
  }
  return { ok: true, rem: Math.round(b) };
}

/**
 * 포트폴리오 변동성 및 샤프지수 추정 (정적 가중치 기반)
 * @param {Array} holdings { cls, target } 
 * @param {Object} riskMap 각 자산군별 변동성 데이터
 */
export function estimateRiskMetrics(holdings, riskMap) {
  // 간단한 선형 결합 추정 (상관관계는 1로 가정하는 보수적 접근 or 평균값 활용)
  let vol = 0;
  holdings.forEach(h => {
    vol += (Number(h.target) / 100) * (riskMap[h.cls] || 0.1);
  });
  
  // 리스크 프리 레이트 (국고채 3년물 등) 대략 3% 가정
  const rf = 0.03;
  // 기대 수익률은 전략별로 다르지만, 여기서는 가중 평균 수익률을 넣을 수도 있음
  return { vol, sharpe: 0 }; // 실제 기대수익률은 외부에서 계산하여 주입 권장
}
