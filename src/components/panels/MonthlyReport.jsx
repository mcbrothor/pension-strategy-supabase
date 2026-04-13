import React from "react";
import { Card, Btn, Badge, ST } from "../common/index.jsx";
import { fmt } from "../../utils/formatters.js";
import { formatPercentValue } from "../../utils/performance.js";
import {
  buildReportModel,
  generateLlmReadyReportHTML,
  printReport,
} from "../../services/reportEngine.js";

export default function MonthlyReport({ portfolio, vix, vixSource, vixUpdatedAt, vixError }) {
  const now = new Date();
  const model = React.useMemo(
    () => buildReportModel({ portfolio, vix, now }),
    [portfolio, vix]
  );
  const accountConstraint = portfolio.accountType === "IRP" ? "위험자산 한도 70%" : "위험자산 한도 없음";
  const warnings = [
    model.performance.returnAnomalyNote,
    model.strategyReview.warning,
    vixError ? `VIX 데이터 오류: ${vixError}` : null,
  ].filter(Boolean);

  function print() {
    const html = generateLlmReadyReportHTML({
      portfolio,
      vix,
      vixSource,
      vixUpdatedAt,
      vixError,
      dataMeta: null,
    });
    printReport(html);
  }

  const retirement = model.retirementHorizon;
  const retirementText = retirement.currentAge
    ? `현재 나이 ${retirement.currentAge}세 · 예상 은퇴연도 ${retirement.expectedRetirementYear}년 · 월평균 적립액 ${fmt(retirement.monthlyContribution)}원`
    : "은퇴 로드맵 입력값이 없어 투자 시계 데이터 산정이 필요합니다.";

  return (
    <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1.25rem" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-main)" }}>개인 연금 운용 보고서</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
              성과 요약, 벤치마크, 실행 지침, LLM 컨설팅용 메타데이터 포함
            </div>
          </div>
          <Btn danger onClick={print} style={{ padding: "8px 24px" }}>보고서 출력 (PDF)</Btn>
        </div>

        {warnings.length > 0 && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#664d03", marginBottom: 4 }}>데이터/전략 주의사항</div>
            {warnings.map((warning) => (
              <div key={warning} style={{ fontSize: 11, color: "#664d03", lineHeight: 1.6 }}>· {warning}</div>
            ))}
          </div>
        )}

        <div style={{ background: "var(--bg-main)", borderRadius: "var(--radius-md)", padding: "1.5rem", fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
            <Badge bg="#eef6ff" c="#185fa5">Manager Insight</Badge>
            <Badge bg={model.strategyReview.mismatch ? "#fcebeb" : "#eaf3de"} c={model.strategyReview.mismatch ? "#791f1f" : "#27500a"}>
              표시 전략: {model.displayStrategyName}
            </Badge>
            <Badge bg={portfolio.accountType === "IRP" ? "#faeeda" : "#eaf3de"} c={portfolio.accountType === "IRP" ? "#633806" : "#27500a"}>
              {portfolio.accountType} · {accountConstraint}
            </Badge>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{now.toLocaleString("ko-KR")} 기준</span>
          </div>

          <div style={{ color: "var(--text-main)", marginBottom: "1.5rem", borderLeft: "3px solid #185fa5", paddingLeft: 12 }}>
            {model.managerInsight}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: "1.25rem" }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>스냅샷 기준 성과</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: model.performance.periodReturn != null && model.performance.periodReturn < 0 ? "#a32d2d" : "#185fa5" }}>
                {formatPercentValue(model.performance.periodReturn)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>
                {model.performance.hasHistory ? `${model.performance.firstDate} 이후 ${model.performance.periodDays}일` : "정상 스냅샷 부족"}
              </div>
            </div>
            <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>{model.benchmark.name}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#185fa5" }}>
                {formatPercentValue(model.benchmark.periodReturn)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>동일 기간 프록시 BM</div>
            </div>
            <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>BM 대비 Alpha</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: model.alpha != null && model.alpha < 0 ? "#a32d2d" : "#3b6d11" }}>
                {formatPercentValue(model.alpha)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>초과 달성 성과</div>
            </div>
            <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>원금 대비 수익률</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: model.performance.unrealizedReturn != null && model.performance.unrealizedReturn < 0 ? "#a32d2d" : "#3b6d11" }}>
                {formatPercentValue(model.performance.unrealizedReturn)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>
                {model.performance.unrealizedPnl != null ? `${model.performance.unrealizedPnl >= 0 ? "+" : "-"}${fmt(Math.abs(model.performance.unrealizedPnl))}원` : "원가 입력 필요"}
              </div>
            </div>
          </div>

          <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 12, marginBottom: "1.25rem" }}>
            <ST>구체적 리밸런싱 지침</ST>
            <div style={{ fontSize: 12, color: "var(--text-main)", lineHeight: 1.7 }}>
              {model.rebalanceInstruction.text}
            </div>
          </div>

          <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 12, marginBottom: "1.25rem" }}>
            <ST>은퇴 준비도 진단 메타데이터</ST>
            <div style={{ fontSize: 12, color: "var(--text-main)", lineHeight: 1.7 }}>
              {retirementText}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <ST>자산 상세 분석표 (LLM-Ready)</ST>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                  <th style={{ textAlign: "left", padding: "7px 8px", color: "var(--text-dim)" }}>자산명(티커)</th>
                  <th style={{ textAlign: "left", padding: "7px 8px", color: "var(--text-dim)" }}>자산군 태그</th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>현재</th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>목표</th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>편차</th>
                  <th style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-dim)" }}>평가금액</th>
                </tr>
              </thead>
              <tbody>
                {model.holdings.map((holding) => (
                  <tr key={`${holding.code || holding.etf}-${holding.cls}`} style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                    <td style={{ padding: "9px 8px", fontWeight: 600 }}>{holding.displayName}</td>
                    <td style={{ padding: "9px 8px", color: "var(--text-dim)" }}>{holding.assetClassTag}</td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>{holding.cur}%</td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: "var(--text-dim)" }}>{holding.target}%</td>
                    <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: Math.abs(holding.diff) >= 5 ? (holding.diff > 0 ? "#a32d2d" : "#185fa5") : "#27500a" }}>
                      {holding.diff >= 0 ? "+" : ""}{holding.diff.toFixed(1)}%p
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(holding.amt)}원</td>
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
