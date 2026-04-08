/**
 * 리스크 엔진 서비스
 * 
 * calculators.js의 리스크 관련 함수를 이관하고,
 * Sortino, CVaR 등 추가 지표를 확장합니다.
 * 
 * 현재는 "추정(estimated)" 기반이며, 2단계에서 실현(realized) 데이터로 교체 예정.
 * calcMode 플래그로 UI에서 추정/실현 여부를 명시합니다.
 */

import { RISK_DATA } from '../constants/index.js';

// 공통 수학 유틸 (내부 전용)
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const mean = (arr) => arr.length === 0 ? 0 : sum(arr) / arr.length;
const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1));
};

// =============================================================================
// 기본 리스크 지표 (기존 calculators.js에서 이관)
// =============================================================================

/**
 * 포트폴리오 변동성 및 샤프지수 산출 (정적 가중치 기반)
 * 왜 단순 가중합을 쓰나: 개인 투자자용이라 상관계수 행렬(Cov Matrix)을 매번 계산하기엔
 * 데이터 비용이 과도하므로, 보수적 상한치를 제공합니다.
 * 
 * @param {Array} holdings - { cls, target } 배열
 * @param {Object} riskData - 자산군별 표준편차 (sigma)
 * @param {number} expectedReturn - 전략별 기대 수익률
 * @param {number} rfRate - 무위험 수익률 (기본 3%)
 * @returns {{ vol: number, sharpe: number, calcMode: string }}
 */
export function estimateRiskMetrics(holdings, riskData = RISK_DATA, expectedReturn = 0.08, rfRate = 0.03) {
  if (!holdings || holdings.length === 0) return { vol: 0, sharpe: 0, calcMode: 'estimated' };

  let totalVol = 0;
  let totalWeight = 0;

  holdings.forEach(h => {
    const weight = (Number(h.target) || 0) / 100;
    const sigma = riskData[h.cls] || 0.15;
    totalVol += weight * sigma;
    totalWeight += weight;
  });

  const vol = totalWeight > 0 ? totalVol : 0;
  const excessReturn = expectedReturn - rfRate;
  const sharpe = vol > 0 ? excessReturn / vol : 0;

  return { 
    vol: Math.round(vol * 1000) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    calcMode: 'estimated'
  };
}

/**
 * 포트폴리오 리스크 기여도 (Risk Contribution) 산출
 * @param {Array} holdings - { cls, etf, target } 배열
 * @param {Object} riskData - 자산군별 표준편차
 * @returns {Array<{ cls, etf, weight, sigma, contribution }>}
 */
export function calculateRiskContribution(holdings, riskData = RISK_DATA) {
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
    contribution: (item.weight * item.sigma) / totalRisk * 100
  }));
}

// =============================================================================
// 확장 리스크 지표 (1단계: 추정 기반)
// =============================================================================

/**
 * Sortino Ratio 추정
 * 왜 추정인가: 실제 일별 수익률 데이터 없이 자산군별 하방편차를 고정값으로 근사합니다.
 * 
 * Sortino = (Rp - Rf) / 하방편차
 * 하방편차 ≈ 변동성 × 0.7 (경험적 근사치, 정규분포 가정)
 * 
 * @param {number} expectedReturn - 기대 수익률
 * @param {number} vol - 변동성 (% 단위, e.g. 12.5)
 * @param {number} rfRate - 무위험 수익률
 * @returns {{ sortino: number, calcMode: string }}
 */
export function estimateSortino(expectedReturn = 0.08, vol = 12.5, rfRate = 0.03) {
  const downside = (vol / 100) * 0.7; // 하방편차 근사
  if (downside <= 0) return { sortino: 0, calcMode: 'estimated' };
  const sortino = (expectedReturn - rfRate) / downside;
  return { 
    sortino: Math.round(sortino * 100) / 100,
    calcMode: 'estimated'
  };
}

/**
 * CVaR (Conditional Value at Risk) 추정
 * 정규분포 가정 하에 ES(Expected Shortfall) 근사
 * 
 * CVaR(95%) ≈ σ × 2.063 (정규분포 기준)
 * 
 * @param {number} vol - 변동성 (% 단위)
 * @param {number} confidenceLevel - 신뢰수준 (기본 0.95)
 * @returns {{ cvar: number, calcMode: string }}
 */
