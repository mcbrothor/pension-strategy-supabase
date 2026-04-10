import { runBacktest } from './backtestEngine.js';

/**
 * Walk-Forward 검증 엔진
 * 
 * 왜 필요한가:
 * 백테스트만으로는 과최적화(Overfitting) 여부를 알 수 없습니다.
 * 데이터를 In-Sample(훈련)과 Out-Of-Sample(검증)로 분리하여
 * 전략이 미래 데이터에서도 유효한지 교차 검증합니다.
 * 
 * @module walkForwardEngine
 */

/**
 * Walk-Forward 검증 실행
 * 
 * @param {Array<{ticker: string, prices: number[]}>} historicalData - 가격 배열
 * @param {Array<{code: string, target: number}>} holdings - 포트폴리오 비중
 * @param {number} splitRatio - IS/OOS 분할 비율 (기본 0.5 = 50/50)
 * @returns {Object|null} 검증 결과 또는 데이터 부족 시 null
 */
export function runWalkForward(historicalData, holdings, splitRatio = 0.5) {
  if (!historicalData || historicalData.length === 0 || !holdings || holdings.length === 0) return null;

  // 데이터셋 분리: 각 자산의 가격을 IS(과거)와 OOS(최근)로 나눔
  const isData = [];
  const oosData = [];

  for (const d of historicalData) {
    if (!d.prices || d.prices.length < 10) continue; // 최소 10개 이상 데이터 필요
    
    const prices = d.prices;
    const splitIndex = Math.floor(prices.length * splitRatio);
    
    isData.push({
      ticker: d.ticker,
      prices: prices.slice(0, splitIndex)
    });
    
    oosData.push({
      ticker: d.ticker,
      prices: prices.slice(splitIndex)
    });
  }

  if (isData.length === 0 || oosData.length === 0) return null;

  // 각각 백테스트 실행
  const isResult = runBacktest(isData, holdings);
  const oosResult = runBacktest(oosData, holdings);

  if (!isResult || !oosResult) return null;

  // 검증 점수 (효율성 비율 = OOS 성과 / IS 성과)
  // 왜 50% 기준인가: 학술적으로 OOS의 CAGR이 IS의 50% 이상이면 과최적화 탈피로 간주
  const isPositive = isResult.cagr > 0;
  const oosPositive = oosResult.cagr > 0;
  
  let robustness = 0;
  if (isPositive && oosPositive) {
    // IS CAGR이 0인 경우의 나누기 에러 방지
    robustness = isResult.cagr !== 0 
      ? oosResult.cagr / isResult.cagr 
      : (oosResult.cagr > 0 ? 1 : 0);
  } else if (!isPositive && !oosPositive) {
    // 둘 다 손실이면 방향은 일치하므로 일관성 있음
    robustness = 1;
  } else {
    // 방향 불일치 (과최적화 심각)
    robustness = 0;
  }

  return {
    isResult,
    oosResult,
    robustness: Number(robustness.toFixed(2)),
    status: robustness >= 0.5 ? 'Pass (Robust)' : 'Fail (Overfitted)'
  };
}
