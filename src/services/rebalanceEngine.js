/**
 * 리밸런싱 엔진 서비스
 * 
 * RebalanceJudge 내 인라인 계산 로직을 분리하여
 * 테스트 가능하고 재사용 가능한 서비스로 변환합니다.
 * 
 * 핵심 출력: ActionTicket[] (매수/매도/보류 제안서)
 */

import { ZONES, STRATEGIES } from '../constants/index.js';

// =============================================================================
// Types (JSDoc)
// =============================================================================

/**
 * @typedef {Object} ActionTicket
 * @property {'buy' | 'sell' | 'hold'} actionType
 * @property {string} assetClass - 자산군 이름
 * @property {number} amount - 조정 금액 (원)
 * @property {number} [quantity] - 조정 수량 (주) — 가격 정보 있을 때만
 * @property {number} priority - 실행 우선순위 (1이 최우선)
 * @property {number} splitPlan - 분할 매수 횟수
 * @property {string[]} reasons - 판단 근거 배열
 */

// =============================================================================
// 자산군별 집계
// =============================================================================

/**
 * holdings를 자산군 기준으로 합산하여 현재 비중·편차·수익률을 계산합니다.
 * 왜 분리했나: RebalanceJudge와 DailyCheckPanel 모두 동일 계산이 필요하기 때문.
 * 
 * @param {Array} holdings - 보유 종목 배열
 * @param {number} total - 총 평가금액
 * @returns {Array} 자산군별 집계 결과
 */
export function aggregateByAssetClass(holdings, total) {
  const classMap = {};

  holdings.forEach(h => {
    const cls = h.cls || "기타";
    if (!classMap[cls]) {
      classMap[cls] = { cls, amt: 0, costAmt: 0, target: h.target };
    }
    classMap[cls].amt += (Number(h.amt) || 0);
    classMap[cls].costAmt += (Number(h.costAmt) || 0);
  });

  return Object.values(classMap).map(c => {
    const cur = total > 0 ? Math.round(c.amt / total * 1000) / 10 : 0;
    const diff = Math.round((cur - c.target) * 10) / 10;
    const pnlPct = c.costAmt > 0 ? Math.round((c.amt - c.costAmt) / c.costAmt * 1000) / 10 : null;
    const targetAmt = Math.round(total * c.target / 100);
    const actionAmt = Math.round((c.amt - targetAmt) / 10000) * 10000;

    return { ...c, cur, diff, pnlPct, targetAmt, actionAmt };
  });
}

// =============================================================================
// IRP 위험자산 비율 체크
// =============================================================================

const RISK_ASSET_CLASSES = ["미국주식", "선진국주식", "신흥국주식", "국내주식", "금", "원자재", "부동산리츠"];

/**
 * IRP 위험자산 비율 산출
 * @param {Array} assetClassResults - aggregateByAssetClass 결과
 * @returns {number} 위험자산 비율 (%)
 */
export function calculateIRPRiskRatio(assetClassResults) {
  return Math.round(
    assetClassResults
      .filter(c => RISK_ASSET_CLASSES.includes(c.cls))
      .reduce((s, c) => s + c.cur, 0) * 10
  ) / 10;
}

// =============================================================================
// 리밸런싱 시점 판단
// =============================================================================

const REBAL_DAYS = { "연 1회": 365, "분기 1회": 90, "월 1회": 30 };

/**
 * 리밸런싱 시점 판단
 * @param {string} lastRebalDate - 마지막 리밸런싱 날짜
 * @param {string} rebalPeriod - 리밸런싱 주기
 * @returns {{ elapsed: number, required: number, isOverdue: boolean, isTime: boolean, progressPct: number }}
 */
export function checkRebalanceTiming(lastRebalDate, rebalPeriod) {
  const required = REBAL_DAYS[rebalPeriod] || 365;
  const elapsed = Math.floor((new Date() - new Date(lastRebalDate)) / 86400000);
  const isOverdue = elapsed >= required;
  const isTime = elapsed >= required * 0.9;
  const progressPct = Math.min(Math.round(elapsed / required * 100), 100);

  return { elapsed, required, isOverdue, isTime, progressPct };
}

// =============================================================================
// ActionTicket 생성 (주문 제안서)
// =============================================================================

