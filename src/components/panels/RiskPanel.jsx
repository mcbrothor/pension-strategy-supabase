import React, { useState } from "react";
import { Card, ST, Badge, MetaCard } from "../common/index.jsx";
import { fmtP } from "../../utils/formatters.js";
import { getStrat } from "../../utils/helpers.js";
import { RISK_DATA, ASSET_COLORS } from "../../constants/index.js";
import { generateRiskReport } from "../../services/riskEngine.js";

/**
 * 리스크 패널 — 전문 리스크 지표 화면
 * 변동성, 샤프, Sortino, CVaR, 리스크 기여도를 기간별(1Y/3Y/전체)로 제공합니다.
 */
export default function RiskPanel({ portfolio }) {
  const [period, setPeriod] = useState("1Y"); // '1Y' | '3Y' | 'all'

  const s = getStrat(portfolio.strategy);
  const total = portfolio.total || 0;
  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    return { ...h, cur };
  });

  const annualExpRet = s?.annualRet?.base || 0.08;
  const report = generateRiskReport(holdings, annualExpRet, period);

  return (
    <div>
      {/* 기간 선택 */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem" }}>
        {["1Y", "3Y", "all"].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            padding: "6px 14px", fontSize: 12, border: "1px solid var(--border-glass)",
            borderRadius: 6, background: period === p ? "var(--text-main)" : "none",
            color: period === p ? "#fff" : "var(--text-dim)", cursor: "pointer",
            fontFamily: "var(--font-sans)", fontWeight: period === p ? 600 : 400
          }}>
            {p === "all" ? "전체" : p}
          </button>
        ))}
        <Badge c="var(--alert-warn-color)" bg="var(--alert-warn-bg)" style={{ marginLeft: "auto" }}>
          {report.calcMode === 'estimated' ? '추정 기반' : '실현 기반'}
        </Badge>
      </div>

      {/* 핵심 지표 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: "1rem" }}>
        <MetaCard
          label="기대 변동성(σ)"
          value={fmtP(report.metrics.vol)}
          sub={report.metrics.vol < 8 ? "보수적" : report.metrics.vol < 15 ? "중립적" : "공격적"}
          subColor={report.metrics.vol < 15 ? "var(--alert-ok-color)" : "var(--alert-warn-color)"}
        />
        <MetaCard
          label="샤프 지수"
          value={report.metrics.sharpe.toFixed(2)}
          sub={report.metrics.sharpe > 0.8 ? "매우 우수" : report.metrics.sharpe > 0.4 ? "양호" : "보통"}
          subColor={report.metrics.sharpe > 0.4 ? "var(--alert-ok-color)" : "var(--text-dim)"}
        />
        <MetaCard
          label="소르티노 지수"
          value={report.metrics.sortino.toFixed(2)}
          sub={report.metrics.sortino > 1.0 ? "우수" : report.metrics.sortino > 0.5 ? "양호" : "개선 필요"}
          subColor={report.metrics.sortino > 0.5 ? "var(--alert-ok-color)" : "var(--alert-warn-color)"}
        />
        <MetaCard
          label="CVaR(95%)"
          value={`-${report.metrics.cvar.toFixed(1)}%`}
          sub="최대 예상 손실"
          subColor="var(--alert-danger-color)"
        />
      </div>

      {/* 경고 메시지 */}
      {report.warnings.length > 0 && (
        <Card>
          <ST>📐 데이터 주의사항</ST>
          {report.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--alert-warn-color)", padding: "4px 0", borderBottom: i < report.warnings.length - 1 ? "0.5px solid var(--border-glass)" : "none" }}>
              ⚠ {w}
            </div>
          ))}
        </Card>
      )}

      {/* 리스크 기여도 */}
      <Card>
        <ST>리스크 기여도 분석</ST>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
          각 자산이 포트폴리오 전체 위험에 기여하는 비율입니다. 특정 자산의 기여도가 지나치게 높으면 집중 리스크를 의미합니다.
        </div>
        {report.riskContribution.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, minWidth: 100, fontWeight: 500 }}>{item.cls}</div>
            <div style={{ flex: 1, height: 8, background: "var(--bg-main)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(item.contribution, 100)}%`,
                background: ASSET_COLORS[item.cls] || "#888",
                borderRadius: 4
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, minWidth: 40, textAlign: "right" }}>
              {item.contribution.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: "var(--text-dim)", minWidth: 40, textAlign: "right" }}>
              (σ {(item.sigma * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </Card>

      {/* 전문가 인사이트 */}
      <Card>
        <ST>전문가 어드바이스</ST>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-main)" }}>
          현재 포트폴리오의 샤프 지수는 <strong>{report.metrics.sharpe.toFixed(2)}</strong>이며,
          소르티노 지수는 <strong>{report.metrics.sortino.toFixed(2)}</strong>입니다.
          {report.metrics.sharpe > 0.5
            ? " 위험 대비 기대수익률이 우수한 구조입니다."
            : " 안전 자산 비중 조정 또는 더 분산된 전략으로의 교체를 검토해 보세요."}
          {report.metrics.cvar > 20 && (
            <span style={{ color: "var(--alert-danger-color)", fontWeight: 600 }}>
              {" "}⚠ CVaR이 {report.metrics.cvar.toFixed(1)}%로 높습니다. 극단적 손실에 대비한 현금 비중 확보를 권장합니다.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
