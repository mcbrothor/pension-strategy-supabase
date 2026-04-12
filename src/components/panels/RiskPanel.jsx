import React, { useState } from "react";
import { Card, ST, Badge, Btn } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { ASSET_COLORS } from "../../constants/index.js";
import { usePortfolioRiskReport } from "../../hooks/usePortfolioRiskReport.js";

// Recharts for MDD chart
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

function RiskMetricCard({ metric, onExplain }) {
  return (
    <div style={{ background: "var(--bg-main)", borderRadius: "var(--radius-md)", padding: ".875rem", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>{metric.label}</div>
      <div style={{ fontSize: 19, fontWeight: 500 }}>{metric.value}</div>
      {metric.sub && <div style={{ fontSize: 10, color: metric.subColor || "var(--text-dim)", fontWeight: 500, marginTop: 2 }}>{metric.sub}</div>}
      <button
        type="button"
        onClick={() => onExplain(metric)}
        data-testid={`risk-explain-${metric.id}`}
        style={{
          marginTop: 8,
          padding: "4px 8px",
          border: "1px solid var(--border-glass)",
          borderRadius: 6,
          background: "#fff",
          color: "var(--text-main)",
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
        }}
      >
        계산 기준
      </button>
    </div>
  );
}

function CalculationModal({ item, onClose }) {
  if (!item) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(15, 23, 42, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: "min(620px, 100%)",
          maxHeight: "86vh",
          overflow: "auto",
          background: "#fff",
          color: "#111827",
          borderRadius: 8,
          padding: 20,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>계산 기준</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{item.label}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#111827",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: "28px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", marginBottom: 4 }}>현재 값</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{item.valueText || item.value}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>어떻게 계산하나요?</div>
            <div>{item.description}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>사용한 데이터</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {item.inputs.map((input) => (
                <li key={input}>{input}</li>
              ))}
            </ul>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>산식</div>
            <div style={{ fontFamily: "monospace", padding: 10, borderRadius: 8, background: "#0f172a", color: "#f8fafc", overflowX: "auto" }}>
              {item.formula}
            </div>
          </div>
          {item.note && (
            <div style={{ padding: 12, borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", color: "#7c2d12" }}>
              {item.note}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Btn primary onClick={onClose}>확인</Btn>
        </div>
      </div>
    </div>
  );
}

/**
 * 리스크 패널 — 전문 리스크 지표 화면
 * 변동성, 샤프, Sortino, CVaR, 리스크 기여도를 기간별(1Y/3Y/전체)로 제공합니다.
 */
export default function RiskPanel({ portfolio }) {
  const [period, setPeriod] = useState("1Y"); // '1Y' | '3Y' | 'all'
  const [calculationDetail, setCalculationDetail] = useState(null);
  const {
    annualExpRet,
    excludedHoldings,
    historyEligibleHoldings,
    loadingHistory,
    minimumHistoryCount,
    report,
    targetCount,
    total,
    validHistoryCount,
  } = usePortfolioRiskReport(portfolio, period);
  const riskModeText = report.calcMode === "realized" ? "실현 데이터 기반" : "자산군 평균값 추정 기반";
  const riskInputs = [
    `현재 보유자산 합계: ${fmt(total)}`,
    `보유금액 비중: 각 종목 평가금액 / 보유자산 합계`,
    report.calcMode === "realized"
      ? `과거 가격 이력: 현금 제외 ${validHistoryCount}개 종목 반영, 공통 ${report.dataPoints || 0}개 일간수익률 사용`
      : "과거 가격 이력이 부족한 경우 자산군별 평균 변동성 사용",
    `선택 기간: ${period === "all" ? "전체" : period} (목표 ${Math.max(targetCount - 1, 0)}개 일간수익률, 최소 ${minimumHistoryCount}개 종가 필요)`,
    `전략 기대수익률: ${(annualExpRet * 100).toFixed(1)}%`,
    "무위험수익률: 3.0%",
  ];

  const metricCards = [
    {
      id: "vol",
      label: "기대 변동성(σ)",
      value: <span data-testid="risk-vol">{fmtP(report.metrics.vol)}</span>,
      valueText: fmtP(report.metrics.vol),
      sub: report.metrics.vol < 8 ? "보수적" : report.metrics.vol < 15 ? "중립적" : "공격적",
      subColor: report.metrics.vol < 15 ? "var(--alert-ok-color)" : "var(--alert-warn-color)",
      description:
        report.calcMode === "realized"
          ? "각 종목의 일간 수익률을 현재 보유금액 비중으로 합산해 포트폴리오 일간 수익률을 만들고, 표준편차를 연율화합니다."
          : "자산군별 평균 변동성에 현재 보유금액 비중을 곱해 합산합니다.",
      formula: report.calcMode === "realized" ? "σ = stdev(Σ 일간수익률_i × 현재평가금액비중_i) × √252" : "σ = Σ(자산군 변동성_i × 현재평가금액비중_i)",
      inputs: riskInputs,
    },
    {
      id: "sharpe",
      label: "샤프 지수",
      value: report.metrics.sharpe.toFixed(2),
      valueText: report.metrics.sharpe.toFixed(2),
      sub: report.metrics.sharpe > 0.8 ? "매우 우수" : report.metrics.sharpe > 0.4 ? "양호" : "보통",
      subColor: report.metrics.sharpe > 0.4 ? "var(--alert-ok-color)" : "var(--text-dim)",
      description: "위험 1단위당 초과 기대수익이 얼마나 되는지 봅니다. 값이 높을수록 위험 대비 기대수익이 좋습니다.",
      formula: "Sharpe = (전략 기대수익률 - 무위험수익률 3%) / 변동성",
      inputs: riskInputs,
    },
    {
      id: "sortino",
      label: "소르티노 지수",
      value: report.metrics.sortino.toFixed(2),
      valueText: report.metrics.sortino.toFixed(2),
      sub: report.metrics.sortino > 1.0 ? "우수" : report.metrics.sortino > 0.5 ? "양호" : "개선 필요",
      subColor: report.metrics.sortino > 0.5 ? "var(--alert-ok-color)" : "var(--alert-warn-color)",
      description:
        report.calcMode === "realized"
          ? "손실이 난 날의 변동성만 하방위험으로 잡아 위험 대비 기대수익을 계산합니다."
          : "실제 하방수익률 데이터가 부족하면 변동성의 70%를 하방편차로 근사합니다.",
      formula: "Sortino = (전략 기대수익률 - 무위험수익률 3%) / 하방편차",
      inputs: riskInputs,
    },
    {
      id: "mdd",
      label: "MDD",
      value: `-${report.metrics.mdd ? report.metrics.mdd.toFixed(1) : 0}%`,
      valueText: `-${report.metrics.mdd ? report.metrics.mdd.toFixed(1) : 0}%`,
      sub: "최대 낙폭",
      subColor: report.metrics.mdd > 15 ? "var(--alert-danger-color)" : "var(--text-dim)",
      description:
        report.calcMode === "realized"
          ? "포트폴리오 누적 수익률 곡선에서 고점 대비 가장 크게 하락한 구간을 측정합니다."
          : "추정 기반일 때는 가격 경로가 없어 MDD를 계산하지 않습니다.",
      formula: "MDD = min((누적수익률 - 이전 최고점) / 이전 최고점)",
      inputs: riskInputs,
      note: report.calcMode !== "realized" ? "가격 이력이 충분히 로딩되면 MDD가 실현 데이터 기준으로 표시됩니다." : null,
    },
    {
      id: "cvar",
      label: "CVaR(95%)",
      value: `-${report.metrics.cvar.toFixed(1)}%`,
      valueText: `-${report.metrics.cvar.toFixed(1)}%`,
      sub: "최대 예상 일간손실(연율화)",
      subColor: "var(--alert-danger-color)",
      description:
        report.calcMode === "realized"
          ? "과거 포트폴리오 일간수익률 중 최악의 5% 구간 평균 손실을 연율화합니다."
          : "정규분포 근사를 사용해 변동성에 95% CVaR 승수를 곱합니다.",
      formula: report.calcMode === "realized" ? "CVaR95 = abs(mean(최악 5% 포트폴리오 일간수익률)) × √252" : "CVaR95 ≈ 변동성 × 2.063",
      inputs: riskInputs,
    },
  ];

  const contributionDetail = {
    id: "contribution",
    label: "리스크 기여도",
    value: `${report.riskContribution.length}개 자산군`,
    valueText: `${report.riskContribution.length}개 자산군`,
    description: "현재 보유금액 비중과 자산군별 변동성을 곱해 각 자산군이 전체 위험에 차지하는 비율을 계산합니다.",
    formula: "기여도_i = (현재비중_i × 자산군 변동성_i) / Σ(현재비중 × 자산군 변동성)",
    inputs: [
      `현재 보유자산 합계: ${fmt(total)}`,
      "같은 자산군 종목은 한 줄로 합산",
      "현금MMF도 비중에는 포함하되 변동성은 1%로 낮게 반영",
      `${riskModeText} 지표와 같은 현재 보유금액 비중 사용`,
    ],
  };

  // MDD 차트를 위한 데이터 가공 (누적 수익률 및 낙폭)
  const chartData = [];
  if (report.calcMode === 'realized' && report.dailyReturns && report.dailyReturns.length > 0) {
    let peak = 1;
    let cum = 1;
    report.dailyReturns.forEach((ret, i) => {
      cum = cum * (1 + ret);
      if (cum > peak) peak = cum;
      const drawdown = ((cum - peak) / peak) * 100;
      chartData.push({ day: i + 1, drawdown });
    });
  }

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: "1rem" }}>
        {metricCards.map((metric) => (
          <RiskMetricCard key={metric.id} metric={metric} onExplain={setCalculationDetail} />
        ))}
      </div>

      {loadingHistory && <div style={{ fontSize: 12, padding: 10, color: "var(--text-dim)" }}>KIS 가격 데이터를 수집중입니다... ({period === "all" ? "전체" : period} 목표 {Math.max(targetCount - 1, 0)}개 일간수익률)</div>}
      {!loadingHistory && (
        <div style={{ fontSize: 11, padding: "8px 10px", marginBottom: 12, borderRadius: 8, background: "var(--bg-main)", color: "var(--text-dim)", lineHeight: 1.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
            <span>
              <span data-testid="risk-calc-basis">
              계산 기준: {report.calcMode === "realized" ? `실현 데이터 기반 (${validHistoryCount}개 종목 가격 반영, 공통 ${report.dataPoints || 0}개 일간수익률)` : "자산군 평균값 추정 기반"}
              {report.calcMode !== "realized" && " · KIS 과거 시세가 부족하거나 조회 실패 시 추정치로 표시됩니다."}
              </span>
            </span>
            {historyEligibleHoldings.length > validHistoryCount && (
              <span style={{ color: "var(--alert-warn-color)", fontWeight: 500 }}>
                제외된 자산: {excludedHoldings.map(h => h.etf || h.code).join(", ")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* MDD 차트 (실현 데이터가 있을 경우) */}
      {!loadingHistory && chartData.length > 0 && (
        <Card>
          <ST>최근 MDD 트렌드 (Drawdown)</ST>
          <div style={{ width: "100%", height: 200, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickFormatter={v => `${v}일`} />
                <YAxis stroke="#64748b" fontSize={10} tickFormatter={v => `${v.toFixed(0)}%`} domain={['dataMin - 2', 0]} />
                <Tooltip 
                  formatter={(v) => [`${v.toFixed(1)}%`, 'Drawdown']} 
                  labelFormatter={(v) => `최근 ${chartData.length - v}일 전`}
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #94a3b8",
                    borderRadius: 8,
                    color: "#111827",
                    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  labelStyle={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}
                  itemStyle={{ color: "#7f1d1d", fontWeight: 800 }}
                  cursor={{ stroke: "#64748b", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <ReferenceLine y={0} stroke="#ffffff40" />
                <Line type="monotone" dataKey="drawdown" stroke="var(--alert-danger-color)" strokeWidth={2} dot={false} fill="var(--alert-danger-color)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <ST>리스크 기여도 분석</ST>
          <button
            type="button"
            onClick={() => setCalculationDetail(contributionDetail)}
            data-testid="risk-explain-contribution"
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border-glass)",
              borderRadius: 6,
              background: "#fff",
              color: "var(--text-main)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            계산 기준
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
          각 자산이 포트폴리오 전체 위험에 기여하는 비율입니다. 특정 자산의 기여도가 지나치게 높으면 집중 리스크를 의미합니다.
        </div>
        {report.riskContribution.map((item, i) => (
          <div key={i} data-testid="risk-contribution-row" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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

      <CalculationModal item={calculationDetail} onClose={() => setCalculationDetail(null)} />
    </div>
  );
}