/**
 * 자산군별 ActionTicket 배열 생성
 * 왜 ActionTicket인가: 주문 제안서의 핵심 단위로, UI에서 체크리스트 형태로 보여줍니다.
 * 
 * @param {Array} assetClassResults - aggregateByAssetClass 결과
 * @param {Object} params
 * @param {number} params.vix - 현재 VIX
 * @param {number} params.stopLoss - 손절 기준 (%)
 * @param {number} params.mdd - 현재 MDD (%)
 * @param {number} params.mddLimit - MDD 제한선 (%)
 * @param {string} params.accountType - 계좌 유형
 * @param {number} params.irpRiskRatio - IRP 위험자산 비율
 * @returns {ActionTicket[]}
 */
export function generateActionTickets(assetClassResults, { vix, stopLoss, mdd, mddLimit, accountType, irpRiskRatio }) {
  const zone = ZONES.find(z => vix < z.max) || ZONES[3];
  // VIX 기반 분할 매수 횟수 결정
  const splitCount = vix > 35 ? 5 : vix > 25 ? 3 : 1;
  
  const tickets = [];
  let priority = 1;

  // 1. 손절 대상 (최우선)
  const stopLossItems = assetClassResults.filter(c => c.pnlPct !== null && c.pnlPct < stopLoss);
  stopLossItems.forEach(c => {
    tickets.push({
      actionType: 'sell',
      assetClass: c.cls,
      amount: c.actionAmt,
      priority: priority++,
      splitPlan: 1, // 손절은 분할하지 않음
      reasons: [
        `손절 기준(${stopLoss}%) 초과: 현재 수익률 ${c.pnlPct}%`,
        '즉시 매도 후 방어 자산으로 전환 권장',
      ],
    });
  });

  // 2. MDD 초과 방어 매도
  if (mdd < mddLimit) {
    const riskAssets = assetClassResults
      .filter(c => RISK_ASSET_CLASSES.includes(c.cls) && c.actionAmt > 5000)
      .sort((a, b) => b.actionAmt - a.actionAmt);
    
    riskAssets.forEach(c => {
      if (!tickets.find(t => t.assetClass === c.cls)) {
        tickets.push({
          actionType: 'sell',
          assetClass: c.cls,
          amount: c.actionAmt,
          priority: priority++,
          splitPlan: 1,
          reasons: [
            `MDD ${mdd.toFixed(1)}% → 제한선 ${mddLimit}% 초과`,
            '방어 자산 비중 확보 우선',
          ],
        });
      }
    });
  }

  // 3. IRP 한도 초과 매도
  if (accountType === "IRP" && irpRiskRatio > 70) {
    const overflowItems = assetClassResults
      .filter(c => RISK_ASSET_CLASSES.includes(c.cls) && c.actionAmt > 5000)
      .sort((a, b) => b.diff - a.diff);
    
    overflowItems.forEach(c => {
      if (!tickets.find(t => t.assetClass === c.cls)) {
        tickets.push({
          actionType: 'sell',
          assetClass: c.cls,
          amount: c.actionAmt,
          priority: priority++,
          splitPlan: 1,
          reasons: [
            `IRP 위험자산 ${irpRiskRatio}% → 한도 70% 초과`,
            '규제 준수를 위한 비중 축소 필요',
          ],
        });
      }
    });
  }

  // 4. 일반 매도 (비중 초과)
  assetClassResults
    .filter(c => c.actionAmt > 5000 && !tickets.find(t => t.assetClass === c.cls))
    .sort((a, b) => b.diff - a.diff)
    .forEach(c => {
      tickets.push({
        actionType: 'sell',
        assetClass: c.cls,
        amount: c.actionAmt,
        priority: priority++,
        splitPlan: 1,
        reasons: [
          `현재 비중 ${c.cur}% → 목표 ${c.target}% (초과 ${c.diff.toFixed(1)}%p)`,
          `약 ${Math.abs(c.actionAmt).toLocaleString()}원 규모 축소`,
        ],
      });
    });

  // 5. 매수 (비중 부족)
  assetClassResults
    .filter(c => c.actionAmt < -5000 && !tickets.find(t => t.assetClass === c.cls))
    .sort((a, b) => a.diff - b.diff) // 부족한 순서대로
    .forEach(c => {
      const reasons = [
        `현재 비중 ${c.cur}% → 목표 ${c.target}% (부족 ${Math.abs(c.diff).toFixed(1)}%p)`,
        `약 ${Math.abs(c.actionAmt).toLocaleString()}원 규모 확보`,
      ];
      if (splitCount > 1) {
        reasons.push(`VIX ${vix?.toFixed(1)} ${zone.lbl} 구간 → ${splitCount}회 분할 매수 권장`);
        reasons.push(`1회당 약 ${Math.round(Math.abs(c.actionAmt) / splitCount / 10000 * 10000).toLocaleString()}원`);
      }
      tickets.push({
        actionType: 'buy',
        assetClass: c.cls,
        amount: Math.abs(c.actionAmt),
        priority: priority++,
        splitPlan: splitCount,
        reasons,
      });
    });

  // 6. 유지 (편차 ±0.5만원 이내)
  assetClassResults
    .filter(c => Math.abs(c.actionAmt) <= 5000 && !tickets.find(t => t.assetClass === c.cls))
    .forEach(c => {
      tickets.push({
        actionType: 'hold',
        assetClass: c.cls,
        amount: 0,
        priority: priority++,
        splitPlan: 0,
        reasons: [`비중 ${c.cur}% — 목표 범위 내 유지`],
      });
    });

  return tickets;
}

