import React from "react";
import { Card, ST, Badge, Btn, MetaCard, AllocBar, VixBar } from "../common/index.jsx";
import { fmt, fmtP, fmtR } from "../../utils/formatters.js";
import { getZone, getStrat } from "../../utils/helpers.js";
import { ASSET_COLORS, RISK_DATA } from "../../constants/index.js";
import { estimateRiskMetrics, calculateVixPercentile } from "../../utils/calculators.js";
import { supabase } from "../../lib/supabase.js";


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

export default function Dashboard({ portfolio, vix, vixSource, vixUpdatedAt, vixLoading, vixError, masterError, onFetchVix, onGo, avgCorrelation, corrUpdatedAt, corrLoading, onRefreshCorr }) {
  const [prevTotal, setPrevTotal] = React.useState(null);

  React.useEffect(() => {
    const fetchDiff = async () => {
      // 한 달 전 스냅샷 가져오기 (가장 최근 것 중 현재 날짜보다 25~35일 전 데이터 권장, 여기서는 단순 LIMIT)
      const { data } = await supabase
        .from("snapshots")
        .select("total_amt")
        .order("date", { ascending: false })
        .limit(2); // 0은 오늘, 1은 어제 혹은 직전
      
      if (data && data.length > 1) {
        setPrevTotal(Number(data[1].total_amt));
      }
    };
    fetchDiff();
  }, []);

  const z = getZone(vix);

  const s = getStrat(portfolio.strategy);
  const total = portfolio.total || 0;
  
  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    return { ...h, cur, diff: Math.round((cur - h.target) * 10) / 10 };
  });

  // 전문 위험 지표 계산
  const annualExpRet = s?.annualRet?.base || 0.08;
  const riskMetrics = estimateRiskMetrics(holdings, RISK_DATA, annualExpRet);
  const sharpe = riskMetrics.sharpe;
  const vol = riskMetrics.vol;

  return (
    <div>
      {(vixError || masterError) && (
        <div style={{ backgroundColor: "#fcebeb", border: "1px solid #a32d2d", borderRadius: 8, padding: "10px 15px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 12, color: "#a32d2d", fontWeight: 500 }}>
            {vixError && <div>VIX 데이터 오류: {vixError} (캐시된 데이터를 표시합니다)</div>}
            {masterError && <div>종목 마스터 오류: {masterError} (일부 기능이 제한될 수 있습니다)</div>}
          </div>
          <Btn sm onClick={onFetchVix} style={{ marginLeft: "auto", borderColor: "#a32d2d", color: "#a32d2d" }}>재시도</Btn>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: "1rem" }}>
        <MetaCard 
          label="총 평가금액" 
          value={fmt(total) + "원"} 
          sub={prevTotal ? (total - prevTotal >= 0 ? `▲${fmt(total - prevTotal)}` : `▼${fmt(Math.abs(total - prevTotal))}`) : new Date().toLocaleDateString("ko-KR")} 
          subColor={prevTotal ? (total - prevTotal >= 0 ? "var(--color-success)" : "#0c447c") : "var(--text-dim)"}
        />
        <MetaCard 
          label="현재 VIX" 
          value={vixLoading ? "…" : (vix?.toFixed(1) || "연결 중")} 
          sub={vix ? `역사적 위치: 상위 ${calculateVixPercentile(vix)}%` : z.lbl} 
          subColor={vix ? (vix > 25 ? "#a32d2d" : "var(--text-dim)") : z.color} 
        />
        <MetaCard label="기대 변동성(σ)" value={fmtP(vol)} sub="연간 추정치" />
        <MetaCard label="샤프 지수" value={sharpe.toFixed(2)} sub={sharpe > 0.8 ? "매우 우수" : sharpe > 0.4 ? "양호" : "보통"} subColor={sharpe > 0.4 ? "var(--color-success)" : "var(--text-dim)"} />
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
            <ST>시장 상황 진단 ({vixSource})</ST>
            <VixBar vix={vix} />
            <div style={{ backgroundColor: z.bg, borderRadius: "var(--radius-md)", padding: ".875rem 1rem", marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Badge c={z.color} bg={z.color + "20"}>{z.mode}</Badge>
                {vixUpdatedAt && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(vixUpdatedAt).toLocaleString()} 업데이트</span>}
              </div>
              <span style={{ fontSize: 12, color: z.color, lineHeight: 1.7 }}>{z.desc}</span>
            </div>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "0.5rem" }}>
            <Btn onClick={() => onGo("assets")}>자산 비중 조정 →</Btn>
            <Btn onClick={() => onGo("report_view")}>월간 리포트 분석 →</Btn>
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
              
              {avgCorrelation > 0.7 && (
                <div style={{ color: "#a32d2d", marginTop: 8, fontWeight: 600 }}>
                  ⚠️ 경고: 최근 자산 간 상관관계가 {avgCorrelation.toFixed(2)}로 급증했습니다. 
                  분산 효과가 낮아졌으니 현금 또는 안전 자산 비중 확대를 검토하세요.
                </div>
              )}

              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-main)", borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  평균 상관계수: <strong>{avgCorrelation.toFixed(2)}</strong> 
                  {corrUpdatedAt && <span style={{ marginLeft: 6 }}>({new Date(corrUpdatedAt).toLocaleDateString()})</span>}
                </span>
                <Btn sm onClick={onRefreshCorr} disabled={corrLoading}>{corrLoading ? "…" : "상관계수 갱신"}</Btn>
              </div>
            </div>

          </Card>
        </div>
      </div>
    </div>
  );
}
