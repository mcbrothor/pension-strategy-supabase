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
 * 포트폴리오 변동성 및 샤프지수 산출 (정적 가중치 기반)
 * @param {Array} holdings { cls, target } 
 * @param {Object} riskData 각 자산군별 표준편차 (sigma)
 * @param {number} expectedReturn 전략별 기대 수익률 (0.085 등)
 */
export function estimateRiskMetrics(holdings, riskData, expectedReturn = 0.08) {
  if (!holdings || holdings.length === 0) return { vol: 0, sharpe: 0 };

  // 1. 포트폴리오 변동성 추정 (단순 가중 평균 sigma)
  // 실제로는 상관계수 행렬(Covariance Matrix)이 필요하지만, 
  // 개인용에서는 자산군별 가중 합산으로 보수적 추정치를 제공합니다.
  let totalVol = 0;
  let totalWeight = 0;

  holdings.forEach(h => {
    const weight = (Number(h.target) || 0) / 100;
    const sigma = riskData[h.cls] || 0.15; // 기본값 15%
    totalVol += weight * sigma;
    totalWeight += weight;
  });

  // 비중이 100%가 아닐 경우 조정 (현금 비중 고려 등)
  const vol = totalWeight > 0 ? totalVol : 0;

  // 2. 샤프지수 계산 (Sharpe = (Rp - Rf) / sigma)
  const rf = 0.03; // 무위험 수익률 3% 가정 (국고채 3년물 수준)
  const excessReturn = expectedReturn - rf;
  const sharpe = vol > 0 ? excessReturn / vol : 0;

  return { 
    vol: Math.round(vol * 1000) / 10, // % 단위 (예: 12.5)
    sharpe: Math.round(sharpe * 100) / 100 // 소수점 2자리 (예: 0.85)
  };
}

/**
 * 피어슨 상관계수 산출
 */
export function calculatePearsonCorr(x, y) {
  if (!x || !y || x.length !== y.length || x.length < 2) return 0;
  const n = x.length;
  const mx = x.reduce((a, b) => a + b) / n;
  const my = y.reduce((a, b) => a + b) / n;
  const num = x.reduce((acc, val, i) => acc + (val - mx) * (y[i] - my), 0);
  const den = Math.sqrt(
    x.reduce((acc, val) => acc + Math.pow(val - mx, 2), 0) *
    y.reduce((acc, val) => acc + Math.pow(val - my, 2), 0)
  );
  return den === 0 ? 0 : num / den;
}

/**
 * VIX 역사적 백분위 산출 (Log-normal 분포 근사 모델)
 * 10년 역사적 랜드마크: 15(50%), 20(75%), 28(90%), 42(97%)
 */
export function calculateVixPercentile(vix) {
  if (!vix || vix <= 0) return 0;
  // Log-normal 누적분포함수(CDF) 근사: (ln(x) - mu) / sigma
  // mu=2.7, sigma=0.4 정도면 VIX의 역사적 분포와 유사함
  const mu = 2.708; // ln(15) 
  const sigma = 0.4;
  const z = (Math.log(vix) - mu) / sigma;
  
  // Z-score를 통한 표준정규분포 CDF 근사 (Abramowitz & Stegun)
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const cdf = z > 0 ? 1 - p : p;
  
  return Math.min(Math.max(Math.round(cdf * 100), 1), 99);
}

/**
 * 포트폴리오 리스크 기여도 (Risk Contribution) 산출
 * 단순화를 위해 비중과 자산별 변동성만을 사용하여 리스크 비중을 도출합니다.
 */
export function calculateRiskContribution(holdings, riskData) {
  if (!holdings || holdings.length === 0) return [];
  const items = holdings.map(h => ({
    cls: h.cls,
    etf: h.etf,
    weight: (Number(h.target) || 0) / 100,
    sigma: riskData[h.cls] || 0.15
  }));
  
  const totalRisk = items.reduce((acc, item) => acc + item.weight * item.sigma, 0);
  if (totalRisk === 0) return [];

  return items.map(item => ({
    ...item,
    contribution: (item.weight * item.sigma) / totalRisk * 100 // % 단위
  }));
}

