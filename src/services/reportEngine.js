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

export function buildAssetClassTag(holding = {}) {
  const cls = String(holding.cls || holding.assetClass || '');
  const name = `${holding.etf || ''} ${holding.name || ''}`;
  const text = `${cls} ${name}`;

  if (/현금|MMF|CASH/i.test(text)) return '[안전자산-현금/MMF]';
  if (/단기채|국고채|국내채권|중기채|장기채|글로벌채권|채권|bond/i.test(text)) return '[안전자산-채권]';
  if (/금|gold/i.test(text)) return '[대체자산-금]';
  if (/리츠|reit/i.test(text)) return '[대체자산-리츠]';
  if (/원자재|commodity/i.test(text)) return '[대체자산-원자재]';
  if (/미국주식|S&P|나스닥|미국/i.test(text)) return '[미국 주식]';
  if (/국내주식|코스피|코스닥|KRX/i.test(text)) return '[국내 주식]';
  if (/선진국/i.test(text)) return '[선진국 주식]';
  if (/신흥국/i.test(text)) return '[신흥국 주식]';
  return `[${cls || '기타 자산'}]`;
}

export function buildLlmReadyHoldings(holdings = [], total = 0) {
  return holdings.map((holding) => {
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
  const strategyId = strategy?.id || '';
  const useBalanced = ['60_40', 'permanent', 'permanent_global', 'allseason', 'allweather'].includes(strategyId);
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
    strategyReview,
    total,
    holdings,
    annualExpRet,
    metrics,
    riskLevel,
    performance,
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

  // 결측 경고 수집
  const warnings = [];
  if (vixError) warnings.push(`VIX 데이터 오류: ${vixError} (캐시 데이터 사용 중)`);
  if (dataMeta?.confidenceGrade === 'C') warnings.push(`데이터 신뢰등급 C — 갱신 지연 또는 결측 가능성 있음`);
  if (metrics.calcMode === 'estimated') warnings.push(`리스크 지표는 추정치 기반입니다 (2단계에서 실현 데이터 교체 예정)`);

  const holdingsHTML = holdings.map(h => {
    const diff = (h.cur || 0) - (h.target || 0);
    const pnl = h.costAmt > 0 ? ((h.amt - h.costAmt) / h.costAmt * 100).toFixed(1) : "-";
    return `<tr>
      <td>${h.etf}</td><td>${h.cur}%</td><td>${h.target}%</td>
      <td style="color:${Math.abs(diff) >= 5 ? (diff > 0 ? "#d13131" : "#185fa5") : "#333"}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p</td>
      <td>${fmt(h.amt)}원</td>
      <td style="color:${pnl !== "-" && parseFloat(pnl) < 0 ? "#d13131" : "#28a745"}">${pnl !== "-" ? (pnl >= 0 ? "+" : "") + pnl + "%" : "-"}</td>
    </tr>`;
  }).join("");

  const warningsHTML = warnings.length > 0 
    ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin:20px 0">
         <strong>⚠ 데이터 주의사항</strong><ul style="margin:8px 0 0;padding-left:20px">
         ${warnings.map(w => `<li>${w}</li>`).join("")}
         </ul></div>` 
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${month} 전문 자산관리 보고서</title>
    <style>body{font-family:sans-serif;font-size:13px;line-height:1.7;padding:40px;max-width:800px;margin:0 auto;color:#333}
    header{border-bottom:3px solid #185fa5;padding-bottom:15px;margin-bottom:25px}
    h2{font-size:22px;margin:0;color:#185fa5}h3{font-size:15px;margin:25px 0 10px;border-left:4px solid #185fa5;padding-left:10px;color:#111}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:15px 0}
    th{background:#f8f9fa;text-align:left;padding:8px;border-bottom:2px solid #dee2e6}
    td{padding:8px;border-bottom:1px solid #eee}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:20px 0}
    .metric-box{background:#f8f9fa;padding:12px;border-radius:8px;text-align:center}
    .metric-val{font-size:16px;font-weight:700;color:#185fa5}
    .insight-card{background:#eef6ff;padding:15px;border-radius:10px;border-left:5px solid #185fa5;font-style:italic}
    .calc-note{background:#f8f9fa;border-radius:6px;padding:10px;font-size:11px;color:#666;margin:10px 0}
    hr{border:0;border-top:1px solid #eee;margin:30px 0}
    footer{font-size:11px;color:#888;text-align:center}</style></head><body>
    <header>
      <h2>${month} 전문 연금 실무 보고서</h2>
      <p style="margin:5px 0 0">수신: 연금 투자자 귀하 | 작성: 연금 포트폴리오 파일럿 Pro</p>
      <p style="margin:3px 0 0;font-size:11px;color:#888">생성 시각: ${now.toLocaleString('ko-KR')} | 신뢰등급: ${dataMeta?.confidenceGrade || '—'}</p>
    </header>
    
    ${warningsHTML}
    
    <div class="metrics">
      <div class="metric-box"><div style="font-size:11px;color:#666">총 자산</div><div class="metric-val">${fmt(total)}원</div></div>
      <div class="metric-box"><div style="font-size:11px;color:#666">기대 수익률</div><div class="metric-val">${fmtR(annualExpRet)}</div></div>
      <div class="metric-box"><div style="font-size:11px;color:#666">기대 변동성</div><div class="metric-val">${fmtP(vol)}</div></div>
      <div class="metric-box"><div style="font-size:11px;color:#666">샤프 지수</div><div class="metric-val">${sharpe.toFixed(2)}</div></div>
    </div>

    <div class="calc-note">
      📐 <strong>산식 근거</strong>: 변동성 = Σ(자산비중 × 자산별σ) | 샤프 = (기대수익률 - 무위험이자 3%) / 변동성 | 계산방식: ${metrics.calcMode === 'estimated' ? '추정(자산군 평균)' : '실현(일일수익률)'}
    </div>

    <h3>1. 매니저 인사이트</h3>
    <div class="insight-card">${managerInsight}</div>

    <h3>2. 전략 및 리스크 현황</h3>
    <p>적용 전략: <strong>${s.name}</strong> (${s.level}) / 계좌 유형: <strong>${portfolio.accountType}</strong><br>
    시장 국면: <strong>VIX ${vix?.toFixed(1) || "…"} (${z.lbl})</strong> - ${z.desc}</p>

    <h3>3. 자산 클래스별 상세 분석</h3>
    <table><thead><tr><th>자산명</th><th>현재 비중</th><th>목표 비중</th><th>편차</th><th>평가금액</th><th>수익률</th></tr></thead>
    <tbody>${holdingsHTML}</tbody></table>

    <h3>4. 은퇴 준비도 진단</h3>
    <p>${sharpe > 0.5 ? "효율적인 위험 배분이 이루어지고 있습니다." : "보다 공격적인 자산 배분 테마로의 전환을 고려할 수 있는 시점입니다."}</p>
    
    <hr>
    <footer>본 보고서는 연금 자산 시뮬레이션 기반이며 최종 투자 결정은 투자자의 판단에 따릅니다.</footer>
  </body></html>`;
}

export function generateLlmReadyReportHTML({ portfolio, vix, vixSource, vixUpdatedAt, vixError, dataMeta }) {
  const now = new Date();
  const month = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월`;
  const model = buildReportModel({ portfolio, vix, now });
  const accountConstraint = portfolio.accountType === 'IRP' ? ' (위험자산 한도 70%)' : '';
  const warnings = [
    vixError ? `VIX 데이터 오류: ${vixError}` : null,
    model.performance.returnAnomalyNote,
    model.strategyReview.warning,
    model.benchmark.isProxy ? `${model.benchmark.name} 성과는 동일 기간 프록시 수익률입니다.` : null,
  ].filter(Boolean);
  const retirement = model.retirementHorizon;
  const retirementText = retirement.currentAge
    ? `현재 나이 ${retirement.currentAge}세, 예상 은퇴연도 ${retirement.expectedRetirementYear}년, 월평균 적립액 ${fmt(retirement.monthlyContribution)}원, 필요 CAGR ${retirement.targetCagr != null ? fmtR(retirement.targetCagr) : '산정 필요'}`
    : '은퇴 로드맵 입력값이 없어 투자 시계 데이터 산정이 필요합니다.';

  const holdingsRows = model.holdings.map(holding => `
    <tr>
      <td>${escapeHtml(holding.displayName)}</td>
      <td>${escapeHtml(holding.assetClassTag)}</td>
      <td>${holding.cur}%</td>
      <td>${holding.target}%</td>
      <td style="color:${Math.abs(holding.diff) >= 5 ? (holding.diff > 0 ? '#d13131' : '#185fa5') : '#333'}">${holding.diff >= 0 ? '+' : ''}${holding.diff.toFixed(1)}%p</td>
      <td>${fmt(holding.amt)}원</td>
      <td style="color:${holding.pnlPct != null && holding.pnlPct < 0 ? '#d13131' : '#28a745'}">${holding.pnlPct != null ? formatPercentValue(holding.pnlPct) : '-'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${month} 연금 운용 보고서</title>
    <style>
      body{font-family:sans-serif;font-size:13px;line-height:1.7;padding:40px;max-width:880px;margin:0 auto;color:#333}
      header{border-bottom:3px solid #185fa5;padding-bottom:15px;margin-bottom:25px}
      h2{font-size:22px;margin:0;color:#185fa5}h3{font-size:15px;margin:25px 0 10px;border-left:4px solid #185fa5;padding-left:10px;color:#111}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:15px 0}
      th{background:#f8f9fa;text-align:left;padding:8px;border-bottom:2px solid #dee2e6}
      td{padding:8px;border-bottom:1px solid #eee;vertical-align:top}
      .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
      .metric-box{background:#f8f9fa;padding:12px;border-radius:8px;text-align:center}
      .metric-val{font-size:16px;font-weight:700;color:#185fa5}
      .insight-card{background:#eef6ff;padding:15px;border-radius:10px;border-left:5px solid #185fa5}
      .warning{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin:14px 0}
      .llm-meta{background:#f8f9fa;border-radius:8px;padding:12px;font-size:12px}
      footer{font-size:11px;color:#888;text-align:center;margin-top:30px;border-top:1px solid #eee;padding-top:15px}
    </style></head><body>
    <header>
      <h2>${month} 전문 연금 운용 보고서</h2>
      <p style="margin:5px 0 0">수신: 연금 투자자 귀하 | 작성: 연금 포트폴리오 파일럿 Pro</p>
      <p style="margin:3px 0 0;font-size:11px;color:#888">생성 시각: ${now.toLocaleString('ko-KR')} | VIX 출처: ${escapeHtml(vixSource || '—')} ${vixUpdatedAt ? `(${new Date(vixUpdatedAt).toLocaleString('ko-KR')})` : ''}</p>
    </header>

    ${warnings.length > 0 ? `<div class="warning"><strong>데이터/전략 주의사항</strong><ul>${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}

    <div class="metrics">
      <div class="metric-box"><div>총 자산</div><div class="metric-val">${fmt(model.total)}원</div></div>
      <div class="metric-box"><div>스냅샷 성과</div><div class="metric-val">${formatPercentValue(model.performance.periodReturn)}</div></div>
      <div class="metric-box"><div>${escapeHtml(model.benchmark.name)}</div><div class="metric-val">${formatPercentValue(model.benchmark.periodReturn)}</div></div>
      <div class="metric-box"><div>Alpha</div><div class="metric-val" style="color:${model.alpha != null && model.alpha < 0 ? '#d13131' : '#28a745'}">${formatPercentValue(model.alpha)}</div></div>
    </div>

    <h3>1. 개인 성과 요약</h3>
    <table><tbody>
      <tr><th>원가 합계</th><td>${model.performance.costTotal > 0 ? `${fmt(model.performance.costTotal)}원` : '원가 입력 필요'}</td><th>평가손익</th><td>${model.performance.unrealizedPnl != null ? `${model.performance.unrealizedPnl >= 0 ? '+' : '-'}${fmt(Math.abs(model.performance.unrealizedPnl))}원 (${formatPercentValue(model.performance.unrealizedReturn)})` : '원가 입력 필요'}</td></tr>
      <tr><th>스냅샷 기준 성과</th><td>${model.performance.hasHistory ? `${model.performance.firstDate} 대비 ${formatPercentValue(model.performance.periodReturn)}` : '정상 스냅샷 부족'}</td><th>연환산 단순 성과</th><td>${formatPercentValue(model.performance.annualizedReturn)}</td></tr>
      <tr><th>벤치마크</th><td>${escapeHtml(model.benchmark.name)} ${formatPercentValue(model.benchmark.periodReturn)}</td><th>초과 성과</th><td>${formatPercentValue(model.alpha)}</td></tr>
    </tbody></table>

    <h3>2. 매니저 인사이트</h3>
    <div class="insight-card">${escapeHtml(model.managerInsight)}</div>

    <h3>3. 전략 및 계좌 제약</h3>
    <p>표시 전략: <strong>${escapeHtml(model.displayStrategyName)}</strong>${model.strategyReview.mismatch ? ` <span style="color:#d13131">(원 선택 전략: ${escapeHtml(model.strategy.name)})</span>` : ''}<br>
    계좌 유형: <strong>${escapeHtml(portfolio.accountType)}${accountConstraint}</strong><br>
    시장 국면: <strong>VIX ${vix?.toFixed(1) || '…'} (${escapeHtml(model.z.lbl)})</strong> - ${escapeHtml(model.z.desc)}</p>

    <h3>4. 자산 상세 분석표</h3>
    <table><thead><tr><th>자산명(티커)</th><th>자산군 태그</th><th>현재 비중</th><th>목표 비중</th><th>편차</th><th>평가금액</th><th>수익률</th></tr></thead>
    <tbody>${holdingsRows}</tbody></table>

    <h3>5. 은퇴 준비도 진단 및 LLM 메타데이터</h3>
    <div class="llm-meta">
      ${escapeHtml(retirementText)}<br>
      보고서 해석용 메타데이터: accountType=${escapeHtml(portfolio.accountType)}, strategy=${escapeHtml(model.displayStrategyName)}, benchmark=${escapeHtml(model.benchmark.name)}, vix=${vix ?? 'null'}
    </div>

    <footer>본 보고서는 연금 자산 시뮬레이션 기반이며 최종 투자 결정은 투자자의 판단에 따릅니다.</footer>
    </body></html>`;
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
