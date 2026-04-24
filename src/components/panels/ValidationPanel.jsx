import React, { useState } from "react";
import StrategySelect from "./StrategySelect.jsx";
import CustomPortfolioBuilder from "./CustomPortfolioBuilder.jsx";
import CompareWeights from "./CompareWeights.jsx";
import OverlaySummaryCard from "../common/OverlaySummaryCard.jsx";
import { Card, ST, Badge, MetaCard } from "../common/index.jsx";
import { buildProxyBenchmarkCurve, calculateRollingExcessStats, runBacktest } from "../../services/backtestEngine.js";
import { runRollingWalkForward, runWalkForward } from "../../services/walkForwardEngine.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { buildBenchmarkCurveFromHistory, fetchBenchmarkHistory } from "../../services/benchmarkService.js";

/**
 * 전략검증 패널
 * 
 * 왜 이 패널이 있는가:
 * - 전략 선택/변경 UI
 * - 벤치마크 비중 비교
 * - 백테스트 및 Walk-Forward 검증
 * 을 한 곳에서 제공하여 사용자가 전략의 실효성을 직접 확인할 수 있게 합니다.
 */
export default function ValidationPanel({ portfolio, accountType, onStrategyApply, strategy }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  // alert() 대신 인라인 상태 메시지로 UX 개선
  const [statusMessage, setStatusMessage] = useState(null);
  
  const holdings = portfolio.holdings.map(h => ({ ...h }));

  const runValidation = async () => {
    if (!holdings || holdings.length === 0) {
      setStatusMessage({ type: 'warn', text: '포트폴리오에 보유 종목이 없습니다. 먼저 종목을 입력해주세요.' });
      return;
    }
    setLoading(true);
    setResults(null);
    setStatusMessage(null);
    
    try {
      // 각 종목별 과거 가격 데이터를 개별 try-catch로 감싸 일부 실패에도 진행
      const promises = holdings.map(async h => {
        try {
          const isOverseas = ["미국 주식", "실물자산"].includes(h.cls);
          // 현금 등 코드가 없는 자산은 건너뜀
          if (!h.code) return null;
          const res = await fetch(`/api/kis-history?ticker=${h.code}&type=${isOverseas ? "overseas" : "domestic"}`);
          if (!res.ok) return null;
          const json = await res.json();
          return json;
        } catch(e) {
          console.warn(`가격 데이터 로드 실패: ${h.code}`, e);
          return null;
        }
      });
      
      const dataResults = await Promise.all(promises);
      const validData = dataResults.filter(d => d && d.prices && d.prices.length > 5);

      if (validData.length === 0) {
        setStatusMessage({ type: 'error', text: '유효한 가격 데이터를 가져오지 못했습니다. 네트워크 상태나 API 응답을 확인하세요.' });
        return;
      }

      // 일부 종목만 로드된 경우 경고
      const failedCount = holdings.filter(h => h.code).length - validData.length;
      if (failedCount > 0) {
        setStatusMessage({ type: 'warn', text: `${failedCount}개 종목의 가격 데이터를 불러오지 못해 일부 자산만으로 검증합니다.` });
      }

      const [benchmarkHistory, bt, wf, rollingWf] = await Promise.all([
        fetchBenchmarkHistory(strategy, "ALL", validData[0]?.prices?.length || null).catch(() => null),
        Promise.resolve(runBacktest(validData, holdings)),
        Promise.resolve(runWalkForward(validData, holdings)),
        Promise.resolve(runRollingWalkForward(validData, holdings)),
      ]);
      
      if (bt && wf) {
        const actualBenchmarkCurve = buildBenchmarkCurveFromHistory(benchmarkHistory, bt.initialCapital, bt.equityCurve.length);
        const benchmarkCurve = actualBenchmarkCurve.length > 1
          ? actualBenchmarkCurve
          : buildProxyBenchmarkCurve(bt.equityCurve.length, bt.initialCapital, strategy?.benchmark === "balanced_60_40" ? 0.075 : 0.1);
        const rolling3y = calculateRollingExcessStats(bt.equityCurve, benchmarkCurve, 252 * 3);
        const rolling1y = calculateRollingExcessStats(bt.equityCurve, benchmarkCurve, 252);
        setResults({ bt, wf, rollingWf, benchmarkCurve, benchmarkSource: actualBenchmarkCurve.length > 1 ? "actual" : "proxy", rolling3y, rolling1y });
        if (!statusMessage) {
          setStatusMessage({ type: 'ok', text: `${validData.length}개 자산의 가격 데이터로 검증 완료` });
        }
      } else {
        setStatusMessage({ type: 'error', text: '백테스트 계산에 실패했습니다. 가격 데이터 품질이 부족할 수 있습니다.' });
      }

    } catch (e) {
      console.error("검증 실행 중 에러", e);
      setStatusMessage({ type: 'error', text: '검증 프로세스 중 예기치 않은 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // 상태 메시지 스타일 맵
  const msgStyles = {
    ok:    { bg: 'var(--alert-ok-bg, #eaf3de)',    color: 'var(--alert-ok-color, #27500a)',    icon: '✓' },
    warn:  { bg: 'var(--alert-warn-bg, #faeeda)',   color: 'var(--alert-warn-color, #633806)',  icon: '⚠' },
    error: { bg: 'var(--alert-danger-bg, #fcebeb)', color: 'var(--alert-danger-color, #791f1f)', icon: '✕' },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* 전략 선택 */}
      <StrategySelect accountType={accountType} onStrategyApply={onStrategyApply} />

      {/* 커스텀 포트폴리오 빌더 */}
      <CustomPortfolioBuilder />

      {/* 비중 비교 */}
      <CompareWeights portfolio={portfolio} />

      {portfolio.strategyOverlay && (
        <Card>
          <OverlaySummaryCard
            overlay={portfolio.strategyOverlay}
            title="검증 기준 오버레이"
          />
        </Card>
      )}

      {/* 백테스트 실행 컨트롤 */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <ST style={{ marginBottom: 4 }}>📊 백테스트 및 퀀트 검증</ST>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>과거 데이터를 통해 포트폴리오를 시뮬레이션하고 과최적화 여부를 진단합니다.</div>
          </div>
          <button 
            onClick={runValidation} 
            disabled={loading || holdings.length === 0}
            style={{ 
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer",
              background: "var(--primary-color)", color: "#fff", fontWeight: 600, fontFamily: "var(--font-sans)"
            }}
          >
            {loading ? "검증 진행 중..." : "전략 검증 실행"}
          </button>
        </div>
        {/* 인라인 상태 메시지 (alert() 대체) */}
        {statusMessage && (
          <div style={{ 
            marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: msgStyles[statusMessage.type]?.bg, 
            color: msgStyles[statusMessage.type]?.color,
            display: "flex", alignItems: "center", gap: 8
          }}>
            <span style={{ fontSize: 14 }}>{msgStyles[statusMessage.type]?.icon}</span>
            {statusMessage.text}
          </div>
        )}
      </Card>

      {/* 백테스트 결과 */}
      {results && results.bt && (
        <Card>
          <ST>📈 백테스트 결과 (수수료 및 슬리피지 감안)</ST>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
            <MetaCard label="최종 자산" value={`${(results.bt.finalValue).toLocaleString()} 원`} sub={`원금: ${(results.bt.initialCapital).toLocaleString()}원`} subColor="var(--text-dim)"/>
            <MetaCard label="누적 수익률" value={`${results.bt.totalReturn}%`} subColor={results.bt.totalReturn > 0 ? "var(--alert-ok-color)" : "var(--alert-danger-color)"} />
            <MetaCard label="CAGR" value={`${results.bt.cagr}%`} subColor={results.bt.cagr > 0 ? "var(--text-main)" : "var(--alert-danger-color)"} />
            <MetaCard label="MDD" value={`${results.bt.mdd}%`} subColor={results.bt.mdd < -10 ? "var(--alert-danger-color)" : "var(--text-dim)"} />
          </div>

          <div style={{ width: "100%", height: 250, marginTop: 20 }}>
            <ResponsiveContainer>
              <LineChart data={results.bt.equityCurve.map((point, index) => ({
                ...point,
                benchmark: results.benchmarkCurve?.[index]?.value || null,
              }))} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="day" stroke="#ffffff40" fontSize={10} tickFormatter={(v) => `${v}일차`} />
                <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} domain={['auto', 'auto']} />
                <Tooltip 
                  formatter={(v, key) => [`${Math.round(v).toLocaleString()}원`, key === "benchmark" ? '벤치마크' : '평가금액']} 
                  labelFormatter={(v) => `진행 ${v}일차`}
                  contentStyle={{ backgroundColor: "#1e1e1e", border: "none", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--primary-color)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="benchmark" stroke="#ba7517" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
            <MetaCard label="Rolling 1Y Excess +" value={results.rolling1y?.positiveRatio != null ? `${Math.round(results.rolling1y.positiveRatio * 100)}%` : "-"} sub="벤치마크 초과 비율" />
            <MetaCard label="Rolling 3Y Excess +" value={results.rolling3y?.positiveRatio != null ? `${Math.round(results.rolling3y.positiveRatio * 100)}%` : "-"} sub="벤치마크 초과 비율" />
            <MetaCard label="Deflated Sharpe" value={results.rollingWf?.deflatedSharpe != null ? String(results.rollingWf.deflatedSharpe) : String(results.wf.deflatedSharpe ?? "-")} sub={`강건성 추정 · ${results.benchmarkSource === "actual" ? "실제 BM" : "프록시 BM"}`} />
          </div>
        </Card>
      )}

      {/* Walk-Forward 검증 결과 */}
      {results && results.wf && (
        <Card>
          <ST>🔬 Walk-Forward 테스트 (OOS 분리 검증)</ST>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
            In-Sample(과거 50%)과 Out-Of-Sample(최근 50%)을 분리하여 전략의 과최적화를 검사합니다.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "center" }}>
            <div style={{ padding: 12, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border-glass)" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>In-Sample (과거) CAGR</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{results.wf.isResult.cagr}%</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border-glass)" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Out-of-Sample (최근) CAGR</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{results.wf.oosResult.cagr}%</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-main)", borderRadius: 8, border: `1px solid ${results.wf.status.includes('Pass') ? 'var(--alert-ok-color)' : 'var(--alert-danger-color)'}` }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>모델 강건성 (Robustness)</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: results.wf.status.includes('Pass') ? "var(--alert-ok-color)" : "var(--alert-danger-color)" }}>
                {results.wf.status} ({results.wf.robustness})
              </div>
            </div>
          </div>
          {results.rollingWf && (
            <div style={{ marginTop: 14, padding: 12, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border-glass)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Rolling Walk-Forward 요약</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.7 }}>
                Fold 수 {results.rollingWf.foldCount} · 평균 robustness {results.rollingWf.robustness} · Deflated Sharpe {results.rollingWf.deflatedSharpe}
              </div>
            </div>
          )}
        </Card>
      )}

      {!results && !loading && (
        <Card>
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-dim)" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🚀</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>현재 보유비중 및 전략 기준으로 검증을 실행합니다.</div>
          </div>
        </Card>
      )}
    </div>
  );
}
