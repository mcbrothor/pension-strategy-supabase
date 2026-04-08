import React from "react";
import { Card, ST, Badge, Btn, MetaCard, AllocBar, VixBar, ReasonBox } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { getZone, getStrat } from "../../utils/helpers.js";
import { ASSET_COLORS, RISK_DATA } from "../../constants/index.js";
import { estimateRiskMetrics } from "../../services/riskEngine.js";
import { aggregateByAssetClass, calculateIRPRiskRatio, checkRebalanceTiming, generateActionTickets, collectReasons } from "../../services/rebalanceEngine.js";
import { calculateCompositeSplit } from "../../services/rebalanceEngine.js";

/**
 * 일일점검 패널 — 기본 진입 화면
 * "오늘의 실행안"을 최상단에 배치하여 즉각적인 의사결정을 지원합니다.
 */
export default function DailyCheckPanel({
  portfolio, vix, vixSource, vixUpdatedAt, vixLoading, vixError,
  masterError, onFetchVix, onGo,
  avgCorrelation, corrUpdatedAt, corrLoading, onRefreshCorr,
  degradedMode, targetSource,
  // 2단계: 복합 시장 시그널
  fearGreed, yieldSpread, unemployment, signalsLoading, signalsError, onRefreshSignals
}) {
  const z = getZone(vix);
  const s = getStrat(portfolio.strategy);
  const total = portfolio.total || 0;

  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    return { ...h, cur, diff: Math.round((cur - h.target) * 10) / 10 };
  });

  // 리스크 지표
  const annualExpRet = s?.annualRet?.base || 0.08;
  const riskMetrics = estimateRiskMetrics(holdings, RISK_DATA, annualExpRet);

  // 리밸런싱 판단
  const timing = checkRebalanceTiming(portfolio.lastRebalDate, portfolio.rebalPeriod);
  const assetClassResults = aggregateByAssetClass(holdings, total);
  const irpRiskRatio = calculateIRPRiskRatio(assetClassResults);

  // ActionTicket 생성 — 복합 시그널 전달
  const fgScore = fearGreed?.score ?? null;
  const ysSpread = yieldSpread?.spread ?? null;
  const tickets = generateActionTickets(assetClassResults, {
    vix, fearGreed: fgScore, yieldSpread: ysSpread,
    stopLoss: portfolio.stopLoss, mdd: portfolio.mdd, mddLimit: portfolio.mddLimit,
    accountType: portfolio.accountType, irpRiskRatio
  });
  const compositeSplit = calculateCompositeSplit(vix, fgScore, ysSpread);

  const sellTickets = tickets.filter(t => t.actionType === 'sell');
  const buyTickets = tickets.filter(t => t.actionType === 'buy');
  const holdTickets = tickets.filter(t => t.actionType === 'hold');

  // 판단 근거
  const reasons = collectReasons({
    timing, vix, mdd: portfolio.mdd, mddLimit: portfolio.mddLimit,
    avgCorrelation, assetClassResults, accountType: portfolio.accountType,
    irpRiskRatio, stopLoss: portfolio.stopLoss
  });

  const urgentReasons = reasons.filter(r => r.type === 'danger');
  const needsAction = timing.isOverdue || timing.isTime || sellTickets.length > 0 || buyTickets.length > 0;

  return (
    <div>
      {/* 에러 표시 */}
      {(vixError || masterError) && (
        <div style={{ backgroundColor: "var(--alert-danger-bg)", border: "1px solid #a32d2d", borderRadius: 8, padding: "10px 15px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 12, color: "#a32d2d", fontWeight: 500 }}>
            {vixError && <div>VIX 데이터 오류: {vixError}</div>}
            {masterError && <div>종목 마스터 오류: {masterError}</div>}
          </div>
          <Btn sm onClick={onFetchVix} style={{ marginLeft: "auto", borderColor: "#a32d2d", color: "#a32d2d" }}>재시도</Btn>
        </div>
      )}

      {/* 폴백 경고 */}
      {degradedMode && (
        <div style={{ backgroundColor: "var(--alert-warn-bg)", border: "1px solid #d97706", borderRadius: 8, padding: "10px 15px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div style={{ fontSize: 12, color: "var(--alert-warn-color)", fontWeight: 500 }}>
            모멘텀 데이터 {targetSource === 'fallback_last' ? '직전 유효 타깃' : '전략 기본 비중'}으로 표시 중 (API 응답 지연)
          </div>
        </div>
      )}

      {/* ===== 오늘의 실행안 (최상단 고정) ===== */}
      <Card accent={needsAction ? (urgentReasons.length > 0 ? "#a32d2d" : "#ba7517") : "#3b6d11"}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>📋 오늘의 실행안</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
              {s.name} · {portfolio.accountType} · {timing.elapsed}일 경과
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Badge c={needsAction ? "var(--alert-danger-color)" : "var(--alert-ok-color)"} bg={needsAction ? "var(--alert-danger-bg)" : "var(--alert-ok-bg)"}>
              {needsAction ? "조치 필요" : "유지"}
            </Badge>
            {degradedMode && <Badge c="var(--alert-warn-color)" bg="var(--alert-warn-bg)">폴백 모드</Badge>}
          </div>
        </div>

        {/* 실행안 요약 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "var(--alert-danger-bg)", borderRadius: 8, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--alert-danger-color)", fontWeight: 600 }}>매도</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#a32d2d" }}>{sellTickets.length}건</div>
            {sellTickets.length > 0 && <div style={{ fontSize: 10, color: "#a32d2d" }}>{fmt(sellTickets.reduce((s, t) => s + t.amount, 0))}원</div>}
          </div>
          <div style={{ background: "var(--alert-info-bg)", borderRadius: 8, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--alert-info-color)", fontWeight: 600 }}>매수</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#185fa5" }}>{buyTickets.length}건</div>
            {buyTickets.length > 0 && <div style={{ fontSize: 10, color: "#0c447c" }}>{fmt(buyTickets.reduce((s, t) => s + t.amount, 0))}원</div>}
          </div>
          <div style={{ background: "var(--alert-ok-bg)", borderRadius: 8, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--alert-ok-color)", fontWeight: 600 }}>유지</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#3b6d11" }}>{holdTickets.length}건</div>
          </div>
        </div>

        {/* 우선순위별 실행 상세 */}
        {[...sellTickets, ...buyTickets].slice(0, 5).map((t, i) => (
          <div key={i} className={`action-card ${t.actionType}`} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, minWidth: 20, color: t.actionType === 'sell' ? "var(--alert-danger-color)" : "var(--alert-info-color)" }}>
              #{t.priority}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.assetClass}</span>
                <Badge c={t.actionType === 'sell' ? "var(--alert-danger-color)" : "var(--alert-info-color)"} bg={t.actionType === 'sell' ? "var(--alert-danger-bg)" : "var(--alert-info-bg)"}>
                  {t.actionType === 'sell' ? '매도' : '매수'}
                </Badge>
                {t.splitPlan > 1 && <Badge c="var(--alert-warn-color)" bg="var(--alert-warn-bg)">{t.splitPlan}회 분할</Badge>}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
                {t.reasons[0]}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.actionType === 'sell' ? "#a32d2d" : "#185fa5", flexShrink: 0 }}>
              {t.actionType === 'sell' ? '-' : '+'}{fmt(t.amount)}원
            </div>
          </div>
        ))}

        {!needsAction && (
          <div style={{ textAlign: "center", padding: "1rem 0", color: "var(--alert-ok-color)" }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>✅ 현재 조치 사항 없음</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>다음 리밸런싱 예정일: {new Date(Date.now() + (timing.required - timing.elapsed) * 86400000).toLocaleDateString("ko-KR")}</div>
          </div>
        )}
      </Card>

      {/* ===== 핵심 판단 근거 ===== */}
      {urgentReasons.length > 0 && (
        <Card>
          <ST>⚠ 긴급 판단 근거</ST>
          {urgentReasons.map((r, i) => <ReasonBox key={i} {...r} />)}
        </Card>
      )}

      {/* ===== 시장 상황 + 자산 배분 현황 ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1rem" }}>
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
          <ST>시장 상황 진단</ST>
          <VixBar vix={vix} />
          <div style={{ backgroundColor: z.bg, borderRadius: "var(--radius-md)", padding: ".875rem 1rem", marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Badge c={z.color} bg={z.color + "20"}>{z.mode}</Badge>
              {vixUpdatedAt && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(vixUpdatedAt).toLocaleString()} 업데이트</span>}
            </div>
            <span style={{ fontSize: 12, color: z.color, lineHeight: 1.7 }}>{z.desc}</span>
          </div>
          
          {/* 상관계수 */}
          <div style={{ marginTop: 12, padding: "8px 10px", background: "var(--bg-main)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              평균 상관계수: <strong>{avgCorrelation.toFixed(2)}</strong>
              {corrUpdatedAt && <span style={{ marginLeft: 6 }}>({new Date(corrUpdatedAt).toLocaleDateString()})</span>}
            </span>
            <Btn sm onClick={onRefreshCorr} disabled={corrLoading}>{corrLoading ? "…" : "갱신"}</Btn>
          </div>
        </Card>
      </div>

      {/* ===== 시장 센티먼트 대시보드 ===== */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <ST>🌍 시장 센티먼트</ST>
          <Btn sm onClick={onRefreshSignals} disabled={signalsLoading}>{signalsLoading ? "갱신 중…" : "시그널 갱신"}</Btn>
        </div>
        {signalsError && (
          <div style={{ background: "var(--alert-warn-bg)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "var(--alert-warn-color)" }}>
            시장 시그널 일부 조회 실패: {signalsError}. 표시되는 값은 마지막 성공값이거나 조회 가능한 무료 데이터만 반영된 값일 수 있습니다.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {/* Fear & Greed */}
          <div style={{ background: "var(--bg-main)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>Fear & Greed (CNN)</div>
            {fgScore !== null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: fgScore <= 24 ? "#a32d2d" : fgScore <= 44 ? "#d97706" : fgScore <= 55 ? "var(--text-main)" : fgScore <= 74 ? "#3b6d11" : "#1a73e8" }}>
                    {fgScore}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>/100</span>
                </div>
                <div style={{
                  height: 6, borderRadius: 3, marginTop: 6, background: "var(--border-glass)",
                  position: "relative", overflow: "hidden"
                }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 3,
                    width: `${fgScore}%`,
                    background: fgScore <= 24 ? "#a32d2d" : fgScore <= 44 ? "#d97706" : fgScore <= 55 ? "#888" : fgScore <= 74 ? "#3b6d11" : "#1a73e8"
                  }} />
                </div>
                <div style={{ fontSize: 10, marginTop: 4, color: fgScore <= 24 ? "#a32d2d" : fgScore <= 44 ? "#d97706" : fgScore <= 55 ? "var(--text-dim)" : "#3b6d11" }}>
                  {fearGreed?.labelKo || ""}
                  {fgScore <= 24 && " → 분할 매수 적극화"}
                  {fgScore >= 75 && " → 매수 보류 검토"}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>조회 대기 중…</div>
            )}
          </div>

          {/* 수익률 곡선 */}
          <div style={{ background: "var(--bg-main)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>수익률 곡선 10Y-2Y (FRED)</div>
            {ysSpread !== null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: ysSpread < 0 ? "#a32d2d" : ysSpread < 0.5 ? "#d97706" : "#3b6d11" }}>
                    {ysSpread >= 0 ? "+" : ""}{ysSpread.toFixed(2)}%
                  </span>
                </div>
                <div style={{ fontSize: 10, marginTop: 4, color: ysSpread < 0 ? "#a32d2d" : ysSpread < 0.5 ? "#d97706" : "var(--text-dim)" }}>
                  {yieldSpread?.statusKo || ""}
                  {ysSpread < 0 && " → 경기침체 대비, 분할 극대화"}
                </div>
                {yieldSpread?.date && <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>기준일: {yieldSpread.date}</div>}
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>조회 대기 중…</div>
            )}
          </div>

          {/* 실업률 */}
          <div style={{ background: "var(--bg-main)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>미국 실업률 (FRED)</div>
            {unemployment?.rate != null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-main)" }}>
                    {unemployment.rate}%
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>12M평균 {unemployment.avg12m}%</span>
                </div>
                <div style={{ fontSize: 10, marginTop: 4, color: unemployment.isBelow12mAvg ? "#3b6d11" : "#d97706" }}>
                  {unemployment.isBelow12mAvg ? "↓ 하향 (경기 호조)" : "↑ 상향 (경기 둔화)"}
                </div>
                {unemployment.date && <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>기준월: {unemployment.date}</div>}
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>조회 대기 중…</div>
            )}
          </div>
        </div>

        {/* 복합 판단 요약 */}
        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-main)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            복합 시그널 판단: <strong style={{ color: "var(--text-main)" }}>분할 {compositeSplit}회</strong>
            <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>
              (VIX {vix?.toFixed(1) || "…"}
              {fgScore !== null && ` + F&G ${fgScore}`}
              {ysSpread !== null && ` + 수익률곡선 ${ysSpread >= 0 ? "+" : ""}${ysSpread.toFixed(2)}%`})
            </span>
          </div>
          <Badge
            c={compositeSplit >= 5 ? "var(--alert-danger-color)" : compositeSplit >= 3 ? "var(--alert-warn-color)" : "var(--alert-ok-color)"}
            bg={compositeSplit >= 5 ? "var(--alert-danger-bg)" : compositeSplit >= 3 ? "var(--alert-warn-bg)" : "var(--alert-ok-bg)"}
          >
            {compositeSplit >= 5 ? "고위험" : compositeSplit >= 3 ? "주의" : "정상"}
          </Badge>
        </div>
      </Card>

      {/* ===== 네비게이션 ===== */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1rem" }}>
        <Btn onClick={() => onGo("risk")}>리스크 상세 →</Btn>
        <Btn onClick={() => onGo("orders")}>주문 계획 →</Btn>
        <Btn primary onClick={() => onGo("report")}>리포트 →</Btn>
      </div>
    </div>
  );
}
