import React, { useState } from "react";
import { Card, ST, Btn, ReasonBox } from "../common/index.jsx";
import { fmt } from "../../utils/formatters";

export default function AlertsPanel({ portfolio, onStopLossChange, onMddChange }) {
  const [slVal, setSlVal] = useState(portfolio.stopLoss || -20);
  const [mddVal, setMddVal] = useState(portfolio.mddLimit || -15);
  const total = portfolio.total || 0;

  const alerts = [];
  if (portfolio.mdd < portfolio.mddLimit)
    alerts.push({ type: "danger", title: `MDD ${portfolio.mdd.toFixed(1)}% — 제한선(${portfolio.mddLimit}%) 초과`, body: "추가 매수를 중단하고 방어 자산 비중을 우선 확보하세요." });

  portfolio.holdings.forEach(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    const diff = Math.round((cur - (h.target || 0)) * 10) / 10;
    if (Math.abs(diff) >= 7)
      alerts.push({ type: "warn", title: `${h.etf}: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p 이탈`, body: `현재 ${cur.toFixed(1)}% → 목표 ${(h.target || 0).toFixed(1)}%` });
    if (h.costAmt > 0) {
      const pnl = (h.amt - h.costAmt) / h.costAmt * 100;
      if (pnl < slVal)
        alerts.push({ type: "danger", title: `[손절] ${h.etf}: 수익률 ${pnl.toFixed(1)}%`, body: `손절 기준(${slVal}%) 초과 — 비중 축소 검토 필요. 현재 ${fmt(h.amt)}원 (원가 ${fmt(h.costAmt)}원)` });
    }
  });

  if (alerts.length === 0)
    alerts.push({ type: "ok", title: "현재 경고 없음", body: "모든 비중이 목표 범위 내에 있습니다." });

  return (
    <div>
      <Card>
        <ST>현재 경고 목록</ST>
        {alerts.map((a, i) => <ReasonBox key={i} {...a} />)}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card style={{ marginBottom: 0 }}>
          <ST>손절 기준 설정</ST>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: "1rem" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>자산 수익률이</span>
            <input type="number" value={slVal} min={-50} max={0} step={1}
              onChange={e => setSlVal(Number(e.target.value))}
              style={{ width: 66, textAlign: "right", padding: "5px 8px", border: "0.5px solid var(--border-glass)", borderRadius: "var(--radius-md)", fontSize: 13, background: "var(--bg-card)", color: "var(--text-main)", fontFamily: "var(--font-sans)" }} />
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>% 이하 시 경고</span>
          </div>
          <Btn danger sm onClick={() => onStopLossChange && onStopLossChange(slVal)}>저장</Btn>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.6 }}>
            원가 기록은 구글 시트 [종목 입력] F열에 입력해야 수익률 계산이 가능합니다.
          </div>
        </Card>

        <Card style={{ marginBottom: 0 }}>
          <ST>MDD 제한선 설정</ST>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: "1rem" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>포트폴리오 MDD</span>
            <input type="number" value={mddVal} min={-50} max={0} step={1}
              onChange={e => setMddVal(Number(e.target.value))}
              style={{ width: 66, textAlign: "right", padding: "5px 8px", border: "0.5px solid var(--border-glass)", borderRadius: "var(--radius-md)", fontSize: 13, background: "var(--bg-card)", color: "var(--text-main)", fontFamily: "var(--font-sans)" }} />
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>% 이하 시 경고</span>
          </div>
          <Btn sm onClick={() => onMddChange && onMddChange(mddVal)}>저장</Btn>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.6 }}>
            현재 MDD: <strong>{portfolio.mdd.toFixed(1)}%</strong> · 고점 대비 낙폭
          </div>
        </Card>
      </div>
    </div>
  );
}
