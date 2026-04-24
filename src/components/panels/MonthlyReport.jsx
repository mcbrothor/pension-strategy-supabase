import React, { useMemo } from "react";
import { Card, Btn, Badge, ST } from "../common/index.jsx";
import { fmt } from "../../utils/formatters.js";
import { formatPercentValue } from "../../utils/performance.js";
import MarketDataBadge from "../common/MarketDataBadge.jsx";
import OverlaySummaryCard from "../common/OverlaySummaryCard.jsx";
import {
  buildHoldingsTableRows,
  buildPerformanceCsvRows,
  buildPerformanceSummaryRows,
  buildTransactionsCsvRows,
  exportCsv,
  exportExcelWorkbook,
} from "../../utils/exporters.js";
import {
  calculateBenchmarkReturn,
  fetchBenchmarkHistory,
} from "../../services/benchmarkService.js";
import {
  buildReportModel,
  generateLlmReadyReportHTML,
  printReport,
} from "../../services/reportEngine.js";

const TAG_COLORS = {
  "[미국 주식]": "#185fa5",
  "[국내 주식]": "#3b6d11",
  "[채권]": "#ba7517",
  "[대체자산]": "#639922",
  "[현금]": "#888780",
};

function DonutChart({ weights, size = 140 }) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return null;

  const radius = 60;
  const strokeWidth = 14;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedAngle = 0;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {entries.map(([tag, value]) => {
          const ratio = value / total;
          const strokeDasharray = `${circumference * ratio} ${circumference}`;
          const rotation = (accumulatedAngle / total) * 360 - 90;
          accumulatedAngle += value;

          return (
            <circle
              key={tag}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={TAG_COLORS[tag] || "#ccc"}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              transform={`rotate(${rotation} ${center} ${center})`}
            />
          );
        })}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.32em"
          style={{
            fontSize: "14px",
            fontWeight: 800,
            fill: "var(--text-main)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {Math.round(total)}%
        </text>
      </svg>
    </div>
  );
}

