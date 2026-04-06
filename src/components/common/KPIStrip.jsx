import React from "react";
import { getFreshnessLabel } from "../../services/marketData.js";

/**
 * KPI 스트립 — 전역 상단에 핵심 지표를 한 줄로 표시
 * 
 * 포함 지표 (리서치 결과 반영):
 * - 총 자산, VIX, 상관계수 → 기존
 * - 변동성(σ), 샤프, 소르티노, CVaR, MDD, 칼마 → 전문가 지표 추가
 * - 신뢰도 → 데이터 출처 투명성
 */
export default function KPIStrip({
  total, totalDiff, vix, vixMeta, avgCorrelation,
  vol, sharpe, sortino, cvar, mdd, calmar,
  fearGreedScore, yieldSpreadVal,
  dataGrade
}) {
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
      label: "변동성(σ)",
      value: vol != null ? `${vol.toFixed(1)}%` : "—",
      sub: vol < 8 ? "보수적" : vol < 15 ? "중립적" : "공격적",
      subColor: vol < 15 ? "var(--alert-ok-color)" : "var(--alert-warn-color)",
    },
    {
      label: "샤프",
      value: sharpe != null ? sharpe.toFixed(2) : "—",
      sub: sharpe > 0.8 ? "매우 우수" : sharpe > 0.4 ? "양호" : "보통",
      subColor: sharpe > 0.4 ? "var(--alert-ok-color)" : "var(--text-dim)",
    },
    {
      // 소르티노: 하락 리스크만 고려한 효율성 → 연금처럼 "잃는 것"이 치명적인 경우 핵심
      label: "소르티노",
      value: sortino != null ? sortino.toFixed(2) : "—",
      sub: sortino > 1.0 ? "우수" : sortino > 0.5 ? "양호" : "개선 필요",
      subColor: sortino > 0.5 ? "var(--alert-ok-color)" : "var(--alert-warn-color)",
    },
    {
      // CVaR(95%): 최악의 5% 시나리오 평균 손실 → "최악의 경우" 대비
      label: "CVaR",
      value: cvar != null ? `-${cvar.toFixed(1)}%` : "—",
      sub: "95% 최대손실",
      subColor: cvar > 20 ? "var(--alert-danger-color)" : "var(--text-dim)",
    },
    {
      // MDD: 현재 최대 낙폭 → 포트폴리오 건강 상태 직관적 파악
      label: "MDD",
      value: mdd != null ? `${mdd.toFixed(1)}%` : "—",
      sub: mdd < -20 ? "⚠ 경고" : mdd < -10 ? "주의" : "정상",
      subColor: mdd < -20 ? "var(--alert-danger-color)" : mdd < -10 ? "var(--alert-warn-color)" : "var(--alert-ok-color)",
    },
    {
      // 칼마: 수익률/MDD → 고통 대비 얼마나 벌었나
      label: "칼마",
      value: calmar != null ? calmar.toFixed(2) : "—",
      sub: calmar > 1.5 ? "우수" : calmar > 0.5 ? "양호" : "관리 필요",
      subColor: calmar > 0.5 ? "var(--alert-ok-color)" : "var(--alert-warn-color)",
    },
    {
      label: "상관계수",
      value: avgCorrelation != null ? avgCorrelation.toFixed(2) : "—",
      sub: avgCorrelation > 0.7 ? "⚠ 높음" : avgCorrelation > 0.5 ? "보통" : "양호",
      subColor: avgCorrelation > 0.7 ? "var(--alert-danger-color)" : "var(--alert-ok-color)",
    },
    {
      // Fear & Greed: 투자 심리 복합 지표
      label: "F&G",
      value: fearGreedScore != null ? Math.round(fearGreedScore).toString() : "—",
      sub: fearGreedScore != null ? (fearGreedScore <= 24 ? "극단적 공포" : fearGreedScore <= 44 ? "공포" : fearGreedScore <= 55 ? "중립" : fearGreedScore <= 74 ? "탐욕" : "극단적 탐욕") : null,
      subColor: fearGreedScore != null ? (fearGreedScore <= 24 ? "var(--alert-danger-color)" : fearGreedScore <= 44 ? "var(--alert-warn-color)" : fearGreedScore <= 74 ? "var(--text-dim)" : "var(--alert-info-color)") : "var(--text-dim)",
    },
    {
      // 수익률 곡선: 경기 사이클 지표
      label: "10Y-2Y",
      value: yieldSpreadVal != null ? `${yieldSpreadVal >= 0 ? "+" : ""}${yieldSpreadVal.toFixed(2)}%` : "—",
      sub: yieldSpreadVal != null ? (yieldSpreadVal < 0 ? "⚠ 역전" : yieldSpreadVal < 0.5 ? "평탄화" : "정상") : null,
      subColor: yieldSpreadVal != null ? (yieldSpreadVal < 0 ? "var(--alert-danger-color)" : yieldSpreadVal < 0.5 ? "var(--alert-warn-color)" : "var(--alert-ok-color)") : "var(--text-dim)",
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>{item.value}</div>
          {item.sub && (
            <div style={{ fontSize: 9, color: item.subColor || "var(--text-dim)", fontWeight: 500, marginTop: 1 }}>{item.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
