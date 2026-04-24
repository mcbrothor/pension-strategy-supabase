import React, { useState } from "react";
import { Card, ST, Badge, MetaCard, ReasonBox, Btn } from "../common/index.jsx";
import MarketDataBadge from "../common/MarketDataBadge.jsx";
import OverlaySummaryCard from "../common/OverlaySummaryCard.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { getZone, getStrat } from "../../utils/helpers.js";
import { aggregateByAssetClass, calculateIRPRiskRatio, checkRebalanceTiming, generateActionTickets, collectReasons } from "../../services/rebalanceEngine.js";
import { evaluateBuyTheFear } from "../../services/portfolioPlanningEngine.js";
import { supabase } from "../../lib/supabase.js";
import { usePortfolio } from "../../context/PortfolioContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

/**
 * 주문계획 패널 — 리밸런싱 판단 + 자산군별 조정안
 * 기존 RebalanceJudge의 3단계 워크플로우를 통합합니다.
 */
export default function OrderPlanPanel({ portfolio, vix, vixSource, vixUpdatedAt, avgCorrelation, fearGreed, yieldSpread, creditSpread, capeRatio, signalMeta }) {
  const [checked, setChecked] = useState({});
  const { updateCashDeploymentState } = usePortfolio();
  const { user } = useAuth();

  const z = getZone(vix);
  const s = getStrat(portfolio.strategy);
  const total = portfolio.total || 0;
  const overlayTargets = portfolio.strategyOverlay?.targets || {};
  const targetWeights = Object.keys(overlayTargets).length > 0
    ? overlayTargets
    : portfolio.holdings.reduce((acc, item) => {
        if (Number(item.target) > 0) acc[item.cls] = Number(item.target);
        return acc;
      }, {});

  // 리밸런싱 판단
  const timing = checkRebalanceTiming(portfolio.lastRebalDate, portfolio.rebalPeriod);
  const assetClassResults = aggregateByAssetClass(portfolio.holdings, total, {
    targetWeights,
  });
  const irpRiskRatio = calculateIRPRiskRatio(assetClassResults);
  const projectedAssetClassResults = assetClassResults.map((item) => {
    const projectedAmt = Math.max(0, (Number(item.amt) || 0) - (Number(item.actionAmt) || 0));
    const projectedCur = total > 0 ? Math.round((projectedAmt / total) * 1000) / 10 : 0;
    return { ...item, cur: projectedCur };
  });
  const projectedIrpRiskRatio = calculateIRPRiskRatio(projectedAssetClassResults);
  const fearDecision = evaluateBuyTheFear({
    baseWeights: targetWeights,
    baseCashPct: portfolio.allocationPolicy?.baseCashPct ?? 0,
    state: portfolio.allocationPolicy?.cashDeploymentState,
    signals: { vix },
    now: new Date().toISOString(),
  });

  // ActionTicket 생성 (자산군별 조정안 핵심)
  const tickets = generateActionTickets(assetClassResults, {
    vix, fearGreed, yieldSpread, stopLoss: portfolio.stopLoss, mdd: portfolio.mdd, mddLimit: portfolio.mddLimit,
    accountType: portfolio.accountType, irpRiskRatio
  });

  // 판단 근거
  const reasons = collectReasons({
    timing, vix, mdd: portfolio.mdd, mddLimit: portfolio.mddLimit,
    avgCorrelation, assetClassResults, accountType: portfolio.accountType,
    irpRiskRatio, stopLoss: portfolio.stopLoss
  });

  const sellTickets = tickets.filter(t => t.actionType === 'sell');
  const buyTickets = tickets.filter(t => t.actionType === 'buy');
  const holdTickets = tickets.filter(t => t.actionType === 'hold');
  const actionTickets = [...sellTickets, ...buyTickets];
  const doneCount = Object.values(checked).filter(Boolean).length;
  const totalSellAmount = sellTickets.reduce((sum, t) => sum + t.amount, 0);
  const totalBuyAmount = buyTickets.reduce((sum, t) => sum + t.amount, 0);
  const cashGap = totalBuyAmount - totalSellAmount;

  const [savingConfig, setSavingConfig] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  const saveDecisionAndNotify = async () => {
    setSavingConfig(true);
    try {
      // 1. Supabase Audit Log 저장
      const { error: dbError } = await supabase.from('decision_logs').insert([
        { 
          user_id: user?.id || null,
          strategy_id: portfolio.strategy,
          account_type: portfolio.accountType,
          action_summary: tickets,
          decision_reasons: reasons,
          vix_level: vix
        }
      ]);
      if (dbError) throw dbError;

      // 2. 사용자 이메일로 알림 발송 (로그인된 Supabase Auth 이메일 우선, 미설정 시 skip)
      const recipientEmail = user?.email || portfolio.notifyEmail || null;
      if (recipientEmail) {
        const subject = `[연금운용] ${portfolio.accountType} (${s.name}) 리밸런싱 실행 알림`;
        const body = `
          <h3>리밸런싱 완료 알림</h3>
          <p>계좌: ${portfolio.accountType}</p>
          <p>전략: ${s.name}</p>
          <p>실행 내역: 매수 ${buyTickets.length}건, 매도 ${sellTickets.length}건</p>
          <br/><p>결정 근거</p><ul>${reasons.map(r => `<li>${r.title}: ${r.body}</li>`).join('')}</ul>
        `;
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: recipientEmail, subject, body })
        });
      }

      setSaveComplete(true);
    } catch (err) {
      console.error("저장 또는 알림 발송 중 오류:", err);
      alert("로그 저장에 실패했습니다.");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div>
      {/* 요약 카드 */}
      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>자산군별 조정안</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <Badge c="var(--alert-ok-color)" bg="var(--alert-ok-bg)">{s.name}</Badge>
              <Badge c={timing.isOverdue ? "var(--alert-danger-color)" : "var(--text-dim)"} bg={timing.isOverdue ? "var(--alert-danger-bg)" : "var(--bg-main)"}>{timing.elapsed}일 경과</Badge>
              <Badge c="var(--text-dim)" bg="var(--bg-main)">{portfolio.accountType}</Badge>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>마지막 리밸런싱</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{portfolio.lastRebalDate}</div>
          </div>
        </div>

        {/* 리밸런싱 타이밍 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "0.5px solid var(--border-glass)", marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: timing.isOverdue ? "var(--alert-danger-bg)" : timing.isTime ? "var(--alert-warn-bg)" : "var(--alert-ok-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: timing.isOverdue ? "#a32d2d" : timing.isTime ? "#ba7517" : "#3b6d11" }}>{timing.progressPct}%</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: timing.isOverdue ? "#a32d2d" : timing.isTime ? "#ba7517" : "var(--text-main)" }}>
              {timing.isOverdue ? "리밸런싱 기준일 도달 — 즉시 실행 권장" : timing.isTime ? "리밸런싱 시점 도달" : `다음 리밸런싱까지 ${timing.required - timing.elapsed}일`}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>주기: {portfolio.rebalPeriod} ({timing.required}일)</div>
          </div>
        </div>

        {/* 실행 요약 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <MetaCard label="매도" value={`${sellTickets.length}건`} sub={sellTickets.length > 0 ? `${fmt(sellTickets.reduce((s, t) => s + t.amount, 0))}원` : "—"} subColor="var(--alert-danger-color)" />
          <MetaCard label="매수" value={`${buyTickets.length}건`} sub={buyTickets.length > 0 ? `${fmt(buyTickets.reduce((s, t) => s + t.amount, 0))}원` : "—"} subColor="var(--alert-info-color)" />
          <MetaCard label="유지" value={`${holdTickets.length}건`} />
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-main)", borderRadius: 8, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
          자산군별 조정 금액입니다. ETF별 매매 종목과 수량은 별도로 결정하세요.
          {actionTickets.length > 0 && (
            <div style={{ marginTop: 4, color: cashGap > 0 ? "var(--alert-warn-color)" : "var(--text-dim)" }}>
              매수 필요액 {fmt(totalBuyAmount)}원 / 매도 참고액 {fmt(totalSellAmount)}원
              {cashGap > 0 ? ` → 추가 현금 약 ${fmt(cashGap)}원 필요 가능` : " → 매도 참고액 범위 내"}
            </div>
          )}
          {portfolio.accountType === "IRP" && (
            <div style={{ marginTop: 4, color: projectedIrpRiskRatio > 70 ? "var(--alert-danger-color)" : "var(--text-dim)" }}>
              IRP 위험자산 현재 {irpRiskRatio}% / 주문 후 예상 {projectedIrpRiskRatio}% {projectedIrpRiskRatio > 70 ? "→ 한도 초과 가능" : ""}
            </div>
          )}
        </div>
      </Card>

      {portfolio.strategyOverlay && (
        <Card>
          <OverlaySummaryCard
            overlay={portfolio.strategyOverlay}
            title="주문 기준 오버레이"
          />
        </Card>
      )}

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <ST>Buy the Fear 현금 운용</ST>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <MarketDataBadge meta={signalMeta} fallbackText="시그널 메타 없음" />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <Badge c="#0c447c" bg="#e6f1fb">평시 현금 {portfolio.allocationPolicy?.baseCashPct ?? 0}%</Badge>
              <Badge c={fearDecision.action === "deploy_cash" ? "#633806" : fearDecision.action === "restore_base_cash" ? "#27500a" : "#555"} bg={fearDecision.action === "deploy_cash" ? "#faeeda" : fearDecision.action === "restore_base_cash" ? "#eaf3de" : "var(--bg-main)"}>
                {fearDecision.action === "deploy_cash" ? `${fearDecision.level}차 현금 투입` : fearDecision.action === "restore_base_cash" ? "평시 현금 복구" : fearDecision.action === "wait_for_confirmation" ? "확인 대기" : "대기"}
              </Badge>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>
              {fearDecision.reasons.map((reason) => <div key={reason}>• {reason}</div>)}
              <div>• 보조 신호: CAPE {capeRatio != null ? capeRatio.toFixed(2) : "N/A"} / HY Spread {creditSpread != null ? creditSpread.toFixed(2) : "N/A"} / 10Y-2Y {yieldSpread != null ? yieldSpread.toFixed(2) : "N/A"}</div>
              {fearDecision.deploymentPct > 0 && (
                <div style={{ marginTop: 4, color: "#633806", fontWeight: 600 }}>
                  이번 단계 투입 비중: {fearDecision.deploymentPct.toFixed(1)}%p
                </div>
              )}
            </div>
          </div>
          {fearDecision.action !== "hold" && (
            <Btn sm onClick={() => updateCashDeploymentState(fearDecision.nextState)}>
              현금 운용 상태 기록
            </Btn>
          )}
        </div>
      </Card>

      {/* 판단 근거 */}
      <Card>
        <ST>종합 판단 근거</ST>
        {reasons.map((r, i) => <ReasonBox key={i} {...r} />)}
      </Card>

      {/* 주문 상세 — 체크리스트 */}
      {actionTickets.length > 0 && (
        <Card>
          <div data-testid="asset-class-action-list">
          <ST>자산군별 조정 체크리스트 ({doneCount} / {actionTickets.length} 완료)</ST>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 10 }}>
            아래 금액은 자산군 단위의 증감 목표입니다. 같은 자산군 안에서 어떤 ETF를 사고팔지는 별도로 판단할 수 있도록 ETF별 주문 금액은 제시하지 않습니다.
          </div>
          {actionTickets.map((t, i) => {
            const key = `t${i}`;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < actionTickets.length - 1 ? "0.5px solid var(--border-glass)" : "none", opacity: checked[key] ? 0.5 : 1 }}>
                <input type="checkbox" checked={!!checked[key]} onChange={e => setChecked(p => ({ ...p, [key]: e.target.checked }))} style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                <div style={{ fontSize: 11, fontWeight: 700, minWidth: 20, color: t.actionType === 'sell' ? "var(--alert-danger-color)" : "var(--alert-info-color)" }}>
                  #{t.priority}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, textDecoration: checked[key] ? "line-through" : "none" }}>{t.assetClass}</span>
                    <Badge c={t.actionType === 'sell' ? "var(--alert-danger-color)" : "var(--alert-info-color)"} bg={t.actionType === 'sell' ? "var(--alert-danger-bg)" : "var(--alert-info-bg)"}>{t.actionType === 'sell' ? '매도' : '매수'}</Badge>
                    {t.splitPlan > 1 && <Badge c="var(--alert-warn-color)" bg="var(--alert-warn-bg)">{t.splitPlan}회 분할</Badge>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
                    {t.reasons.map((r, ri) => <div key={ri}>• {r}</div>)}
                    <div>
                      • MTS 참고:{" "}
                      {t.splitPlan > 1
                        ? `${t.splitPlan}회 분할 · 1회당 약 ${fmt(Math.round(t.amount / t.splitPlan / 10000) * 10000)}원`
                        : `약 ${fmt(Math.round(t.amount / 10000) * 10000)}원`}
                      {t.amount < 50000 && " · MTS 최소 주문금액 확인 필요"}
                    </div>
                  </div>
                </div>
                <div data-testid="asset-class-action-amount" style={{ fontSize: 15, fontWeight: 600, color: t.actionType === 'sell' ? "#a32d2d" : "#185fa5", flexShrink: 0 }}>
                  {t.actionType === 'sell' ? '-' : '+'}{fmt(t.amount)}원
                </div>
              </div>
            );
          })}
          </div>

          {doneCount === actionTickets.length && actionTickets.length > 0 && (
            <div style={{ background: "var(--alert-ok-bg)", borderRadius: 8, padding: 12, textAlign: "center", marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--alert-ok-color)" }}>✅ 모든 주문 완료!</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                다음 리밸런싱 예정일: {new Date(Date.now() + timing.required * 86400000).toLocaleDateString("ko-KR")}
              </div>
              <button 
                onClick={saveDecisionAndNotify} 
                disabled={savingConfig || saveComplete}
                style={{ 
                  marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "none", 
                  cursor: savingConfig || saveComplete ? "not-allowed" : "pointer",
                  background: saveComplete ? "var(--border-glass)" : "var(--primary-color)", 
                  color: "#fff", fontWeight: 600 
                }}
              >
                {saveComplete ? "로그 저장 및 알림 발송 완료" : savingConfig ? "저장 중..." : "자산군 조정 로그 저장하기 & 메일 알림"}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* 유지 종목 */}
      {holdTickets.length > 0 && (
        <Card>
          <ST>유지 종목</ST>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {holdTickets.map((t, i) => (
              <div key={i} style={{ background: "var(--alert-ok-bg)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "var(--alert-ok-color)" }}>{t.assetClass}</span>
                <span style={{ color: "#3b6d11", marginLeft: 8 }}>{t.reasons[0]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
