import React from "react";
import { Card, ST, Badge, Btn, MetaCard, AllocBar, VixBar } from "../common/index.jsx";
import { fmt, fmtP, fmtR } from "../../utils/formatters.js";
import { getZone, getStrat } from "../../utils/helpers.js";
import { ASSET_COLORS, RISK_DATA } from "../../constants/index.js";
import { estimateRiskMetrics } from "../../utils/calculators.js";

const HoldingsCard = ({ holdings, total }) => {
  return (
    <Card style={{ height: "100%", marginBottom: 0 }}>
      <ST>현재 보유 종목 상세</ST>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {holdings.map((h, i) => {
          const pnl = h.costAmt > 0 ? ((h.amt - h.costAmt) / h.costAmt * 100).toFixed(1) : null;
          const pnlColor = pnl > 0 ? "#a32d2d" : pnl < 0 ? "#0c447c" : "var(--text-dim)";
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", borderRadius: 8, background: "var(--bg-main)",
              border: "0.5px solid var(--border-glass)"
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{h.etf.replace(" (H)", "")}</span>
                  <Badge c="var(--text-dim)" bg="var(--bg-card)">{h.cls}</Badge>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {h.code && <span style={{ fontFamily: "monospace", marginRight: 8 }}>{h.code}</span>}
                  비중 {h.cur}%
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(h.amt)}원</div>
                {pnl !== null && (
                  <div style={{ fontSize: 11, fontWeight: 500, color: pnlColor }}>
                    {pnl > 0 ? "▲" : pnl < 0 ? "▼" : ""} {pnl}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default function Dashboard({ portfolio, vix, vixLoading, onFetchVix, onGo }) {
  const z = getZone(vix);
  const s = getStrat(portfolio.strategy);
  const total = portfolio.total || 0;
  
  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    return { ...h, cur, diff: Math.round((cur - h.target) * 10) / 10 };
  });

  // 전문 위험 지표 계산
  const riskMetrics = estimateRiskMetrics(holdings, RISK_DATA);
  const annualExpRet = s.annualRet.base; // 기대수익률 (전략 기반)
  const sharpe = (annualExpRet - 0.03) / (riskMetrics.vol || 1); // 무위험수익률 3% 가정

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: "1rem" }}>
        <MetaCard label="총 평가금액" value={fmt(total) + "원"} sub={new Date().toLocaleDateString("ko-KR")} />
        <MetaCard label="현재 VIX" value={vixLoading ? "…" : vix.toFixed(1)} sub={z.lbl + " / " + z.mode} subColor={z.color} />
        <MetaCard label="기대 변동성(σ)" value={fmtP(riskMetrics.vol * 100)} sub="연간 추정치" />
        <MetaCard label="샤프 지수" value={sharpe.toFixed(2)} sub={sharpe > 0.5 ? "효율적" : "보통"} subColor={sharpe > 0.5 ? "var(--color-success)" : "var(--text-dim)"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1rem", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".875rem" }}>
              <ST>포트폴리오 자산 배분</ST>
              <Btn sm onClick={onFetchVix}>{vixLoading ? "갱신 중…" : "VIX 갱신"}</Btn>
            </div>
            {holdings.map((h, i) => (
              <AllocBar key={i} label={h.etf} pct={h.cur} target={h.target} color={ASSET_COLORS[h.cls] || "#888"} />
            ))}
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <ST>시장 상황 진단 (KIS API)</ST>
            <VixBar vix={vix} />
            <div style={{ background: z.bg, borderRadius: "var(--radius-md)", padding: ".875rem 1rem", marginTop: 10 }}>
              <Badge c={z.color} bg={z.color + "20"}>{z.mode}</Badge>
              <span style={{ fontSize: 12, color: z.color, marginLeft: 8, lineHeight: 1.7 }}>{z.desc}</span>
            </div>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "0.5rem" }}>
            <Btn onClick={() => onGo("rebalance")}>리밸런싱 판단 →</Btn>
            <Btn primary onClick={() => onGo("roadmap")}>은퇴 로드맵 →</Btn>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <HoldingsCard holdings={holdings} total={total} />
          
          <Card>
            <ST>전문가 어드바이스: 포트폴리오 품질</ST>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              현재 포트폴리오의 샤프 지수는 <strong>{sharpe.toFixed(2)}</strong>입니다. 
              {sharpe > 0.5 
                ? " 위험 대비 기대수익률이 우수한 구조입니다." 
                : " 자산 간 상관관계를 고려하여 더 분산된 전략으로의 교체를 검토해 보세요."}
              <br /><br />
              선택하신 <strong>{s.name}</strong> 전략은 연간 약 <strong>{fmtR(annualExpRet)}</strong>의 성장을 목표로 하며, 
              VIX 지수가 {vix.toFixed(1)}인 현재 {z.mode} 구간에 있습니다.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
