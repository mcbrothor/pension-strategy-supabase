import React from "react";
import { getFreshnessLabel, getGradeTheme } from "../../services/marketData.js";

/**
 * KPI 스트립 — 전역 상단에 핵심 지표를 한 줄로 표시
 * 왜 필요한가: 어떤 탭에서든 총자산·VIX·변동성 등 핵심 상태를 즉가 파악하기 위해
 */
export default function KPIStrip({ total, totalDiff, vix, vixMeta, avgCorrelation, vol, sharpe, dataGrade }) {
  const items = [
    {
      label: "총 자산",
      value: total ? `${(total / 10000).toLocaleString()}만` : "—",
      sub: totalDiff != null ? (totalDiff >= 0 ? `▲${Math.abs(totalDiff / 10000).toLocaleString()}만` : `▼${Math.abs(totalDiff / 10000).toLocaleString()}만`) : null,
      subColor: totalDiff >= 0 ? "var(--alert-ok-color)" : "var(--alert-info-color)",
    },
    {
      label: "VIX",
      value: vix != null ? vix.toFixed(1) : "—",
      sub: vixMeta ? getFreshnessLabel(vixMeta.freshness) : null,
      subColor: vix > 25 ? "var(--alert-danger-color)" : "var(--text-dim)",
    },
    {
      label: "상관계수",
      value: avgCorrelation != null ? avgCorrelation.toFixed(2) : "—",
      sub: avgCorrelation > 0.7 ? "⚠ 높음" : avgCorrelation > 0.5 ? "보통" : "양호",
      subColor: avgCorrelation > 0.7 ? "var(--alert-danger-color)" : "var(--alert-ok-color)",
    },
    {
      label: "변동성(σ)",
      value: vol != null ? `${vol.toFixed(1)}%` : "—",
    },
    {
      label: "샤프",
      value: sharpe != null ? sharpe.toFixed(2) : "—",
      sub: sharpe > 0.8 ? "매우 우수" : sharpe > 0.4 ? "양호" : "보통",
      subColor: sharpe > 0.4 ? "var(--alert-ok-color)" : "var(--text-dim)",
    },
    {
      label: "신뢰도",
      value: dataGrade || "—",
      sub: dataGrade ? (dataGrade === 'A' ? '정상' : dataGrade === 'B' ? '주의' : '경고') : null,
      subColor: dataGrade === 'A' ? "var(--alert-ok-color)" : dataGrade === 'B' ? "var(--alert-warn-color)" : "var(--alert-danger-color)",
    },
  ];

  return (
    <div className="kpi-strip">
      {items.map((item, i) => (
        <div key={i} className="kpi-strip-item">
          <div style={{ fontSize: "var(--density-font-sm)", color: "var(--text-dim)", marginBottom: 2 }}>{item.label}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-main)" }}>{item.value}</div>
          {item.sub && (
            <div style={{ fontSize: 9, color: item.subColor || "var(--text-dim)", fontWeight: 500, marginTop: 1 }}>{item.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
