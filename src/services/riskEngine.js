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
// 기간별 리스크 보고서 (1단계: 추정 기반 — 2단계에서 실현 데이터로 교체)
// =============================================================================

/**
 * 포트폴리오 리스크 전체 보고서 생성
 * 
 * @param {Array} holdings - 보유 종목 배열
 * @param {number} expectedReturn - 기대 수익률
 * @param {string} period - '1Y' | '3Y' | 'all'
 * @returns {Object} 리스크 보고서
 */
export function generateRiskReport(holdings, expectedReturn = 0.08, period = '1Y') {
  const riskMetrics = estimateRiskMetrics(holdings, RISK_DATA, expectedReturn);
  const riskContribution = calculateRiskContribution(holdings, RISK_DATA);
  const sortinoResult = estimateSortino(expectedReturn, riskMetrics.vol);
  const cvarResult = estimateCVaR(riskMetrics.vol);

  return {
    period,
    metrics: {
      vol: riskMetrics.vol,
      sharpe: riskMetrics.sharpe,
      sortino: sortinoResult.sortino,
      cvar: cvarResult.cvar,
    },
    riskContribution,
    calcMode: 'estimated', // 2단계에서 'realized'로 교체
    // 추정 기반임을 명시하는 경고
    warnings: [
      '현재 리스크 지표는 자산군별 평균 변동성 기반 추정치입니다.',
      '실제 수익률 데이터 기반 계산은 2단계에서 지원 예정입니다.',
      ...(period !== '1Y' ? [`${period} 기간 데이터는 현재 단일 추정치로 동일하게 표시됩니다.`] : []),
    ],
  };
}
