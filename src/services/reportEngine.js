/**
 * 리포트 엔진 서비스
 * 
 * MonthlyReport.jsx 내 인라인 HTML 생성 로직을 분리합니다.
 * 산식/기간/결측 경고를 포함하여 감사 가능성을 강화합니다.
 * 
 * 2단계에서 재현 ID 및 DecisionLog 저장 기능이 추가됩니다.
 */

import { fmt, fmtP, fmtR } from '../utils/formatters.js';
import { getStrat, getZone } from '../utils/helpers.js';
import { RISK_DATA } from '../constants/index.js';
import { estimateRiskMetrics } from './riskEngine.js';
import { buildPerformanceSummary, formatPercentValue } from '../utils/performance.js';

const THEME_KEYWORDS = [
  'AI',
  '인공지능',
  '소프트웨어',
  '비만',
  '치료제',
  '액티브',
  'SMR',
  '우주',
  '항공',
  '테마',
  '반도체',
  '전력',
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function holdingLabel(holding = {}) {
  const name = holding.etf || holding.name || '미상 자산';
  const code = holding.code || holding.ticker;
  return code ? `${name} (${code})` : name;
}

const TAG_COLORS = {
  "[미국 주식]": "#185fa5",
  "[국내 주식]": "#3b6d11",
  "[채권]": "#ba7517",
  "[실물자산]": "#639922",
  "[현금]": "#888780",
};

export function buildAssetClassTag(holding = {}) {
  const cls = String(holding.cls || holding.assetClass || '');
  const name = `${holding.etf || ''} ${holding.name || ''}`;
  const text = `${cls} ${name}`;

  if (/현금|MMF|CASH/i.test(text)) return '[현금]';
  if (/단기채|국고채|국내채권|중기채|장기채|글로벌채권|채권|bond/i.test(text)) return '[채권]';
  if (/미국주식|S&P|나스닥|미국/i.test(text)) return '[미국 주식]';
  if (/국내주식|코스피|코스닥|KRX/i.test(text)) return '[국내 주식]';
  if (/금|gold|원자재|commodity|리츠|reit|실물/i.test(text)) return '[실물자산]';
  return `[${cls || '기타 자산'}]`;
}

export function generateDonutSVG(weights, size = 160) {
  const entries = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return "";

  const radius = 60;
  const strokeWidth = 14;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;
  let circles = "";
  let legend = '<div style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-left:30px;">';

  entries.forEach(([tag, w]) => {
    const ratio = w / total;
    const strokeDasharray = `${circumference * ratio} ${circumference}`;
    const rotation = (accumulatedAngle / total) * 360 - 90;
    accumulatedAngle += w;
    const color = TAG_COLORS[tag] || "#ccc";

    circles += `<circle cx="${center}" cy="${center}" r="${radius}" fill="transparent" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" transform="rotate(${rotation} ${center} ${center})" />`;
    
    legend += `<div style="display:flex; align-items:center; gap:6px; font-size:12px; color:#444;">
      <div style="width:8px; height:8px; border-radius:50%; background:${color}"></div>
      <span style="font-weight:700">${tag}</span>
      <span style="color:#888">${w.toFixed(1)}%</span>
    </div>`;
  });
  legend += '</div>';

  return `
    <div style="display:flex; align-items:center; margin-bottom:25px; background:#f9f9f9; padding:20px; border-radius:12px; border:1px solid #eee;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${circles}
        <text x="50%" y="54%" text-anchor="middle" style="font-size:16px; font-weight:800; fill:#333; font-family:sans-serif;">${Math.round(total)}%</text>
      </svg>
      ${legend}
    </div>
  `;
}

const ASSET_PRIORITY = {
  '[미국 주식]': 1,
  '[국내 주식]': 2,
  '[채권]': 3,
  '[실물자산]': 4,
  '[현금]': 5,
};

function getAssetPriority(tag) {
  return ASSET_PRIORITY[tag] || 99;
}

export function buildLlmReadyHoldings(holdings = [], total = 0) {
  const mapped = holdings.map((holding) => {
    const amount = Number(holding.amt) || 0;
    const target = Number(holding.target) || 0;
    const cur = total > 0 ? Math.round((amount / total) * 1000) / 10 : Number(holding.cur) || 0;
    const costAmt = Number(holding.costAmt) || 0;
    const pnlPct = costAmt > 0 ? ((amount - costAmt) / costAmt) * 100 : null;

    return {
      ...holding,
      displayName: holdingLabel(holding),
      assetClassTag: buildAssetClassTag(holding),
      cur,
      target,
      diff: Math.round((cur - target) * 10) / 10,
      pnlPct,
    };
  });

  // 사용가 요청 우선순위에 따라 정렬: 미국주식 > 국내주식 > 채권 > 실물자산 > 현금
  return mapped.sort((a, b) => {
    const pA = getAssetPriority(a.assetClassTag);
    const pB = getAssetPriority(b.assetClassTag);
    if (pA !== pB) return pA - pB;
    // 같은 자산군 내에서는 자산명 정렬
    return a.displayName.localeCompare(b.displayName);
  });
}

export function detectStrategyPortfolioMismatch(strategy, holdings = [], total = 0) {
  const compositionClasses = new Set((strategy?.composition || []).map(item => item.cls).filter(Boolean));
  const activeHoldings = holdings.filter(item => Number(item.amt) > 0 && item.cls !== '현금MMF');
  const themeHoldings = activeHoldings.filter(item =>
    THEME_KEYWORDS.some(keyword => String(`${item.etf || ''} ${item.name || ''}`).toUpperCase().includes(keyword.toUpperCase()))
  );
  const offPolicyHoldings = activeHoldings.filter(item => compositionClasses.size > 0 && !compositionClasses.has(item.cls));
  const themeAmt = themeHoldings.reduce((sum, item) => sum + (Number(item.amt) || 0), 0);
  const offPolicyAmt = offPolicyHoldings.reduce((sum, item) => sum + (Number(item.amt) || 0), 0);
  const themePct = total > 0 ? (themeAmt / total) * 100 : 0;
  const offPolicyPct = total > 0 ? (offPolicyAmt / total) * 100 : 0;
  const allWeatherName = /올웨더|all.?weather/i.test(strategy?.name || '');
  const mismatch = Boolean(
    strategy?.type === 'fixed' &&
    ((allWeatherName && (themeHoldings.length >= 2 || themePct >= 15)) || offPolicyPct >= 30)
  );

  return {
    mismatch,
    displayName: mismatch ? '글로벌 테마 액티브 전략' : strategy?.name,
    warning: mismatch
      ? `선택 전략(${strategy?.name})과 실제 편입 자산의 성격이 다릅니다. 테마/전략외 자산 비중 ${Math.round(Math.max(themePct, offPolicyPct) * 10) / 10}%를 감지했습니다.`
      : null,
    themeHoldings,
    offPolicyHoldings,
    themePct: Math.round(themePct * 10) / 10,
    offPolicyPct: Math.round(offPolicyPct * 10) / 10,
  };
}

export function generateRebalanceInstruction(holdings = [], total = 0) {
  const threshold = Math.max(10000, total * 0.005);
  const items = holdings
    .filter(item => Number(item.target) > 0 && total > 0)
    .map(item => {
      const targetAmt = total * ((Number(item.target) || 0) / 100);
      const diffAmt = (Number(item.amt) || 0) - targetAmt;
      return {
        ...item,
        displayName: holdingLabel(item),
        diffAmt,
      };
    });
  const sells = items.filter(item => item.diffAmt > threshold).sort((a, b) => b.diffAmt - a.diffAmt);
  const buys = items.filter(item => item.diffAmt < -threshold).sort((a, b) => a.diffAmt - b.diffAmt);
  const formatAction = item => `${item.displayName} 약 ${fmt(Math.abs(item.diffAmt))}원`;

  if (sells.length === 0 && buys.length === 0) {
    return {
      text: '현재 보유 비중이 목표 비중과 큰 차이가 없어 정기 점검만 유지하십시오.',
      sells,
      buys,
    };
  }

  const sellText = sells.length > 0
    ? `목표 비중 대비 초과된 ${sells.slice(0, 3).map(formatAction).join(', ')}을 매도`
    : '추가 매도 없이';
  const buyText = buys.length > 0
    ? `미달된 ${buys.slice(0, 3).map(formatAction).join(', ')}을 매수`
    : '추가 매수 없이';

  return {
    text: `${sellText}하고, ${buyText}하여 비중을 맞추십시오.`,
    sells,
    buys,
  };
}

export function buildBenchmarkPerformance(strategy, periodDays) {
  if (!periodDays) return { name: '벤치마크', annualReturn: null, periodReturn: null };
  const benchmarkId = strategy?.benchmark || strategy?.id || '';
  const useBalanced = benchmarkId === 'balanced_60_40';
  const annualReturn = useBalanced ? 0.075 : 0.1;
  return {
    name: useBalanced ? '60/40 혼합 지수' : 'S&P 500 지수',
    annualReturn,
    periodReturn: (Math.pow(1 + annualReturn, periodDays / 365) - 1) * 100,
    isProxy: true,
  };
}

export function buildRetirementHorizonMetadata(portfolio = {}, now = new Date()) {
  const plan = portfolio.retirementPlan || {};
  const currentAge = Number(plan.currentAge) || null;
  const retirementAge = Number(plan.retirementAge) || null;
  const yearsToRetirement =
    currentAge != null && retirementAge != null
      ? Math.max(retirementAge - currentAge, 0)
      : null;
  const expectedRetirementYear =
    yearsToRetirement != null ? now.getFullYear() + yearsToRetirement : null;

  return {
    currentAge,
    retirementAge,
    yearsToRetirement,
    expectedRetirementYear,
    monthlyContribution: Number(plan.monthlyContribution) || 0,
    targetCagr: Number(plan.targetCagr) || null,
  };
}

export function buildReportModel({ portfolio, vix, now = new Date() }) {
  const strategy = getStrat(portfolio.strategy);
  const total = Number(portfolio.total) || 0;
  const annualExpRet = strategy?.annualRet?.base || 0.08;
  const holdings = buildLlmReadyHoldings(portfolio.holdings || [], total);
  const metrics = estimateRiskMetrics(holdings, RISK_DATA, annualExpRet);
  const vol = metrics.vol;
  const riskLevel = vol < 8 ? '보수적' : vol < 15 ? '중립적' : '공격적';
  const performance = buildPerformanceSummary(portfolio, holdings, total, annualExpRet, now);
  const benchmark = buildBenchmarkPerformance(strategy, performance.periodDays);
  const alpha = performance.periodReturn != null && benchmark.periodReturn != null
    ? performance.periodReturn - benchmark.periodReturn
    : null;
  const strategyReview = detectStrategyPortfolioMismatch(strategy, holdings, total);
  const rebalanceInstruction = generateRebalanceInstruction(holdings, total);
  const retirementHorizon = buildRetirementHorizonMetadata(portfolio, now);
  const z = getZone(vix);
  const managerInsight = generateInsight({
    vol,
    riskLevel,
    vix,
    holdings,
    performance,
    benchmark,
    alpha,
    strategyReview,
    rebalanceInstruction,
  });

  return {
    strategy,
    displayStrategyName: strategyReview.displayName || strategy?.name,
    accountType: portfolio.accountType,
    strategyReview,
    total,
    holdings,
    annualExpRet,
    metrics,
    riskLevel,
    performance,
    contributionByAssetClass: performance.contributionByAssetClass || {},
    strategyOverlay: portfolio.strategyOverlay || null,
    benchmark,
    alpha,
    rebalanceInstruction,
    retirementHorizon,
    z,
    managerInsight,
  };
}

// =============================================================================
// 매니저 인사이트 생성
// =============================================================================

/**
 * 시장 상황과 포트폴리오 상태를 기반으로 매니저 인사이트를 생성합니다.
 * 
 * @param {Object} params
 * @param {number} params.vol - 변동성 (%)
 * @param {string} params.riskLevel - 위험 수준
 * @param {number|null} params.vix - VIX 지수
 * @param {Array} params.holdings - 보유 종목 (cur, target 포함)
 * @returns {string}
 */
export function generateInsight({
  vol,
  riskLevel,
  vix,
  holdings,
  performance = {},
  benchmark = {},
  alpha = null,
  strategyReview = {},
  rebalanceInstruction = null,
}) {
  let text = `현재 포트폴리오는 변동성 ${fmtP(vol)} 수준의 '${riskLevel}' 전략을 유지하고 있습니다. `;
  
  if (vix && vix > 25) {
    text += `VIX 지수가 ${vix?.toFixed(1) || "…"}로 시장 불안정성이 높으므로, 공격적인 비중 확대보다는 방어적인 포지션 유지를 권장합니다. `;
  } else {
    text += `VIX 지수가 ${vix?.toFixed(1) || "…"}로 안정적인 흐름을 보이고 있어, 전략 기준에 따른 정기 리밸런싱이 유효한 시점입니다. `;
  }
  
  if (strategyReview?.warning) {
    text += `${strategyReview.warning} `;
  }

  if (rebalanceInstruction?.text) {
    text += `${rebalanceInstruction.text} `;
  } else {
    const driftItems = holdings.filter(h => Math.abs((h.cur || 0) - (h.target || 0)) >= 5);
    if (driftItems.length > 0) {
      text += `특히 ${driftItems.map(h => holdingLabel(h)).join(", ")}의 비중 이탈이 확인됩니다. `;
    }
  }

  if (performance?.periodReturn != null && benchmark?.periodReturn != null) {
    text += `동일 기간 ${benchmark.name} 대비 알파는 ${formatPercentValue(alpha)}입니다. `;
  }
  
  return text;
}

// =============================================================================
// PDF용 HTML 생성
// =============================================================================

/**
 * 전문 보고서 HTML 문자열 생성
 * 산식/기간/결측 경고/데이터 출처를 명시적으로 포함합니다.
 * 
 * @param {Object} params
 * @param {Object} params.portfolio - 포트폴리오 상태
 * @param {number|null} params.vix - VIX
 * @param {string} params.vixSource - VIX 출처
 * @param {string|null} params.vixUpdatedAt - VIX 갱신 시각
 * @param {string|null} params.vixError - VIX 에러
 * @param {Object|null} params.dataMeta - MetricMeta (데이터 신뢰도)
 * @returns {string} HTML 문자열
 */
export function generateReportHTML({ portfolio, vix, vixSource, vixUpdatedAt, vixError, dataMeta }) {
  const s = getStrat(portfolio.strategy);
  const now = new Date();
  const month = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, "0")}월`;
  const total = portfolio.total;
  const holdings = portfolio.holdings.map(h => ({
    ...h,
    cur: total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0
  }));

  const annualExpRet = s?.annualRet?.base || 0.08;
  const metrics = estimateRiskMetrics(holdings, RISK_DATA, annualExpRet);
  const sharpe = metrics.sharpe;
  const vol = metrics.vol;
  const riskLevel = vol < 8 ? "보수적" : vol < 15 ? "중립적" : "공격적";
  const z = getZone(vix);
  const managerInsight = generateInsight({ vol, riskLevel, vix, holdings });

  const tagWeights = holdings.reduce((acc, h) => {
    const tag = buildAssetClassTag(h);
    acc[tag] = (acc[tag] || 0) + (Number(h.cur) || 0);
    return acc;
  }, {});

  const chartHTML = generateDonutSVG(tagWeights);

  // 결측 경고 수집
  const warnings = [];
  if (vixError) warnings.push(`VIX 데이터 오류: ${vixError} (캐시 데이터 사용 중)`);
  if (dataMeta?.confidenceGrade === 'C') warnings.push(`데이터 신뢰등급 C — 갱신 지연 또는 결측 가능성 있음`);
  if (metrics.calcMode === 'estimated') warnings.push(`리스크 지표는 추정치 기반입니다 (2단계에서 실현 데이터 교체 예정)`);

  const warningsHTML = warnings.length > 0 
    ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin:20px 0">
        <strong style="color:#856404;font-size:13px">⚠️ 주의사항</strong>
        <ul style="margin:8px 0 0 16px;padding:0;font-size:12px;color:#856404">${warnings.map(w => `<li>${w}</li>`).join("")}</ul>
      </div>` 
    : '';

  const holdingsHTML = holdings
    .sort((a, b) => {
      const pA = getAssetPriority(buildAssetClassTag(a));
      const pB = getAssetPriority(buildAssetClassTag(b));
      if (pA !== pB) return pA - pB;
      return (a.etf || "").localeCompare(b.etf || "");
    })
    .map(h => {
      const tag = buildAssetClassTag(h);
      const diff = (h.cur || 0) - (h.target || 0);
      const pnl = h.costAmt > 0 ? ((h.amt - h.costAmt) / h.costAmt * 100).toFixed(1) : "-";
      return `<tr>
        <td style="color:#666">${tag}</td>
        <td style="font-weight:700">${h.etf}</td>
        <td>${h.cur}%</td><td>${h.target}%</td>
        <td style="color:${Math.abs(diff) >= 5 ? (diff > 0 ? "#d13131" : "#185fa5") : "#333"}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p</td>
        <td>${fmt(h.amt)}원</td>
        <td style="color:${pnl !== "-" && parseFloat(pnl) < 0 ? "#d13131" : "#28a745"}">${pnl !== "-" ? (pnl >= 0 ? "+" : "") + pnl + "%" : "-"}</td>
      </tr>`;
    }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Pension Strategy Monthly Report</title>
  <style>
    body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #185fa5; font-size: 28px; border-bottom: 3px solid #185fa5; padding-bottom: 10px; margin-bottom: 30px; }
    h2 { color: #333; font-size: 20px; margin-top: 40px; border-left: 5px solid #185fa5; padding-left: 12px; }
    h3 { font-size: 16px; margin-top: 25px; color: #555; }
    .kpi-container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 25px 0; }
    .kpi-card { background: #f8f9fa; border: 1px solid #eee; padding: 15px; border-radius: 12px; }
    .kpi-label { font-size: 13px; color: #888; margin-bottom: 4px; }
    .kpi-value { font-size: 20px; font-weight: 800; color: #185fa5; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
    th { background: #f1f3f5; padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057; }
    td { padding: 10px; border-bottom: 1px solid #eee; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <h1>연금 포트폴리오 월간 리포트 (${dateStr})</h1>
  
  <div class="kpi-container">
    <div class="kpi-card"><div class="kpi-label">총 자산</div><div class="kpi-value">${fmt(metrics.totalAmt)}원</div></div>
    <div class="kpi-card"><div class="kpi-label">누적 수익률</div><div class="kpi-value" style="color:${metrics.pnl >= 0 ? "#28a745" : "#d13131"}">${(metrics.pnlPct || 0).toFixed(1)}% (${fmt(metrics.pnl)}원)</div></div>
  </div>

  ${warningsHTML}

  <h2>1. 시장 국면 및 전략 진단</h2>
  <div style="background:#f8f9fa; padding:15px; border-radius:12px; border:1px solid #eee;">
    <p style="margin:0; font-size:14px;">현재 선택된 전략: <strong>${s.name}</strong><br/>
    시장 국면: <strong>VIX ${vix?.toFixed(1) || "…"} (${z.lbl})</strong> - ${z.desc}</p>
  </div>

  <h2>2. 자산 배분 비중 요약</h2>
  ${chartHTML}

  <h2>3. 자산 클래스별 상세 분석</h2>
  <table><thead><tr><th>자산군 태그</th><th>자산명</th><th>현재 비중</th><th>목표 비중</th><th>편차</th><th>평가금액</th><th>수익률</th></tr></thead>
  <tbody>${holdingsHTML}</tbody></table>
  
  <div class="footer">본 보고서는 연금 자산 시뮬레이션 기반이며 최종 투자 결정은 투자자의 판단에 따릅니다.</div>
</body></html>`;
}

export function generateLlmReadyReportHTML({
  portfolio,
  vix,
  vixSource,
  vixUpdatedAt,
  vixError,
  dataMeta,
  benchmarkOverride = null,
  overlayMeta = null,
}) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const model = buildReportModel({ portfolio, vix, now });
  const effectiveBenchmark = benchmarkOverride || model.benchmark;
  const effectiveAlpha =
    model.performance.periodReturn != null && effectiveBenchmark?.periodReturn != null
      ? model.performance.periodReturn - effectiveBenchmark.periodReturn
      : model.alpha;
  const effectiveOverlay = overlayMeta || model.strategyOverlay;
  const warnings = [
    vixError ? `VIX warning: ${vixError}` : null,
    model.performance.returnAnomalyNote,
    model.strategyReview.warning,
    effectiveBenchmark?.isProxy ? `${effectiveBenchmark.name} is using a proxy benchmark.` : null,
  ].filter(Boolean);

  const retirement = model.retirementHorizon;
  const retirementText = retirement.currentAge
    ? `Current age ${retirement.currentAge}, expected retirement year ${retirement.expectedRetirementYear}, avg monthly contribution ${fmt(retirement.monthlyContribution)}, target CAGR ${retirement.targetCagr != null ? fmtR(retirement.targetCagr) : 'needs estimate'}`
    : 'Retirement roadmap inputs are incomplete.';

  const overlayText = effectiveOverlay?.overlaySummary
    ? `Target equity ${effectiveOverlay.targetEquity ?? 'N/A'}%, Vol Scale ${effectiveOverlay.volScale ?? 'N/A'}x, CAPE ${effectiveOverlay.overlaySummary.cape ?? 'N/A'}, HY Spread ${effectiveOverlay.overlaySummary.creditSpread ?? 'N/A'}, 10Y-2Y ${effectiveOverlay.overlaySummary.yieldSpread ?? 'N/A'}, VIX ${effectiveOverlay.overlaySummary.vix ?? 'N/A'}`
    : 'No market overlay applied';

  const tagWeights = model.holdings.reduce((acc, holding) => {
    acc[holding.assetClassTag] = (acc[holding.assetClassTag] || 0) + (Number(holding.cur) || 0);
    return acc;
  }, {});
  const chartHTML = generateDonutSVG(tagWeights);

  const holdingsRows = model.holdings
    .map((holding) => `
      <tr>
        <td style="color:#666">${escapeHtml(holding.assetClassTag)}</td>
        <td style="font-weight:700">${escapeHtml(holding.displayName)}</td>
        <td>${holding.cur}%</td>
        <td>${holding.target}%</td>
        <td style="color:${Math.abs(holding.diff) >= 5 ? (holding.diff > 0 ? '#d13131' : '#185fa5') : '#333'}">${holding.diff >= 0 ? '+' : ''}${holding.diff.toFixed(1)}%p</td>
        <td>${fmt(holding.amt)} KRW</td>
        <td style="color:${holding.pnlPct != null && holding.pnlPct < 0 ? '#d13131' : '#28a745'}">${holding.pnlPct != null ? formatPercentValue(holding.pnlPct) : '-'}</td>
      </tr>
    `)
    .join('');

  const contributionRows = Object.entries(model.contributionByAssetClass || {})
    .map(([assetClass, value]) => `
      <tr>
        <td>${escapeHtml(assetClass)}</td>
        <td style="color:${value < 0 ? '#d13131' : '#28a745'}">${value >= 0 ? '+' : '-'}${fmt(Math.abs(value))} KRW</td>
      </tr>
    `)
    .join('');

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>${month} Pension Report</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;line-height:1.7;padding:40px;max-width:880px;margin:0 auto;color:#333}
        header{border-bottom:3px solid #185fa5;padding-bottom:15px;margin-bottom:25px}
        h2{font-size:22px;margin:0;color:#185fa5}
        h3{font-size:15px;margin:25px 0 10px;border-left:4px solid #185fa5;padding-left:10px;color:#111}
        table{width:100%;border-collapse:collapse;font-size:12px;margin:15px 0}
        th{background:#f8f9fa;text-align:left;padding:8px;border-bottom:2px solid #dee2e6}
        td{padding:8px;border-bottom:1px solid #eee;vertical-align:top}
        .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
        .metric-box{background:#f8f9fa;padding:12px;border-radius:8px;text-align:center}
        .metric-val{font-size:16px;font-weight:700;color:#185fa5}
        .insight-card{background:#eef6ff;padding:15px;border-radius:10px;border-left:5px solid #185fa5}
        .warning{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin:14px 0}
        .meta-card{background:#f8f9fa;border-radius:8px;padding:12px;font-size:12px}
        footer{font-size:11px;color:#888;text-align:center;margin-top:30px;border-top:1px solid #eee;padding-top:15px}
      </style>
    </head>
    <body>
      <header>
        <h2>${month} Personal Pension Report</h2>
        <p style="margin:5px 0 0">Generated at: ${now.toLocaleString('ko-KR')}</p>
        <p style="margin:3px 0 0;font-size:11px;color:#888">VIX source: ${escapeHtml(vixSource || 'Unknown')}${vixUpdatedAt ? ` (${new Date(vixUpdatedAt).toLocaleString('ko-KR')})` : ''}</p>
      </header>

      ${warnings.length > 0 ? `<div class="warning"><strong>Data and interpretation notes</strong><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}

      <div class="metrics">
        <div class="metric-box"><div>Total Value</div><div class="metric-val">${fmt(model.total)} KRW</div></div>
        <div class="metric-box"><div>Period Return</div><div class="metric-val">${formatPercentValue(model.performance.periodReturn)}</div></div>
        <div class="metric-box"><div>${escapeHtml(effectiveBenchmark?.name || model.benchmark.name)}</div><div class="metric-val">${formatPercentValue(effectiveBenchmark?.periodReturn)}</div></div>
        <div class="metric-box"><div>Alpha</div><div class="metric-val" style="color:${effectiveAlpha != null && effectiveAlpha < 0 ? '#d13131' : '#28a745'}">${formatPercentValue(effectiveAlpha)}</div></div>
      </div>

      <h3>1. Performance Summary</h3>
      <table>
        <tbody>
          <tr><th>Cost Basis</th><td>${model.performance.costTotal > 0 ? `${fmt(model.performance.costTotal)} KRW` : 'Cost basis required'}</td><th>Unrealized PnL</th><td>${model.performance.unrealizedPnl != null ? `${model.performance.unrealizedPnl >= 0 ? '+' : '-'}${fmt(Math.abs(model.performance.unrealizedPnl))} KRW (${formatPercentValue(model.performance.unrealizedReturn)})` : 'Cost basis required'}</td></tr>
          <tr><th>Period Return</th><td>${model.performance.hasHistory ? `${model.performance.firstDate} onward ${formatPercentValue(model.performance.periodReturn)}` : 'Insufficient history'}</td><th>Annualized Return</th><td>${formatPercentValue(model.performance.annualizedReturn)}</td></tr>
          <tr><th>Benchmark</th><td>${escapeHtml(effectiveBenchmark?.name || model.benchmark.name)} ${formatPercentValue(effectiveBenchmark?.periodReturn)}</td><th>Excess Return</th><td>${formatPercentValue(effectiveAlpha)}</td></tr>
          <tr><th>Rolling Gap</th><td>1Y ${formatPercentValue(model.performance.benchmarkGap1Y)} / 3Y ${formatPercentValue(model.performance.benchmarkGap3Y)}</td><th>Benchmark Source</th><td>${escapeHtml(effectiveBenchmark?.isProxy ? 'proxy' : 'actual')}</td></tr>
        </tbody>
      </table>

      <h3>2. Manager Insight</h3>
      <div class="insight-card">${escapeHtml(model.managerInsight)}</div>

      <h3>3. Strategy and Risk Meta</h3>
      <div class="meta-card">
        <div>Strategy: <strong>${escapeHtml(model.displayStrategyName)}</strong></div>
        <div>Account Type: <strong>${escapeHtml(portfolio.accountType)}</strong></div>
        <div>Market Regime: <strong>VIX ${vix?.toFixed(1) || 'N/A'} (${escapeHtml(model.z.lbl)})</strong> - ${escapeHtml(model.z.desc)}</div>
        <div>Overlay: ${escapeHtml(overlayText)}</div>
        ${dataMeta ? `<div>Data Meta: ${escapeHtml(JSON.stringify(dataMeta))}</div>` : ''}
      </div>

      <h3>4. Allocation Summary</h3>
      ${chartHTML}

      <h3>5. Holdings Detail</h3>
      <table>
        <thead>
          <tr><th>Asset Class</th><th>자산명(티커)</th><th>Current Wt</th><th>Target Wt</th><th>Drift</th><th>Market Value</th><th>PnL</th></tr>
        </thead>
        <tbody>${holdingsRows}</tbody>
      </table>

      ${contributionRows ? `<h3>6. Contribution by Asset Class</h3><table><thead><tr><th>Asset Class</th><th>Contribution</th></tr></thead><tbody>${contributionRows}</tbody></table>` : ''}

      <h3>7. Retirement and LLM Meta</h3>
      <div class="meta-card">
        <div>${escapeHtml(retirementText)}</div>
        <div style="margin-top:8px">accountType=${escapeHtml(portfolio.accountType)}, strategy=${escapeHtml(model.displayStrategyName)}, benchmark=${escapeHtml(effectiveBenchmark?.name || model.benchmark.name)}, benchmarkSource=${escapeHtml(effectiveBenchmark?.isProxy ? 'proxy' : 'actual')}, vix=${vix ?? 'null'}, overlay=${escapeHtml(overlayText)}</div>
      </div>

      <footer>This report is a planning aid only. Final investment decisions and order execution remain the investor's responsibility.</footer>
    </body>
  </html>`;
}

/**
 * 보고서 출력 (새 창 → 인쇄)
 * @param {string} html - 보고서 HTML
 */
export function printReport(html) {
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}
