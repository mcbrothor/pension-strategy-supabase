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
export function generateInsight({ vol, riskLevel, vix, holdings }) {
  let text = `현재 포트폴리오는 변동성 ${fmtP(vol)} 수준의 '${riskLevel}' 전략을 유지하고 있습니다. `;
  
  if (vix && vix > 25) {
    text += `VIX 지수가 ${vix?.toFixed(1) || "…"}로 시장 불안정성이 높으므로, 공격적인 비중 확대보다는 방어적인 포지션 유지를 권장합니다. `;
  } else {
    text += `VIX 지수가 ${vix?.toFixed(1) || "…"}로 안정적인 흐름을 보이고 있어, 전략 기준에 따른 정기 리밸런싱이 유효한 시점입니다. `;
  }
  
  const driftItems = holdings.filter(h => Math.abs((h.cur || 0) - (h.target || 0)) >= 5);
  if (driftItems.length > 0) {
    text += `특히 ${driftItems.map(h => h.etf).join(", ")}의 비중 이탈이 확인되므로 리밸런싱을 통한 비중 복구가 필요합니다.`;
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
