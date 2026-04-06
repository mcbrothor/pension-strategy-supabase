import React, { useState } from "react";
import { Card, ST, Badge, Btn, MetaCard, ReasonBox } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { getZone, getStrat } from "../../utils/helpers.js";
import { aggregateByAssetClass, calculateIRPRiskRatio, checkRebalanceTiming, generateActionTickets, collectReasons } from "../../services/rebalanceEngine.js";

/**
 * 주문계획 패널 — 리밸런싱 판단 + 주문 제안서
 * 기존 RebalanceJudge의 3단계 워크플로우를 통합합니다.
 */
export default function OrderPlanPanel({ portfolio, vix, vixSource, vixUpdatedAt, avgCorrelation }) {
  const [checked, setChecked] = useState({});

  const z = getZone(vix);
  const s = getStrat(portfolio.strategy);
  const total = portfolio.total || 0;

  // 리밸런싱 판단
  const timing = checkRebalanceTiming(portfolio.lastRebalDate, portfolio.rebalPeriod);
  const assetClassResults = aggregateByAssetClass(portfolio.holdings, total);
  const irpRiskRatio = calculateIRPRiskRatio(assetClassResults);

  // ActionTicket 생성 (주문 제안서 핵심)
  const tickets = generateActionTickets(assetClassResults, {
    vix, stopLoss: portfolio.stopLoss, mdd: portfolio.mdd, mddLimit: portfolio.mddLimit,
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

  return (
    <div>
      {/* 요약 카드 */}
      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>주문 제안서</div>
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
      </Card>

      {/* 판단 근거 */}
      <Card>
        <ST>종합 판단 근거</ST>
        {reasons.map((r, i) => <ReasonBox key={i} {...r} />)}
      </Card>

      {/* 주문 상세 — 체크리스트 */}
      {actionTickets.length > 0 && (
        <Card>
          <ST>실행 체크리스트 ({doneCount} / {actionTickets.length} 완료)</ST>
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
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.actionType === 'sell' ? "#a32d2d" : "#185fa5", flexShrink: 0 }}>
                  {t.actionType === 'sell' ? '-' : '+'}{fmt(t.amount)}원
                </div>
              </div>
            );
          })}

          {doneCount === actionTickets.length && actionTickets.length > 0 && (
            <div style={{ background: "var(--alert-ok-bg)", borderRadius: 8, padding: 12, textAlign: "center", marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--alert-ok-color)" }}>✅ 모든 주문 완료!</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                다음 리밸런싱 예정일: {new Date(Date.now() + timing.required * 86400000).toLocaleDateString("ko-KR")}
              </div>
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
