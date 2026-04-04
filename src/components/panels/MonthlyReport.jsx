import React from "react";
import { Card, Btn, Badge } from "../common/index.jsx";
import { fmt, fmtP, fmtR } from "../../utils/formatters.js";
import { getStrat, getZone } from "../../utils/helpers.js";
import { RISK_DATA } from "../../constants/index.js";
import { estimateRiskMetrics } from "../../utils/calculators.js";

export default function MonthlyReport({ portfolio, vix, vixSource, vixUpdatedAt }) {
  const s = getStrat(portfolio.strategy);
  const now = new Date();
  const month = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, "0")}월`;
  const total = portfolio.total;
  const holdings = portfolio.holdings.map(h => ({ ...h, cur: total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0 }));
  
  // 위험 지표 계산
  const annualExpRet = s?.annualRet?.base || 0.08;
  const metrics = estimateRiskMetrics(holdings, RISK_DATA, annualExpRet);
  const sharpe = metrics.sharpe;
  const vol = metrics.vol;
  const riskLevel = vol < 8 ? "보수적" : vol < 15 ? "중립적" : "공격적";

  // 매니저 인사이트 생성 로직
  const z = getZone(vix);
  const momentumMode = portfolio.momentumMode || "";
  
  const generateInsight = () => {
    let text = `현재 포트폴리오는 변동성 ${fmtP(metrics.vol * 100)} 수준의 '${riskLevel}' 전략을 유지하고 있습니다. `;
    if (vix && vix > 25) {
      text += `VIX 지수가 ${vix?.toFixed(1) || "…"}로 시장 불안정성이 높으므로, 공격적인 비중 확대보다는 방어적인 포지션 유지를 권장합니다. `;
    } else {
      text += `VIX 지수가 ${vix?.toFixed(1) || "…"}로 안정적인 흐름을 보이고 있어, 전략 기준에 따른 정기 리밸런싱이 유효한 시점입니다. `;
    }
    const driftItems = holdings.filter(h => Math.abs(h.cur - h.target) >= 5);
    if (driftItems.length > 0) {
      text += `특히 ${driftItems.map(h => h.etf).join(", ")}의 비중 이탈이 확인되므로 리밸런싱을 통한 비중 복구가 필요합니다.`;
    }
    return text;
  };

  const managerInsight = generateInsight();

  function print() {
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${month} 전문 자산관리 보고서</title>
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
    hr{border:0;border-top:1px solid #eee;margin:30px 0}
    footer{font-size:11px;color:#888;text-align:center}</style></head><body>
    <header>
      <h2>${month} 전문 연금 실무 보고서</h2>
      <p style="margin:5px 0 0">수신: 연금 투자자 귀하 | 작성: 연금 포트폴리오 파일럿 Pro</p>
    </header>
    
    <div class="metrics">
      <div class="metric-box"><div style="font-size:11px;color:#666">총 자산</div><div class="metric-val">${fmt(total)}원</div></div>
      <div class="metric-box"><div style="font-size:11px;color:#666">기대 수익률</div><div class="metric-val">${fmtR(annualExpRet)}</div></div>
      <div class="metric-box"><div style="font-size:11px;color:#666">기대 변동성</div><div class="metric-val">${fmtP(metrics.vol * 100)}</div></div>
      <div class="metric-box"><div style="font-size:11px;color:#666">샤프 지수</div><div class="metric-val">${sharpe.toFixed(2)}</div></div>
    </div>

    <h3>1. 매니저 인사이트 (Manager's Commentary)</h3>
    <div class="insight-card">${managerInsight}</div>

    <h3>2. 전략 및 리스크 현황</h3>
    <p>적용 전략: <strong>${s.name}</strong> (${s.level}) / 계좌 유형: <strong>${portfolio.accountType} (위험자산 한도 70%)</strong><br>
    시장 국면: <strong>VIX ${vix?.toFixed(1) || "…"} (${z.lbl})</strong> - ${z.desc}<br>
    <small style="color:#666">데이터 출처: ${vixSource} (${vixUpdatedAt ? new Date(vixUpdatedAt).toLocaleString() : "—"})</small></p>

    <h3>3. 자산 클래스별 상세 분석</h3>
    <table><thead><tr><th>자산명</th><th>현재 비중</th><th>목표 비중</th><th>편차</th><th>평가금액</th><th>수익률</th></tr></thead>
    <tbody>${holdings.map(h => { 
      const diff = h.cur - h.target; 
      const pnl = h.costAmt > 0 ? ((h.amt - h.costAmt) / h.costAmt * 100).toFixed(1) : "-"; 
      return `<tr><td>${h.etf}</td><td>${h.cur}%</td><td>${h.target}%</td><td style="color:${Math.abs(diff) >= 5 ? (diff > 0 ? "#d13131" : "#185fa5") : "#333"}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p</td><td>${fmt(h.amt)}원</td><td style="color:${pnl !== "-" && parseFloat(pnl) < 0 ? "#d13131" : "#28a745"}">${pnl !== "-" ? (pnl >= 0 ? "+" : "") + pnl + "%" : "-"}</td></tr>`; 
    }).join("")}</tbody></table>

    <h3>4. 은퇴 준비도 진단</h3>
    <p>현재 전략 유지 시 ${portfolio.lastRebalDate} 이후 안정적인 흐름을 보이고 있으며, ${sharpe > 0.5 ? "효율적인 위험 배분이 이루어지고 있습니다." : "보다 공격적인 자산 배분 테마로의 전환을 고려할 수 있는 시점입니다."}</p>
    
    <hr>
    <footer>본 보고서는 연금 자산 시뮬레이션 기반이며 최종 투자 결정은 투자자의 판단에 따릅니다.</footer>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  return (
    <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1.5rem" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-main)" }}>🥇 전문 자산관리 실무 보고서</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>기관 투자자 수준의 리스크 지표 및 인공지능 매니저 인사이트 포함</div>
          </div>
          <Btn danger onClick={print} style={{ padding: "8px 24px" }}>보고서 출력 (PDF)</Btn>
        </div>
        
        <div style={{ background: "var(--bg-main)", borderRadius: "var(--radius-md)", padding: "1.5rem", fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
            <Badge bg="#eef6ff" c="#185fa5">Manager's Insight</Badge>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{now.toLocaleString("ko-KR")} 기준</span>
          </div>
          <div style={{ fontStyle: "italic", color: "var(--text-main)", marginBottom: "1.5rem", borderLeft: "3px solid #185fa5", paddingLeft: 12 }}>
            "{managerInsight}"
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>포트폴리오 프로필</div>
              <div style={{ color: "var(--text-dim)" }}>
                · 전략 유형: {s.name} ({riskLevel})<br />
                · 기대 변동성: {fmtP(metrics.vol * 100)} (연간)<br />
                · 샤프 지수: {sharpe.toFixed(2)} (위험 대비 수익)
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>주요 관리 포인트</div>
              <div style={{ color: "var(--text-dim)" }}>
                · VIX 국면: {z.lbl} ({z.mode})<br />
                · KIS 데이터: {vixSource} ({vixUpdatedAt ? new Date(vixUpdatedAt).toLocaleTimeString() : "—"})<br />
                · IRP 위험한도: {holdings.filter(h => ["미국주식", "선진국주식", "신흥국주식", "국내주식", "금", "원자재", "부동산리츠"].includes(h.cls)).reduce((s, h) => s + h.cur, 0).toFixed(1)}% / 70%<br />
                · 리밸런싱 필요도: {holdings.some(h => Math.abs(h.cur - h.target) >= 5) ? "높음 (이탈 확인)" : "낮음 (안정)"}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
