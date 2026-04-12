import React, { useState, useEffect } from "react";
import { Card, ST, Badge, MetaCard } from "../common/index.jsx";
import { fmtP } from "../../utils/formatters.js";
import { getStrat } from "../../utils/helpers.js";
import { RISK_DATA, ASSET_COLORS } from "../../constants/index.js";
import { generateRiskReport } from "../../services/riskEngine.js";

// Recharts for MDD chart
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

/**
 * 리스크 패널 — 전문 리스크 지표 화면
 * 변동성, 샤프, Sortino, CVaR, 리스크 기여도를 기간별(1Y/3Y/전체)로 제공합니다.
 */
export default function RiskPanel({ portfolio }) {
  const [period, setPeriod] = useState("1Y"); // '1Y' | '3Y' | 'all'
  const [historicalData, setHistoricalData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const s = getStrat(portfolio.strategy);
  const total = portfolio.holdings.reduce((sum, h) => sum + (Number(h.amt) || 0), 0) || portfolio.total || 0;
  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round((h.amt || 0) / total * 1000) / 10 : 0;
    return { ...h, cur };
  });
  const historyEligibleHoldings = holdings.filter(h => h.code && h.code !== "CASH" && h.cls !== "현금MMF");

  const isOverseasTicker = (ticker) => {
    const code = String(ticker || "").trim().toUpperCase();
    if (!code) return false;
    return !/^[0-9A-Z]{6}$/.test(code);
  };

  useEffect(() => {
    if (!historyEligibleHoldings || historyEligibleHoldings.length === 0) return;
    let isMounted = true;
    
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const promises = historyEligibleHoldings.map(async h => {
           const isOverseas = isOverseasTicker(h.code);
           try {
             const res = await fetch(`/api/kis-history?ticker=${h.code}&type=${isOverseas ? "overseas" : "domestic"}`);
             if (!res.ok) return null;
             return await res.json();
           } catch (e) {
             console.warn(`History fetch failed for ${h.code}:`, e.message);
             return null;
           }
        });
        
        const results = await Promise.allSettled(promises);
        const validData = results
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value)
          .filter(d => d.prices && d.prices.length >= 2);
        
        if (isMounted) setHistoricalData(validData);
      } catch (e) {
        console.error("리스크 패널 히스토리 로드 실패:", e.message);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    };
    
    fetchHistory();
    return () => { isMounted = false; };
  }, [portfolio.strategy, historyEligibleHoldings.map(h => h.code).join("|")]);

  const annualExpRet = s?.annualRet?.base || 0.08;
  const report = generateRiskReport(holdings, annualExpRet, period, historicalData);
  const validHistoryCount = historicalData?.length || 0;

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
        <MetaCard
          label="기대 변동성(σ)"
          value={<span data-testid="risk-vol">{fmtP(report.metrics.vol)}</span>}
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
          label="MDD"
          value={`-${report.metrics.mdd ? report.metrics.mdd.toFixed(1) : 0}%`}
          sub="최대 낙폭"
          subColor={report.metrics.mdd > 15 ? "var(--alert-danger-color)" : "var(--text-dim)"}
        />
        <MetaCard
          label="CVaR(95%)"
          value={`-${report.metrics.cvar.toFixed(1)}%`}
          sub="최대 예상 일간손실(연율화)"
          subColor="var(--alert-danger-color)"
        />
      </div>

      {loadingHistory && <div style={{ fontSize: 12, padding: 10, color: "var(--text-dim)" }}>실시간 가격 데이터를 수집중입니다...</div>}
      {!loadingHistory && (
        <div style={{ fontSize: 11, padding: "8px 10px", marginBottom: 12, borderRadius: 8, background: "var(--bg-main)", color: "var(--text-dim)", lineHeight: 1.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
            <span>
              <span data-testid="risk-calc-basis">
              계산 기준: {report.calcMode === "realized" ? `실현 데이터 기반 (${validHistoryCount}개 종목 가격 반영)` : "자산군 평균값 추정 기반"}
              {report.calcMode !== "realized" && " · KIS 과거 시세가 부족하거나 조회 실패 시 추정치로 표시됩니다."}
              </span>
            </span>
            {historyEligibleHoldings.length > validHistoryCount && (
              <span style={{ color: "var(--alert-warn-color)", fontWeight: 500 }}>
                제외된 자산: {historyEligibleHoldings.filter(h => !historicalData?.find(d => d.ticker === h.code)).map(h => h.etf || h.code).join(", ")}
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
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="day" stroke="#ffffff40" fontSize={10} tickFormatter={v => `${v}일`} />
                <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={v => `${v.toFixed(0)}%`} domain={['dataMin - 2', 0]} />
                <Tooltip 
                  formatter={(v) => [`${v.toFixed(1)}%`, 'Drawdown']} 
                  labelFormatter={(v) => `최근 ${chartData.length - v}일 전`}
                  contentStyle={{ backgroundColor: "#1e1e1e", border: "none", borderRadius: 8 }}
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
        <ST>리스크 기여도 분석</ST>
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
    </div>
  );
}