// =============================================================================
// 판단 근거(Reasons) 수집
// =============================================================================

/**
 * 리밸런싱 종합 판단 근거 수집
 * @param {Object} params - 각종 판단 파라미터
 * @returns {Array<{ type: 'ok'|'warn'|'danger', title: string, body: string }>}
 */
export function collectReasons({ timing, vix, mdd, mddLimit, avgCorrelation, assetClassResults, accountType, irpRiskRatio, stopLoss }) {
  const z = ZONES.find(zn => vix < zn.max) || ZONES[3];
  const { elapsed, required, isOverdue, isTime } = timing;

  const reasons = [
    {
      type: isOverdue ? "danger" : isTime ? "warn" : "ok",
      title: `리밸런싱 주기 — ${elapsed}일 경과 / ${required}일 기준`,
      body: isOverdue ? `기준 초과 — 즉시 실행 권장.` : isTime ? `기준의 90% 도달 — 실행 시점.` : `${required - elapsed}일 후 예정.`
    },
    {
      type: vix && vix > 35 ? "danger" : vix && vix > 25 ? "warn" : "ok",
      title: `VIX ${vix?.toFixed(1) || "…"} — ${z.lbl} (${z.mode})`,
      body: z.desc
    },
    {
      type: mdd < mddLimit ? "danger" : "ok",
      title: `MDD ${mdd.toFixed(1)}% (제한선 ${mddLimit}%)`,
      body: mdd < mddLimit ? "MDD 제한선 초과 — 방어 자산 비중 확보 우선." : "MDD 정상 범위. 전략 기준대로 진행하세요."
    },
    {
      type: avgCorrelation > 0.7 ? "danger" : avgCorrelation > 0.6 ? "warn" : "ok",
      title: `자산 상관관계: ${avgCorrelation.toFixed(2)}`,
      body: avgCorrelation > 0.7 ? "자산 간 동반 하락 위험이 큽니다. 현금 비중 확보를 권장합니다." : "분산 투자 효과가 안정적으로 유지되고 있습니다."
    },
    {
      type: assetClassResults.filter(c => Math.abs(c.diff) >= 5).length > 0 ? "warn" : "ok",
      title: `자산 비중 이격 점검 (±5%p)`,
      body: assetClassResults.filter(c => Math.abs(c.diff) >= 5).length > 0
        ? `일부 자산의 비중이 목표에서 크게 벗어났습니다 (${assetClassResults.filter(c => Math.abs(c.diff) >= 5).length}건).`
        : "모든 자산의 비중이 목표 범위 내에 있습니다."
    },
  ];

  // IRP 한도 체크
  if (accountType === "IRP") {
    reasons.push({
      type: irpRiskRatio > 70 ? "danger" : irpRiskRatio > 65 ? "warn" : "ok",
      title: `IRP 위험자산 ${irpRiskRatio}% (한도 70%)`,
      body: irpRiskRatio > 70 ? "IRP 한도 초과. 위험자산 비중을 70% 이하로 맞추세요." : "IRP 위험자산 정상 범위."
    });
  }

  // 손절 경고
  const stopLossItems = assetClassResults.filter(c => c.pnlPct !== null && c.pnlPct < stopLoss);
  if (stopLossItems.length > 0) {
    reasons.push({
      type: "danger",
      title: `손절 경고: ${stopLossItems.map(c => c.cls).join(", ")}`,
      body: `손절 기준(${stopLoss}%) 초과. 우선 매도 후 리밸런싱하세요.`
    });
  }

  return reasons;
}
