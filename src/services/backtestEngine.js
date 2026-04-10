/**
 * 백테스트 엔진
 * 
 * 왜 이 엔진이 필요한가:
 * 과거 가격 데이터를 사용하여 포트폴리오의 실현 성과를 시뮬레이션합니다.
 * 수수료, 슬리피지를 감안한 현실적 시뮬레이션을 제공합니다.
 * 
 * @module backtestEngine
 */

/**
 * 포트폴리오 백테스트 실행
 * 
 * @param {Array<{ticker: string, prices: number[]}>} historicalData - 각 자산별 가격 배열 (오래된 순 → 최신 순)
 * @param {Array<{code: string, target: number}>} holdings - 포트폴리오 비중 (target: 퍼센트 값)
 * @param {number} initialCapital - 초기 투자 금액 (기본 100만원)
 * @param {number} feeRate - 거래 수수료율 (기본 0.015%)
 * @param {number} slippage - 슬리피지 (기본 0.1%)
 * @returns {Object|null} 백테스트 결과 또는 데이터 부족 시 null
 */
export function runBacktest(historicalData, holdings, initialCapital = 1000000, feeRate = 0.00015, slippage = 0.001) {
  if (!historicalData || !holdings || holdings.length === 0) return null;

  // 가격 데이터를 길이순/날짜순으로 정렬 (최소 길이 기준)
  let minLen = Infinity;
  const priceMatrix = {};

  for (const h of holdings) {
    const data = historicalData.find(d => d.ticker === h.code);
    if (!data || !data.prices || data.prices.length < 2) continue;
    priceMatrix[h.code] = data.prices;
    minLen = Math.min(minLen, data.prices.length);
  }

  // 데이터가 매칭된 종목이 하나도 없으면 null 반환
  if (minLen === Infinity || minLen < 5) return null;

  let portfolioValue = initialCapital;
  const equityCurve = [{ day: 0, value: initialCapital, drawdown: 0 }];
  let peak = initialCapital;
  let maxDrawdown = 0;

  // 비중 합 사전 계산 (한 번만 계산하여 루프 내 반복 방지)
  let totalWeightSum = 0;
  for (const h of holdings) {
    if (priceMatrix[h.code]) {
      totalWeightSum += (Number(h.target) || 0) / 100;
    }
  }
  // 비중합이 0이면 계산 불가
  if (totalWeightSum <= 0) return null;

  // 일일 수익률 계산 및 포트폴리오 시뮬레이션
  for (let i = 1; i < minLen; i++) {
    let dailyReturn = 0;

    for (const h of holdings) {
      if (priceMatrix[h.code]) {
        const prices = priceMatrix[h.code];
        const idx = prices.length - minLen + i; 
        const prevPrice = prices[idx - 1];
        const currentPrice = prices[idx];
        
        // 가격이 0 이하인 경우 방어 (비정상 데이터)
        if (!prevPrice || prevPrice <= 0) continue;
        
        let assetReturn = (currentPrice - prevPrice) / prevPrice;
        
        // 월간 리밸런싱 가정: 수수료/슬리피지를 20영업일로 분산 차감
        // 왜 20으로 나누나: 월 1회 리밸런싱 시 실제 턴오버가 발생하는 건 한 달에 1번이므로
        assetReturn -= (feeRate + slippage) / 20;

        const w = (Number(h.target) || 0) / 100;
        dailyReturn += w * assetReturn;
      }
    }

    // 비중합 정규화 (비중 합이 정확히 100%가 아닐 때 보정)
    dailyReturn /= totalWeightSum;
    
    portfolioValue = portfolioValue * (1 + dailyReturn);
    if (portfolioValue > peak) peak = portfolioValue;
    
    const drawdown = ((portfolioValue - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;

    equityCurve.push({
      day: i,
      value: Math.round(portfolioValue),
      drawdown: Math.round(drawdown * 100) / 100
    });
  }

  // 최종 요약 리포트
  const totalReturn = ((portfolioValue - initialCapital) / initialCapital) * 100;
  // CAGR 계산: 252 영업일 = 1년 기준
  const cagr = (Math.pow(portfolioValue / initialCapital, 252 / minLen) - 1) * 100;

  return {
    initialCapital,
    finalValue: Math.round(portfolioValue),
    totalReturn: Number(totalReturn.toFixed(2)),
    cagr: Number(cagr.toFixed(2)),
    mdd: Number(maxDrawdown.toFixed(2)),
    equityCurve
  };
}
