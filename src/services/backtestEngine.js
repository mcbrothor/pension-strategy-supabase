/**
 * 백테스트 엔진
 * 실현(역사적) 일일 수익률 데이터를 사용하여 
 * 초기 자본금 대비 포트폴리오의 성과(수수료, 슬리피지 포함)를 시뮬레이션합니다.
 */

/**
 * 간단한 일일 리밸런싱 기반 백테스트 (실제로는 월 1회지만 데모용으로 일일 리밸런싱 가정)
 * @param {Array<{ticker, prices}>} historicalData - 각 자산별 가격 배열
 * @param {Array<{code, target}>} holdings - 포트폴리오 비중
 * @param {number} initialCapital - 초기 투자 금액 (기본 100만)
 * @param {number} feeRate - 거래 수수료율 (기본 0.015%)
 * @param {number} slippage - 슬리피지 (기본 0.1%)
 */
export function runBacktest(historicalData, holdings, initialCapital = 1000000, feeRate = 0.00015, slippage = 0.001) {
  if (!historicalData || !holdings || holdings.length === 0) return null;

  // 가격 데이터를 길이순/날짜순으로 정렬 (최소 길이 기준)
  let minLen = Infinity;
  const priceMatrix = {};

  for (const h of holdings) {
    const data = historicalData.find(d => d.ticker === h.code);
    if (!data || data.prices.length < 2) continue;
    priceMatrix[h.code] = data.prices;
    minLen = Math.min(minLen, data.prices.length);
  }

  if (minLen === Infinity || minLen < 5) return null;

  let portfolioValue = initialCapital;
  const equityCurve = [{ day: 0, value: initialCapital, drawdown: 0 }];
  let peak = initialCapital;

  // 일일 수익률 계산 및 포트폴리오 시뮬레이션
  for (let i = 1; i < minLen; i++) {
    let dailyReturn = 0;
    let totalW = 0;

    for (const h of holdings) {
      if (priceMatrix[h.code]) {
        const prices = priceMatrix[h.code];
        const idx = prices.length - minLen + i; 
        const prevPrice = prices[idx - 1];
        const currentPrice = prices[idx];
        
        let assetReturn = (currentPrice - prevPrice) / prevPrice;
        
        // 매일 리밸런싱한다고 가정하면 수수료/슬리피지가 과도해지나, 
        // 여기서는 간단히 전체 포트폴리오 턴오버율을 매우 낮게 잡아 일괄 차감(단순화)
        // 실제로는 월간 리밸런싱 로직이 들어가야 함.
        assetReturn -= (feeRate + slippage) / 20; // 20영업일 분산 차감

        const w = (Number(h.target) || 0) / 100;
        dailyReturn += w * assetReturn;
        totalW += w;
      }
    }

    if (totalW > 0) dailyReturn /= totalW;
    
    portfolioValue = portfolioValue * (1 + dailyReturn);
    if (portfolioValue > peak) peak = portfolioValue;
    const drawdown = ((portfolioValue - peak) / peak) * 100;

    equityCurve.push({
      day: i,
      value: Math.round(portfolioValue),
      drawdown
    });
  }

  // 최종 요약 리포트
  const totalReturn = ((portfolioValue - initialCapital) / initialCapital) * 100;
  const cagr = (Math.pow(portfolioValue / initialCapital, 252 / minLen) - 1) * 100;

  return {
    initialCapital,
    finalValue: Math.round(portfolioValue),
    totalReturn: Number(totalReturn.toFixed(2)),
    cagr: Number(cagr.toFixed(2)),
    equityCurve
  };
}
