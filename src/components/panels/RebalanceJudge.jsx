import React, { useState } from "react";
import { Card, Badge, Btn, ST, MetaCard, AllocBar, VixBar, ReasonBox } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { getZone, getStrat } from "../../utils/helpers.js";
import { ASSET_COLORS } from "../../constants/index.js";

export default function RebalanceJudge({ portfolio, vix }) {
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState({});
  const REBAL_DAYS = { "연 1회": 365, "분기 1회": 90, "월 1회": 30 };
  const required = REBAL_DAYS[portfolio.rebalPeriod] || 365;
  const elapsed = Math.floor((new Date() - new Date(portfolio.lastRebalDate)) / 86400000);
  const isOverdue = elapsed >= required, isTime = elapsed >= required * 0.9;
  const z = getZone(vix);
  const total = portfolio.total;

  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    const diff = Math.round((cur - h.target) * 10) / 10;
    const pnlPct = h.costAmt > 0 ? Math.round((h.amt - h.costAmt) / h.costAmt * 1000) / 10 : null;
    const targetAmt = Math.round(total * h.target / 100);
    const actionAmt = Math.round((h.amt - targetAmt) / 10000) * 10000;
    return { ...h, cur, diff, pnlPct, targetAmt, actionAmt };
  });

  const irpRisk = Math.round(holdings.filter(h => ["미국주식", "선진국주식", "신흥국주식", "국내주식", "금", "원자재", "부동산리츠"].includes(h.cls)).reduce((s, h) => s + h.cur, 0) * 10) / 10;
  const sells = holdings.filter(h => h.actionAmt > 5000);
  const buys = holdings.filter(h => h.actionAmt < -5000);
  const holds = holdings.filter(h => Math.abs(h.actionAmt) <= 5000);
  const stopLossItems = holdings.filter(h => h.pnlPct !== null && h.pnlPct < portfolio.stopLoss);

  const reasons = [
    { type: isOverdue ? "danger" : isTime ? "warn" : "ok", title: `리밸런싱 주기: ${portfolio.rebalPeriod} — ${elapsed}일 경과`, body: isOverdue ? `기준(${required}일) 초과 — 즉시 실행 권장.` : isTime ? `기준의 90% 도달 — 실행 시점.` : `${required - elapsed}일 후 예정.` },
    { type: vix > 35 ? "danger" : vix > 25 ? "warn" : "ok", title: `VIX ${vix.toFixed(1)} — ${z.lbl} (${z.mode})`, body: z.desc },
    { type: portfolio.mdd < portfolio.mddLimit ? "danger" : "ok", title: `MDD ${portfolio.mdd.toFixed(1)}% (제한선 ${portfolio.mddLimit}%)`, body: portfolio.mdd < portfolio.mddLimit ? "MDD 제한선 초과 — 방어 자산 비중 확보 우선." : "MDD 정상 범위. 전략 기준대로 진행하세요." },
    ...(portfolio.accountType === "IRP" ? [{ type: irpRisk > 70 ? "danger" : irpRisk > 65 ? "warn" : "ok", title: `IRP 위험자산 ${irpRisk}% (한도 70%)`, body: irpRisk > 70 ? "IRP 한도 초과. 주식·금·원자재 비중을 70% 이하로 맞추세요." : "IRP 위험자산 정상 범위." }] : []),
    ...(stopLossItems.length > 0 ? [{ type: "danger", title: `손절 경고: ${stopLossItems.map(h => h.etf).join(", ")}`, body: `손절 기준(${portfolio.stopLoss}%) 초과. 우선 매도 후 리밸런싱하세요.` }] : []),
    ...(holdings.filter(h => Math.abs(h.diff) >= 5).length > 0 ? [{ type: "warn", title: `5%p 이상 이탈: ${holdings.filter(h => Math.abs(h.diff) >= 5).length}개`, body: holdings.filter(h => Math.abs(h.diff) >= 5).map(h => `${h.etf} ${fmtP(h.diff)}`).join(" / ") }] : []),
  ];

  const tabs = ["① 실행 시점 판단", "② 판단 근거", "③ 실행 지시"];
  const doneCount = Object.values(checked).filter(Boolean).length;
  const totalActions = sells.length + buys.length;

  return (
    <div>
      <Card style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>리밸런싱 판단 센터</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <Badge c="#27500a" bg="#eaf3de">{getStrat(portfolio.strategy).name}</Badge>
              <Badge c={isOverdue ? "#791f1f" : "var(--text-dim)"} bg={isOverdue ? "#fcebeb" : "var(--bg-main)"}>{elapsed}일 경과</Badge>
              <Badge c="var(--text-dim)" bg="var(--bg-main)">{portfolio.accountType}</Badge>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>마지막 리밸런싱</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{portfolio.lastRebalDate}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
          <MetaCard label="총 평가금액" value={fmt(total) + "원"} />
          <MetaCard label="VIX" value={vix.toFixed(1)} sub={z.lbl} subColor={z.color} />
          <MetaCard label="MDD" value={portfolio.mdd.toFixed(1) + "%"} sub={"제한 " + portfolio.mddLimit + "%"} subColor={portfolio.mdd < portfolio.mddLimit ? "#a32d2d" : "#3b6d11"} />
          <MetaCard label="IRP 위험자산" value={irpRisk + "%"} sub={portfolio.accountType === "IRP" ? "한도 70%" : "-"} subColor={irpRisk > 70 ? "#a32d2d" : "#3b6d11"} />
        </div>
      </Card>

      <div style={{ display: "flex", gap: 2, borderBottom: "0.5px solid var(--border-glass)", marginBottom: "1.25rem" }}>
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setStep(i)} style={{ padding: "8px 16px", fontSize: 13, border: "none", background: "none", cursor: "pointer", color: step === i ? "var(--text-main)" : "var(--text-dim)", borderBottom: `2px solid ${step === i ? "var(--text-main)" : "transparent"}`, fontWeight: step === i ? 500 : 400, fontFamily: "var(--font-sans)", marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div>
          <Card accent={isOverdue ? "#a32d2d" : isTime ? "#ba7517" : undefined}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: isOverdue ? "#fcebeb" : isTime ? "#faeeda" : "#eaf3de", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: isOverdue ? "#a32d2d" : isTime ? "#ba7517" : "#3b6d11" }}>{elapsed}일</div>
                <div style={{ fontSize: 9, color: isOverdue ? "#a32d2d" : isTime ? "#ba7517" : "#3b6d11" }}>경과</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: isOverdue ? "#a32d2d" : isTime ? "#ba7517" : "var(--text-main)", marginBottom: 4 }}>
                  {isOverdue ? "리밸런싱 기준일 도달 — 즉시 실행 권장" : isTime ? "리밸런싱 시점 도달" : "리밸런싱 예정 — " + `${required - elapsed}일 후`}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>마지막: {portfolio.lastRebalDate} · 주기: {portfolio.rebalPeriod}({required}일)</div>
              </div>
              <div style={{ background: isOverdue ? "#fcebeb" : isTime ? "#faeeda" : "#eaf3de", borderRadius: 8, padding: ".75rem 1rem", textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 10, color: isOverdue ? "#791f1f" : isTime ? "#633806" : "#27500a" }}>진행률</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: isOverdue ? "#a32d2d" : isTime ? "#ba7517" : "#3b6d11" }}>{Math.min(Math.round(elapsed / required * 100), 100)}%</div>
              </div>
            </div>
            <div style={{ height: 6, background: "var(--bg-main)", borderRadius: 3, overflow: "hidden", margin: "1rem 0 3px" }}>
              <div style={{ height: "100%", width: `${Math.min(elapsed / required * 100, 100)}%`, background: isOverdue ? "#a32d2d" : isTime ? "#ba7517" : "#3b6d11", borderRadius: 3 }} />
            </div>
          </Card>
          <Card><ST>VIX 시장 신호</ST><VixBar vix={vix} /><div style={{ background: z.bg, borderRadius: 8, padding: ".875rem 1rem", marginTop: 10 }}><Badge c={z.color} bg={z.color + "20"}>{z.mode}</Badge><span style={{ fontSize: 12, color: z.color, marginLeft: 8 }}>{z.desc}</span></div></Card>
          <Card>
            <ST>현재 비중 편차</ST>
            {holdings.map((h, i) => <AllocBar key={i} label={h.etf} pct={h.cur} target={h.target} color={ASSET_COLORS[h.cls] || "#888"} />)}
          </Card>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn primary onClick={() => setStep(1)}>판단 근거 확인 →</Btn></div>
        </div>
      )}

      {step === 1 && (
        <div>
          <Card>
            <ST>종합 판단</ST>
            <div style={{ background: isOverdue || portfolio.mdd < portfolio.mddLimit ? "#fcebeb" : "#eaf3de", border: `0.5px solid ${isOverdue ? "#f09595" : "#c0dd97"}`, borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: isOverdue || portfolio.mdd < portfolio.mddLimit ? "#791f1f" : "#27500a", marginBottom: 5 }}>
                {portfolio.mdd < portfolio.mddLimit ? "리밸런싱 실행 — MDD 제한선 초과. 방어 자산 우선." : isOverdue ? "리밸런싱 실행 — 주기 도달. 전략 기준대로 조정하세요." : isTime ? "리밸런싱 실행 — 시점 도달. VIX 신호 참고해 집행하세요." : "리밸런싱 불필요 — 기준일까지 유지하세요."}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>{vix > 35 ? "공황 구간 — 분할 집행(3~5회) 권장." : vix > 25 ? "불안 구간 — 2~3회 분할 매수 권장." : "정상 구간 — 전략 기준대로 일괄 집행 가능."}</div>
            </div>
            {reasons.map((r, i) => <ReasonBox key={i} {...r} />)}
          </Card>
          <Card>
            <ST>자산별 판단</ST>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>{["ETF", "현재", "목표", "편차", "수익률", "판단"].map(h => <th key={h} style={{ textAlign: "left", padding: "5px 8px", fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{holdings.map((h, i) => {
                const isSL = h.pnlPct !== null && h.pnlPct < portfolio.stopLoss;
                const act = isSL ? "손절 우선" : h.actionAmt > 5000 ? "매도" : h.actionAmt < -5000 ? "매수" : "유지";
                const aC = isSL ? "#791f1f" : act === "매도" ? "#a32d2d" : act === "매수" ? "#0c447c" : "#27500a";
                const aBg = isSL ? "#fcebeb" : act === "매도" ? "#fcebeb" : act === "매수" ? "#e6f1fb" : "#eaf3de";
                return (
                  <tr key={i} style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                    <td style={{ padding: "7px 8px" }}><div style={{ fontWeight: 500 }}>{h.etf.replace(" (H)", "")}</div><div style={{ fontSize: 10, color: "var(--text-dim)" }}>{h.code}</div></td>
                    <td style={{ padding: "7px 8px", fontWeight: 500 }}>{h.cur}%</td>
                    <td style={{ padding: "7px 8px", color: "var(--text-dim)" }}>{h.target}%</td>
                    <td style={{ padding: "7px 8px", fontWeight: 600, color: Math.abs(h.diff) >= 5 ? (h.diff > 0 ? "#a32d2d" : "#0c447c") : "#27500a" }}>{fmtP(h.diff)}</td>
                    <td style={{ padding: "7px 8px", color: h.pnlPct === null ? "var(--text-dim)" : h.pnlPct < 0 ? "#a32d2d" : "#3b6d11", fontWeight: 500 }}>{h.pnlPct != null ? fmtP(h.pnlPct) : "—"}</td>
                    <td style={{ padding: "7px 8px" }}><Badge c={aC} bg={aBg}>{act}</Badge></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Card>
          <div style={{ display: "flex", justifyContent: "space-between" }}><Btn onClick={() => setStep(0)}>← 시점 판단</Btn><Btn primary onClick={() => setStep(2)}>실행 지시 확인 →</Btn></div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: "1rem" }}>
            <div style={{ background: "#fcebeb", borderRadius: 8, padding: ".875rem", textAlign: "center" }}><div style={{ fontSize: 11, color: "#791f1f", fontWeight: 600, marginBottom: 4 }}>매도</div><div style={{ fontSize: 20, fontWeight: 500, color: "#a32d2d" }}>{sells.length}건</div><div style={{ fontSize: 11, color: "#a32d2d", marginTop: 2 }}>{fmt(sells.reduce((s, h) => s + h.actionAmt, 0))}원</div></div>
            <div style={{ background: "#e6f1fb", borderRadius: 8, padding: ".875rem", textAlign: "center" }}><div style={{ fontSize: 11, color: "#0c447c", fontWeight: 600, marginBottom: 4 }}>매수</div><div style={{ fontSize: 20, fontWeight: 500, color: "#185fa5" }}>{buys.length}건</div><div style={{ fontSize: 11, color: "#0c447c", marginTop: 2 }}>{fmt(Math.abs(buys.reduce((s, h) => s + h.actionAmt, 0)))}원</div></div>
            <div style={{ background: "#eaf3de", borderRadius: 8, padding: ".875rem", textAlign: "center" }}><div style={{ fontSize: 11, color: "#27500a", fontWeight: 600, marginBottom: 4 }}>유지</div><div style={{ fontSize: 20, fontWeight: 500, color: "#3b6d11" }}>{holds.length}건</div></div>
          </div>
          {sells.length > 0 && <Card>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#791f1f", marginBottom: ".75rem" }}>매도 — 비중 초과 자산</div>
            {sells.map((h, i) => {
              const key = `s${i}`; return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < sells.length - 1 ? "0.5px solid var(--border-glass)" : "none", opacity: checked[key]?.5 : 1 }}>
                  <input type="checkbox" checked={!!checked[key]} onChange={e => setChecked(p => ({ ...p, [key]: e.target.checked }))} style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}><span style={{ fontSize: 13, fontWeight: 500, textDecoration: checked[key] ? "line-through" : "none" }}>{h.etf}</span><span style={{ fontFamily: "monospace", fontSize: 10, background: "var(--bg-main)", padding: "1px 5px", borderRadius: 3, color: "var(--text-dim)" }}>{h.code}</span><Badge c="#791f1f" bg="#fcebeb">매도</Badge></div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>현재 {h.cur}% → 목표 {h.target}% · 현재 {fmt(h.amt)}원 → 목표 {fmt(h.targetAmt)}원</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 16, fontWeight: 500, color: "#a32d2d" }}>-{fmt(h.actionAmt)}원</div></div>
                </div>
              );
            })}
          </Card>}
          {buys.length > 0 && <Card>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#0c447c", marginBottom: ".75rem" }}>매수 — 비중 부족 자산</div>
            {vix > 25 && <div style={{ background: "#faeeda", borderRadius: 8, padding: ".75rem 1rem", fontSize: 12, color: "#633806", marginBottom: "1rem" }}>VIX {vix.toFixed(1)} 불안 구간 — {vix > 35 ? "3~5회" : "2~3회"} 분할 매수 권장</div>}
            {buys.map((h, i) => {
              const key = `b${i}`; const sp = vix > 35 ? 5 : vix > 25 ? 3 : 1; return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < buys.length - 1 ? "0.5px solid var(--border-glass)" : "none", opacity: checked[key]?.5 : 1 }}>
                  <input type="checkbox" checked={!!checked[key]} onChange={e => setChecked(p => ({ ...p, [key]: e.target.checked }))} style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}><span style={{ fontSize: 13, fontWeight: 500, textDecoration: checked[key] ? "line-through" : "none" }}>{h.etf}</span><span style={{ fontFamily: "monospace", fontSize: 10, background: "var(--bg-main)", padding: "1px 5px", borderRadius: 3, color: "var(--text-dim)" }}>{h.code}</span><Badge c="#0c447c" bg="#e6f1fb">매수</Badge>{sp > 1 && <Badge c="#633806" bg="#faeeda">{sp}회 분할</Badge>}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>현재 {h.cur}% → 목표 {h.target}% · 현재 {fmt(h.amt)}원 → 목표 {fmt(h.targetAmt)}원{sp > 1 ? ` · 1회당 약 ${fmt(Math.round(Math.abs(h.actionAmt) / sp / 10000) * 10000)}원` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 16, fontWeight: 500, color: "#185fa5" }}>+{fmt(Math.abs(h.actionAmt))}원</div></div>
                </div>
              );
            })}
          </Card>}
          {holds.length > 0 && <Card><div style={{ fontSize: 11, fontWeight: 500, color: "#27500a", marginBottom: ".75rem" }}>유지</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{holds.map((h, i) => <div key={i} style={{ background: "#eaf3de", borderRadius: 8, padding: ".625rem .875rem", fontSize: 12 }}><span style={{ fontWeight: 500, color: "#27500a" }}>{h.etf.replace(" (H)", "")}</span><span style={{ color: "#3b6d11", marginLeft: 8 }}>{h.cur}%</span></div>)}</div></Card>}
          <Card accent={doneCount === totalActions && totalActions > 0 ? "#3b6d11" : undefined}>
            <div style={{ display: "flex", alignItems: "center", justifyBetween: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>실행 완료 체크</div><div style={{ fontSize: 11, color: "var(--text-dim)" }}>{doneCount} / {totalActions} 완료{doneCount === totalActions && totalActions > 0 ? " — 모든 주문 완료!" : ""}</div></div>
              {doneCount === totalActions && totalActions > 0 && <div style={{ background: "#eaf3de", borderRadius: 8, padding: ".75rem 1rem", fontSize: 12, color: "#27500a", fontWeight: 500 }}>다음 리밸런싱 예정일: {new Date(Date.now() + required * 86400000).toLocaleDateString("ko-KR")}</div>}
            </div>
          </Card>
          <div style={{ display: "flex", justifyStart: "flex-start" }}><Btn onClick={() => setStep(1)}>← 판단 근거</Btn></div>
        </div>
      )}
    </div>
  );
}