export function estimateCVaR(vol = 12.5, confidenceLevel = 0.95) {
  // 정규분포 기준 CVaR 승수: 95% → 2.063, 99% → 2.665
  const multiplier = confidenceLevel >= 0.99 ? 2.665 : 2.063;
  const cvar = (vol / 100) * multiplier * 100; // % 단위로 변환
  return { 
    cvar: Math.round(cvar * 10) / 10,
    calcMode: 'estimated'
  };
}

// =============================================================================
// 확장 리스크 지표 (2단계: 실현 데이터 기반)
// =============================================================================

/**
 * 포트폴리오 실현 리스크 지표 산출
 * 왜 실현 데이터인가: 고정된 상수가 아닌 실제 과거 변동성에 기반하여 더 정확한 리스크 파악
 * 
 * @param {Array} holdings - { code, target } 배열
 * @param {Array<{ticker: string, prices: number[]}>} historicalData - 각 자산별 과거 일봉 종가 배열 (최근->과거 순이거나 과거->최근 순, 통일 필요. 여기선 과거->최근(오름차순)으로 가정)
 * @param {number} expectedReturn - 연간 기대 수익률
 * @param {number} rfRate - 연간 무위험 수익률
 * @returns {{ vol: number, sharpe: number, sortino: number, cvar: number, mdd: number, calcMode: string, dailyReturns: number[] }}
 */
export function calculateRealizedRisk(holdings, historicalData, expectedReturn = 0.08, rfRate = 0.03) {
  if (!holdings || holdings.length === 0 || !historicalData || historicalData.length === 0) {
    return { vol: 0, sharpe: 0, sortino: 0, cvar: 0, mdd: 0, calcMode: 'realized', dailyReturns: [] };
  }

  // 1. 각 자산별 일간 수익률 시계열화 (길이가 가장 짧은 데이터에 맞춤)
  const assetReturns = {};
  let minLen = Infinity;

  for (const h of holdings) {
    const data = historicalData.find(d => d.ticker === h.code);
    if (!data || data.prices.length < 2) continue; // 데이터 부족
    
    // prices 배열이 과거 -> 최신 (인덱스 증가할수록 최신)이라고 가정. (api/kis-history는 reverse()하여 넘겨줌)
    const returns = [];
    for (let i = 1; i < data.prices.length; i++) {
       returns.push((data.prices[i] - data.prices[i-1]) / data.prices[i-1]);
    }
    assetReturns[h.code] = returns;
    minLen = Math.min(minLen, returns.length);
  }

  if (minLen === Infinity || minLen < 2) {
    return { vol: 0, sharpe: 0, sortino: 0, cvar: 0, mdd: 0, calcMode: 'error_insufficient_data', dailyReturns: [], warnings: ["과거 시세 데이터가 부족하여 실현 리스크를 계산할 수 없습니다."] };
  }

  // 2. 포트폴리오 일간 수익률 계산 (최근 minLen일치)
  const portDailyReturns = [];
  let portCumReturns = [1]; // MDD 전용 (1을 기준점으로)

  for (let i = 0; i < minLen; i++) {
    let dailyRet = 0;
    let totalW = 0;
    for (const h of holdings) {
      if (assetReturns[h.code]) {
        const w = (Number(h.target) || 0) / 100;
        // 시계열 끝(가장 최근 데이터)을 맞추기 위해 뒤에서부터 접근
        const retIdx = assetReturns[h.code].length - minLen + i;
        dailyRet += w * assetReturns[h.code][retIdx];
        totalW += w;
      }
    }
    // 정규화 (전체 비중 합이 1이 아닐 대비)
    dailyRet = totalW > 0 ? dailyRet / totalW : 0;
    portDailyReturns.push(dailyRet);
    portCumReturns.push(portCumReturns[i] * (1 + dailyRet));
  }

  // 3. 변동성 및 샤프 지수 계산 (연율화)
  const dailyVol = std(portDailyReturns);
  const annualVol = dailyVol * Math.sqrt(252);
  const excessRet = expectedReturn - rfRate;
  const sharpe = annualVol > 0 ? excessRet / annualVol : 0;

  // 4. 하방 편차 및 소르티노 지수 계산 (연율화)
  const negativeReturns = portDailyReturns.filter(r => r < 0);
  const dailyDownsideVol = negativeReturns.length > 0 ? std(negativeReturns) : 0;
  const annualDownsideVol = dailyDownsideVol * Math.sqrt(252);
  const sortino = annualDownsideVol > 0 ? excessRet / annualDownsideVol : 0;

  // 5. MDD 계산
  let mdd = 0;
  let peak = portCumReturns[0];
  for (const cr of portCumReturns) {
    if (cr > peak) peak = cr;
    const drawDown = (cr - peak) / peak;
    if (drawDown < mdd) mdd = drawDown;
  }

  // 6. CVaR 계산 (역사적 시뮬레이션 방식, 하위 5% 평균)
  const cvarLevel = 0.05;
  const sortedReturns = [...portDailyReturns].sort((a, b) => a - b);
  const cutoffIndex = Math.max(1, Math.floor(sortedReturns.length * cvarLevel));
  const worstReturns = sortedReturns.slice(0, cutoffIndex);
  const dailyCVaR = Math.abs(mean(worstReturns));
  // 보통 CVaR는 하루 단위로 표기하거나 연율화하지만, UI 직관성을 위해 일간 수치의 절대값을 %로 제공 (또는 연율화 = daily * sqrt(252))
  const annualCVaR = dailyCVaR * Math.sqrt(252);

  return {
    vol: Math.round(annualVol * 1000) / 10,       // %
    sharpe: Math.round(sharpe * 100) / 100,
    sortino: Math.round(sortino * 100) / 100,
    cvar: Math.round(annualCVaR * 1000) / 10,     // %
    mdd: Math.round(Math.abs(mdd) * 1000) / 10,   // %
    calcMode: 'realized',
    dailyReturns: portDailyReturns
  };
}

