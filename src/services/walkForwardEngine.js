import { runBacktest } from './backtestEngine.js';

/**
 * Walk-Forward 검증 엔진
 * 데이터를 In-Sample(과거)과 Out-Of-Sample(최근)로 나누어
 * 전략이 과최적화(Overfitting)되지 않았는지 검증합니다.
 */

export function runWalkForward(historicalData, holdings, splitRatio = 0.5) {
  if (!historicalData || historicalData.length === 0 || !holdings) return null;

  // 데이터셋 분리 복제
  const isData = [];
  const oosData = [];

  for (const d of historicalData) {
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

  // 각각 백테스트 실행
  const isResult = runBacktest(isData, holdings);
  const oosResult = runBacktest(oosData, holdings);

  if (!isResult || !oosResult) return null;

  // 검증 점수 (효율성 비율 = OOS 성과 / IS 성과)
  // 현실적으로 OOS의 CAGR이 IS의 CAGR의 50% 이상 유지되면 과최적화 탈피로 양호하게 봅니다.
  const isPositive = isResult.cagr > 0;
  const oosPositive = oosResult.cagr > 0;
  
  let robustness = 0;
  if (isPositive && oosPositive) robustness = oosResult.cagr / isResult.cagr;
  else if (!isPositive && !oosPositive) robustness = 1; // 둘 다 손실이면 방향은 일치
  else robustness = 0; // 방향 불일치 (과최적화 심각)

  return {
    isResult,
    oosResult,
    robustness: Number(robustness.toFixed(2)),
    status: robustness >= 0.5 ? 'Pass (Robust)' : 'Fail (Overfitted)'
  };
}
