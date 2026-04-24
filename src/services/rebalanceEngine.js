import { ZONES } from '../constants/index.js';

export function aggregateByAssetClass(holdings, total, options = {}) {
  const classMap = {};
  const overrideTargets = options.targetWeights || {};

  holdings.forEach((h) => {
    const cls = h.cls || '기타';
    if (!classMap[cls]) {
      classMap[cls] = {
        cls,
        amt: 0,
        costAmt: 0,
        target: Number.isFinite(Number(overrideTargets[cls])) ? Number(overrideTargets[cls]) : Number(h.target) || 0,
      };
    }
    classMap[cls].amt += Number(h.amt) || 0;
    classMap[cls].costAmt += Number(h.costAmt) || 0;
  });

  return Object.values(classMap).map((c) => {
    const cur = total > 0 ? Math.round((c.amt / total) * 1000) / 10 : 0;
    const diff = Math.round((cur - c.target) * 10) / 10;
    const pnlPct = c.costAmt > 0 ? Math.round(((c.amt - c.costAmt) / c.costAmt) * 1000) / 10 : null;
    const targetAmt = Math.round((total * c.target) / 100);
    const actionAmt = Math.round((c.amt - targetAmt) / 10000) * 10000;

    return { ...c, cur, diff, pnlPct, targetAmt, actionAmt };
  });
}

export function calculateCompositeSplit(vix, fearGreed = null, yieldSpread = null) {
  let score = 0;

  if (vix > 35) score += 3;
  else if (vix > 25) score += 2;
  else if (vix > 20) score += 1;

  if (fearGreed !== null) {
    if (fearGreed <= 20) score += 3;
    else if (fearGreed <= 40) score += 2;
    else if (fearGreed <= 55) score += 1;
  }

  if (yieldSpread !== null) {
    if (yieldSpread < 0) score += 2;
    else if (yieldSpread < 0.5) score += 1;
  }

  if (score >= 7) return 7;
  if (score >= 5) return 5;
  if (score >= 3) return 3;
  if (score >= 2) return 2;
  return 1;
}

const EXPLICIT_RISK_CLASSES = new Set([
  '미국 주식', '국내 주식', '실물자산',
  'US Stock', 'KR Stock', 'Real Assets',
]);

export function isRiskAssetClass(cls) {
  if (!cls) return false;
  if (EXPLICIT_RISK_CLASSES.has(cls)) return true;

  const lower = String(cls).toLowerCase();
  const defensiveHints = ['mmf', 'bond', '채권', '현금', 'cash'];
  return !defensiveHints.some((hint) => lower.includes(hint));
}

export function calculateIRPRiskRatio(assetClassResults) {
  return (
    Math.round(
      assetClassResults
        .filter((c) => isRiskAssetClass(c.cls))
        .reduce((s, c) => s + c.cur, 0) * 10
    ) / 10
  );
}

function getRequiredDays(rebalPeriod) {
  const text = String(rebalPeriod || '');
  if (/분기|quarter|90/.test(text)) return 90;
  if (/월|month|30/.test(text)) return 30;
  return 365;
}

export function checkRebalanceTiming(lastRebalDate, rebalPeriod) {
  const required = getRequiredDays(rebalPeriod);
  const elapsed = Math.floor((Date.now() - new Date(lastRebalDate).getTime()) / 86400000);
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(elapsed, 0) : 0;
  const isOverdue = safeElapsed >= required;
  const isTime = safeElapsed >= required * 0.9;
  const progressPct = Math.min(Math.round((safeElapsed / required) * 100), 100);

  return { elapsed: safeElapsed, required, isOverdue, isTime, progressPct };
}