// =============================================================================
// 기간별 리스크 보고서 (1단계: 추정 기반 — 2단계에서 실현 데이터로 교체)
// =============================================================================

/**
 * 포트폴리오 리스크 전체 보고서 생성
 * 
 * @param {Array} holdings - 보유 종목 배열
 * @param {number} expectedReturn - 기대 수익률
 * @param {string} period - '1Y' | '3Y' | 'all'
 * @param {Array<{ticker, prices}>} historicalData - 실현 데이터 배열 (있을 경우 실현 리스크 반환)
 * @returns {Object} 리스크 보고서
 */
export function generateRiskReport(holdings, expectedReturn = 0.08, period = '1Y', historicalData = null) {
  const riskContribution = calculateRiskContribution(holdings, RISK_DATA);

  if (historicalData && historicalData.length > 0) {
    const realized = calculateRealizedRisk(holdings, historicalData, expectedReturn);
    return {
      period,
      metrics: {
        vol: realized.vol,
        sharpe: realized.sharpe,
        sortino: realized.sortino,
        cvar: realized.cvar,
        mdd: realized.mdd
      },
      riskContribution,
      calcMode: realized.calcMode,
      warnings: [],
      dailyReturns: realized.dailyReturns
    };
  }
  const riskMetrics = estimateRiskMetrics(holdings, RISK_DATA, expectedReturn);
  const sortinoResult = estimateSortino(expectedReturn, riskMetrics.vol);
  const cvarResult = estimateCVaR(riskMetrics.vol);

  return {
    period,
    metrics: {
      vol: riskMetrics.vol,
      sharpe: riskMetrics.sharpe,
      sortino: sortinoResult.sortino,
      cvar: cvarResult.cvar,
      mdd: 0 // 추정 기반일 때는 MDD 불가 (임의값 제공하지 않음)
    },
    riskContribution, // 위에서 선언된 값 사용
    calcMode: 'estimated', // 2단계에서 'realized'로 교체
    // 추정 기반임을 명시하는 경고
    warnings: [
      '데이터 연동 지연으로 현재 자산군별 평균 기반 추정치를 제공합니다.',
      '실제적인 데이터가 로딩되면 곧바로 업데이트됩니다.',
      ...(period !== '1Y' ? [`${period} 기간 데이터는 현재 단일 추정치로 동일하게 표시됩니다.`] : []),
    ],
    dailyReturns: []
  };
}