function MetricCard({ label, value, sub, tone = "default" }) {
  const colorMap = {
    default: "var(--text-main)",
    good: "#27500a",
    warn: "#633806",
    bad: "#a32d2d",
    primary: "#185fa5",
  };

  return (
    <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colorMap[tone] || colorMap.default }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

export default function MonthlyReport({
  portfolio,
  vix,
  vixSource,
  vixUpdatedAt,
  vixError,
  vixMeta,
  signalMeta,
}) {
  const now = new Date();
  const [actualBenchmark, setActualBenchmark] = React.useState(null);
  const model = useMemo(() => buildReportModel({ portfolio, vix, now }), [portfolio, vix]);
  const overlay = portfolio.strategyOverlay || model.strategyOverlay || null;
  const accountConstraint =
    portfolio.accountType === "IRP" ? "위험자산 한도 70%" : "위험자산 한도 없음";

  React.useEffect(() => {
    let active = true;

    async function loadBenchmark() {
      try {
        const periodKey = model.performance.periodDays >= 700 ? "3Y" : "1Y";
        const history = await fetchBenchmarkHistory(model.strategy, periodKey);
        const periodReturn = calculateBenchmarkReturn(
          history,
          model.performance.periodDays || null
        );

        if (!active) return;
        setActualBenchmark({
          ...history,
          periodReturn,
          isProxy: false,
        });
      } catch {
        if (active) setActualBenchmark(null);
      }
    }

    loadBenchmark();
    return () => {
      active = false;
    };
  }, [model.performance.periodDays, model.strategy]);

  const displayedBenchmark = actualBenchmark || model.benchmark;
  const displayedAlpha =
    model.performance.periodReturn != null && displayedBenchmark?.periodReturn != null
      ? model.performance.periodReturn - displayedBenchmark.periodReturn
      : model.alpha;

  const warnings = [
    model.performance.returnAnomalyNote,
    model.strategyReview.warning,
    vixError ? `VIX 데이터 경고: ${vixError}` : null,
    model.performance.totalFees > 0
      ? `누적 거래 수수료 ${fmt(model.performance.totalFees)}원이 반영되었습니다.`
      : null,
    signalMeta?.source === "Composite+Fallback"
      ? "시장 시그널 일부는 fallback 또는 캐시 값입니다."
      : null,
  ].filter(Boolean);

  const retirement = model.retirementHorizon;
  const retirementText = retirement.currentAge
    ? `현재 나이 ${retirement.currentAge}세, 예상 은퇴연도 ${retirement.expectedRetirementYear}년, 월평균 적립액 ${fmt(retirement.monthlyContribution)}원`
    : "은퇴 로드맵 입력값이 없어 추가 설정이 필요합니다.";

  const tagWeights = model.holdings.reduce((acc, holding) => {
    acc[holding.assetClassTag] = (acc[holding.assetClassTag] || 0) + (Number(holding.cur) || 0);
    return acc;
  }, {});

  function handlePrint() {
    const html = generateLlmReadyReportHTML({
      portfolio,
      vix,
      vixSource,
      vixUpdatedAt,
      vixError,
      dataMeta: {
        vixMeta,
        signalMeta,
      },
      benchmarkOverride: displayedBenchmark,
      overlayMeta: overlay,
    });
    printReport(html);
  }

  function exportPerformanceCsv() {
    exportCsv(
      `performance_${new Date().toISOString().slice(0, 10)}.csv`,
      buildPerformanceCsvRows(model)
    );
  }

  function exportPerformanceExcel() {
    const transactionRows = buildTransactionsCsvRows(portfolio.transactions || []).map((row) =>
      row
        .split(",")
        .map((cell) => cell.replace(/^\"|\"$/g, "").replace(/\"\"/g, '"'))
    );

    exportExcelWorkbook(`portfolio_export_${new Date().toISOString().slice(0, 10)}.xls`, [
      {
        name: "Summary",
        title: "연금 포트폴리오 성과 요약",
        rows: buildPerformanceSummaryRows(
          {
            ...model,
            accountType: portfolio.accountType,
          },
          displayedBenchmark
        ),
      },
      {
        name: "Holdings",
        title: "보유자산 상세",
        rows: buildHoldingsTableRows(model.holdings),
      },
      {
        name: "Transactions",
        title: "거래내역",
        rows: transactionRows,
      },
    ]);
  }

  return (
    <div>
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-main)" }}>
              개인 연금 운용 보고서
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
              성과 요약, 벤치마크 비교, 거래 기반 손익, 오버레이 메타를 함께 제공합니다.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <MarketDataBadge meta={vixMeta} fallbackText="VIX 메타 없음" />
              <MarketDataBadge meta={signalMeta} fallbackText="시그널 메타 없음" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn danger onClick={handlePrint} style={{ padding: "8px 20px" }}>
              보고서 출력(PDF)
            </Btn>
            <Btn onClick={exportPerformanceCsv} style={{ padding: "8px 20px" }}>
              성과 CSV
            </Btn>
            <Btn onClick={exportPerformanceExcel} style={{ padding: "8px 20px" }}>
              Excel 호환
            </Btn>
          </div>
        </div>

        {warnings.length > 0 && (
          <div
            style={{
              background: "#fff3cd",
              border: "1px solid #ffc107",
              borderRadius: 8,
              padding: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#664d03", marginBottom: 4 }}>
              데이터 및 해석 주의사항
            </div>
            {warnings.map((warning) => (
              <div key={warning} style={{ fontSize: 11, color: "#664d03", lineHeight: 1.6 }}>
                - {warning}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            background: "var(--bg-main)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            <Badge bg="#eef6ff" c="#185fa5">
              Manager Insight
            </Badge>
            <Badge
              bg={model.strategyReview.mismatch ? "#fcebeb" : "#eaf3de"}
              c={model.strategyReview.mismatch ? "#791f1f" : "#27500a"}
            >
              현재 전략: {model.displayStrategyName}
            </Badge>
            <Badge
              bg={portfolio.accountType === "IRP" ? "#faeeda" : "#eaf3de"}
              c={portfolio.accountType === "IRP" ? "#633806" : "#27500a"}
            >
              {portfolio.accountType} · {accountConstraint}
            </Badge>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {now.toLocaleString("ko-KR")} 기준
            </span>
          </div>

          <div
            style={{
              color: "var(--text-main)",
              marginBottom: "1.25rem",
              borderLeft: "3px solid #185fa5",
              paddingLeft: 12,
            }}
          >
            {model.managerInsight}
          </div>

          {overlay && (
            <div style={{ marginBottom: "1.25rem" }}>
              <OverlaySummaryCard overlay={overlay} title="보고서 기준 오버레이" />
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: "1.25rem",
            }}
          >
            <MetricCard
              label="기간 수익률"
              value={formatPercentValue(model.performance.periodReturn)}
              sub={
                model.performance.hasHistory
                  ? `${model.performance.firstDate} 이후 ${model.performance.periodDays}일`
                  : "정상 히스토리 부족"
              }
              tone={
                model.performance.periodReturn != null && model.performance.periodReturn < 0
                  ? "bad"
                  : "primary"
              }
            />
            <MetricCard
              label={displayedBenchmark?.name || model.benchmark.name}
              value={formatPercentValue(displayedBenchmark?.periodReturn)}
              sub={actualBenchmark ? "실제 시세 기준 BM" : "프록시 기준 BM"}
              tone="primary"
            />
            <MetricCard
              label="BM 대비 Alpha"
              value={formatPercentValue(displayedAlpha)}
              sub="동일 기간 초과 성과"
              tone={displayedAlpha != null && displayedAlpha < 0 ? "bad" : "good"}
            />
            <MetricCard
              label="원금 대비 수익률"
              value={formatPercentValue(model.performance.unrealizedReturn)}
              sub={
                model.performance.unrealizedPnl != null
                  ? `${model.performance.unrealizedPnl >= 0 ? "+" : "-"}${fmt(Math.abs(model.performance.unrealizedPnl))}원`
                  : "원가 입력 필요"
              }
              tone={
                model.performance.unrealizedReturn != null &&
                model.performance.unrealizedReturn < 0
                  ? "bad"
                  : "good"
              }
            />
            <MetricCard
              label="실현 손익"
              value={`${(model.performance.realizedPnl || 0) >= 0 ? "+" : "-"}${fmt(Math.abs(model.performance.realizedPnl || 0))}원`}
              sub="거래내역 기준"
              tone={(model.performance.realizedPnl || 0) < 0 ? "bad" : "good"}
            />
            <MetricCard
              label="BM Gap 1Y / 3Y"
              value={`${formatPercentValue(model.performance.benchmarkGap1Y)} / ${formatPercentValue(model.performance.benchmarkGap3Y)}`}
              sub="rolling 기준"
              tone="default"
            />
          </div>

          {Object.keys(model.contributionByAssetClass || {}).length > 0 && (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: 8,
                padding: 12,
                marginBottom: "1.25rem",
              }}
            >
              <ST>성과 기여도</ST>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 8,
                }}
              >
                {Object.entries(model.contributionByAssetClass).map(([assetClass, value]) => (
                  <div
                    key={assetClass}
                    style={{ background: "var(--bg-main)", borderRadius: 8, padding: "10px 12px" }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                      {assetClass}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: value < 0 ? "#a32d2d" : "#3b6d11",
                      }}
                    >
                      {value >= 0 ? "+" : "-"}
                      {fmt(Math.abs(value))}원
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 8,
              padding: 12,
              marginBottom: "1.25rem",
            }}
          >
            <ST>구체적 리밸런싱 지침</ST>
            <div style={{ fontSize: 12, color: "var(--text-main)", lineHeight: 1.7 }}>
              {model.rebalanceInstruction.text}
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 8,
              padding: 12,
              marginBottom: "1.25rem",
            }}
          >
            <ST>은퇴 준비도 메타</ST>
            <div style={{ fontSize: 12, color: "var(--text-main)", lineHeight: 1.7 }}>
              {retirementText}
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 12,
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <ST>포트폴리오 비중 요약</ST>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "2rem",
                marginTop: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <DonutChart weights={tagWeights} />
              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: "10px",
                }}
              >
                {Object.entries(tagWeights)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, value]) => (
                    <div
                      key={tag}
                      style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: TAG_COLORS[tag] || "#ccc",
                        }}
                      />
                      <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>{tag}</span>
                      <span style={{ color: "var(--text-main)", fontWeight: 700 }}>
                        {value.toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <ST>자산 상세 분석(LLM-Ready)</ST>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                  <th style={{ textAlign: "left", padding: "7px 8px", color: "var(--text-dim)" }}>
                    자산군
                  </th>
                  <th style={{ textAlign: "left", padding: "7px 8px", color: "var(--text-dim)" }}>
                    자산명(티커)
                  </th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>
                    현재
                  </th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>
                    목표
                  </th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>
                    괴리
                  </th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>
                    평가금액
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.holdings.map((holding) => (
                  <tr
                    key={`${holding.code || holding.etf}-${holding.cls}`}
                    style={{ borderBottom: "0.5px solid var(--border-glass)" }}
                  >
                    <td style={{ padding: "9px 8px", color: "var(--text-dim)" }}>
                      {holding.assetClassTag}
                    </td>
                    <td style={{ padding: "9px 8px", fontWeight: 600 }}>
                      {holding.displayName}
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>{holding.cur}%</td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: "var(--text-dim)" }}>
                      {holding.target}%
                    </td>
                    <td
                      style={{
                        padding: "9px 8px",
                        textAlign: "right",
                        fontWeight: 700,
                        color:
                          Math.abs(holding.diff) >= 5
                            ? holding.diff > 0
                              ? "#a32d2d"
                              : "#185fa5"
                            : "#27500a",
                      }}
                    >
                      {holding.diff >= 0 ? "+" : ""}
                      {holding.diff.toFixed(1)}%p
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>
                      {fmt(holding.amt)}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