export function generateActionTickets(
  assetClassResults,
  { vix, fearGreed, yieldSpread, stopLoss, mdd, mddLimit, accountType, irpRiskRatio }
) {
  const zone = ZONES.find((z) => vix < z.max) || ZONES[ZONES.length - 1];
  const splitCount = calculateCompositeSplit(vix, fearGreed, yieldSpread);

  const tickets = [];
  let priority = 1;

  const stopLossItems = assetClassResults.filter((c) => c.pnlPct !== null && c.pnlPct < stopLoss);
  stopLossItems.forEach((c) => {
    tickets.push({
      actionType: 'sell',
      assetClass: c.cls,
      amount: Math.abs(c.actionAmt),
      priority: priority++,
      splitPlan: 1,
      reasons: [
        `손절 기준(${stopLoss}%) 초과: 현재 수익률 ${c.pnlPct}%`,
        '즉시 매도 후 방어 자산으로 전환 권장',
      ],
    });
  });

  if (mdd < mddLimit) {
    assetClassResults
      .filter((c) => isRiskAssetClass(c.cls) && c.actionAmt > 5000)
      .sort((a, b) => b.actionAmt - a.actionAmt)
      .forEach((c) => {
        if (!tickets.find((t) => t.assetClass === c.cls)) {
          tickets.push({
            actionType: 'sell',
            assetClass: c.cls,
            amount: Math.abs(c.actionAmt),
            priority: priority++,
            splitPlan: 1,
            reasons: [
              `MDD ${mdd.toFixed(1)}%가 한도 ${mddLimit}%를 초과`,
              '방어 자산 비중 확대 우선',
            ],
          });
        }
      });
  }

  if (accountType === 'IRP' && irpRiskRatio > 70) {
    assetClassResults
      .filter((c) => isRiskAssetClass(c.cls) && c.actionAmt > 5000)
      .sort((a, b) => b.diff - a.diff)
      .forEach((c) => {
        if (!tickets.find((t) => t.assetClass === c.cls)) {
          tickets.push({
            actionType: 'sell',
            assetClass: c.cls,
            amount: Math.abs(c.actionAmt),
            priority: priority++,
            splitPlan: 1,
            reasons: [
              `IRP 위험자산 ${irpRiskRatio}%로 한도 70% 초과`,
              '규제 준수를 위한 비중 축소 필요',
            ],
          });
        }
      });
  }

  assetClassResults
    .filter((c) => c.actionAmt > 5000 && !tickets.find((t) => t.assetClass === c.cls))
    .sort((a, b) => b.diff - a.diff)
    .forEach((c) => {
      tickets.push({
        actionType: 'sell',
        assetClass: c.cls,
        amount: Math.abs(c.actionAmt),
        priority: priority++,
        splitPlan: 1,
        reasons: [
          `현재 비중 ${c.cur}% → 목표 ${c.target}% (초과 ${c.diff.toFixed(1)}%p)`,
          `약 ${Math.abs(c.actionAmt).toLocaleString()}원 규모 축소`,
        ],
      });
    });

  assetClassResults
    .filter((c) => c.actionAmt < -5000 && !tickets.find((t) => t.assetClass === c.cls))
    .sort((a, b) => a.diff - b.diff)
    .forEach((c) => {
      const reasons = [
        `현재 비중 ${c.cur}% → 목표 ${c.target}% (부족 ${Math.abs(c.diff).toFixed(1)}%p)`,
        `약 ${Math.abs(c.actionAmt).toLocaleString()}원 규모 보강`,
      ];

      if (splitCount > 1) {
        reasons.push(`VIX ${vix?.toFixed(1)} ${zone.lbl} 구간으로 ${splitCount}회 분할매수 권장`);
        reasons.push(`1회당 약 ${Math.round((Math.abs(c.actionAmt) / splitCount / 10000) * 10000).toLocaleString()}원`);
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

  assetClassResults
    .filter((c) => Math.abs(c.actionAmt) <= 5000 && !tickets.find((t) => t.assetClass === c.cls))
    .forEach((c) => {
      tickets.push({
        actionType: 'hold',
        assetClass: c.cls,
        amount: 0,
        priority: priority++,
        splitPlan: 0,
        reasons: [`비중 ${c.cur}%가 목표 범위 내`],
      });
    });

  return tickets;
}

export function collectReasons({
  timing,
  vix,
  mdd,
  mddLimit,
  avgCorrelation,
  assetClassResults,
  accountType,
  irpRiskRatio,
  stopLoss,
}) {
  const z = ZONES.find((zn) => vix < zn.max) || ZONES[ZONES.length - 1];
  const { elapsed, required, isOverdue, isTime } = timing;

  const reasons = [
    {
      type: isOverdue ? 'danger' : isTime ? 'warn' : 'ok',
      title: `리밸런싱 주기: ${elapsed}일 경과 / ${required}일 기준`,
      body: isOverdue
        ? '기준일 초과로 즉시 점검 권장'
        : isTime
          ? '기준일의 90% 도달, 선제 점검 권장'
          : `${Math.max(required - elapsed, 0)}일 후 예정`,
    },
    {
      type: vix > 35 ? 'danger' : vix > 25 ? 'warn' : 'ok',
      title: `VIX ${vix?.toFixed(1) || '--'} (${z.lbl})`,
      body: z.desc,
    },
    {
      type: mdd < mddLimit ? 'danger' : 'ok',
      title: `MDD ${mdd.toFixed(1)}% (한도 ${mddLimit}%)`,
      body: mdd < mddLimit ? 'MDD 한도 초과, 방어적 조정 필요' : 'MDD 정상 범위',
    },
    {
      type: avgCorrelation > 0.7 ? 'danger' : avgCorrelation > 0.6 ? 'warn' : 'ok',
      title: `평균 상관계수 ${avgCorrelation.toFixed(2)}`,
      body:
        avgCorrelation > 0.7
          ? '자산 동조화가 높아 분산 효과 저하 가능'
          : '분산 상태 양호',
    },
  ];

  const driftCount = assetClassResults.filter((c) => Math.abs(c.diff) >= 5).length;
  reasons.push({
    type: driftCount > 0 ? 'warn' : 'ok',
    title: `비중 이탈(±5%p): ${driftCount}개`,
    body: driftCount > 0 ? '이탈 자산이 있어 리밸런싱 검토 필요' : '목표 범위 내 유지',
  });

  if (accountType === 'IRP') {
    reasons.push({
      type: irpRiskRatio > 70 ? 'danger' : irpRiskRatio > 65 ? 'warn' : 'ok',
      title: `IRP 위험자산 ${irpRiskRatio}% (한도 70%)`,
      body: irpRiskRatio > 70 ? '한도 초과 상태' : '한도 내',
    });
  }

  const stopLossItems = assetClassResults.filter((c) => c.pnlPct !== null && c.pnlPct < stopLoss);
  if (stopLossItems.length > 0) {
    reasons.push({
      type: 'danger',
      title: `손절 경고: ${stopLossItems.map((c) => c.cls).join(', ')}`,
      body: `손절 기준(${stopLoss}%) 초과`,
    });
  }

  return reasons;
}
