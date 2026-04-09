import React, { useState, useEffect } from "react";
import StrategySelect from "./StrategySelect.jsx";
import CompareWeights from "./CompareWeights.jsx";
import { Card, ST, Badge, MetaCard } from "../common/index.jsx";
import { runBacktest } from "../../services/backtestEngine.js";
import { runWalkForward } from "../../services/walkForwardEngine.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/**
 * 전략검증 패널 — 전략 선택 + 비중 비교
 * 2단계에서 백테스트/OOS/워크포워드 분석이 추가될 예정입니다.
 */
export default function ValidationPanel({ portfolio, accountType, onStrategyApply }) {
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  
  const holdings = portfolio.holdings.map(h => ({ ...h }));

  const runValidation = async () => {
    if (!holdings || holdings.length === 0) return;
    setLoading(true);
    setResults(null);
    try {
      const promises = holdings.map(async h => {
         const isOverseas = ["미국주식", "해외채권", "원자재", "금"].includes(h.cls);
         const res = await fetch(`/api/kis-history?ticker=${h.code}&type=${isOverseas ? "overseas" : "domestic"}`);
         if (!res.ok) return null;
         const json = await res.json();
         return json;
      });
      const dataResults = await Promise.all(promises);
      const validData = dataResults.filter(d => d && d.prices && d.prices.length > 5);
      
      setHistoryData(validData);

      if (validData.length > 0) {
        const bt = runBacktest(validData, holdings);
        const wf = runWalkForward(validData, holdings);
        setResults({ bt, wf });
      }

    } catch (e) {
      console.error("검증 데이터 로드 실패", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* 전략 선택 */}
      <StrategySelect accountType={accountType} onStrategyApply={onStrategyApply} />

      {/* 비중 비교 */}
      <CompareWeights portfolio={portfolio} />

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
      </Card>

      {/* 백테스트 결과 */}
      {results && results.bt && (
        <Card>
          <ST>📈 백테스트 결과 (수수료 및 슬리피지 감안)</ST>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
            <MetaCard label="최종 자산" value={`${(results.bt.finalValue).toLocaleString()} 원`} sub={`원금: ${(results.bt.initialCapital).toLocaleString()}원`} subColor="var(--text-dim)"/>
            <MetaCard label="누적 수익률" value={`${results.bt.totalReturn}%`} subColor={results.bt.totalReturn > 0 ? "var(--alert-ok-color)" : "var(--alert-danger-color)"} />
            <MetaCard label="연평균성장률(CAGR)" value={`${results.bt.cagr}%`} subColor={results.bt.cagr > 0 ? "var(--text-main)" : "var(--alert-danger-color)"} />
          </div>

          <div style={{ width: "100%", height: 250, marginTop: 20 }}>
            <ResponsiveContainer>
              <LineChart data={results.bt.equityCurve} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="day" stroke="#ffffff40" fontSize={10} tickFormatter={(v) => `${v}일차`} />
                <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} domain={['auto', 'auto']} />
                <Tooltip 
                  formatter={(v) => [`${Math.round(v).toLocaleString()}원`, '평가금액']} 
                  labelFormatter={(v) => `진행 ${v}일차`}
                  contentStyle={{ backgroundColor: "#1e1e1e", border: "none", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--primary-color)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
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
