import React, { useState, useMemo } from "react";
import { Card, ST, Btn, Badge } from "../common/index.jsx";
import { fmt, fmtR } from "../../utils/formatters.js";
import { simulate, simulateReal, calcNeededContrib, checkWithdraw } from "../../utils/calculators.js";
import { STRATEGIES } from "../../constants/index.js";

export default function RetirementRoadmap({ strategyId }) {
  const [cAge, setCAge] = useState(40);
  const [rAge, setRAge] = useState(60);
  const [life, setLife] = useState(90);
  const [bal, setBal] = useState(54320000);
  const [contrib, setContrib] = useState(500000);
  const [need, setNeed] = useState(3000000);
  const [pension, setPension] = useState(1000000);
  const [strat, setStrat] = useState(strategyId || "allseason");
  const [inflation, setInflation] = useState(2.0); // 물가상승률 기본값 2%
  const [showReal, setShowReal] = useState(false); // 실질 가치 토글

  const s = STRATEGIES.find(x => x.id === strat) || STRATEGIES[3];
  const sr = s.annualRet || { cons: 0.06, base: 0.085, opt: 0.105 };
  const yrs = Math.max(rAge - cAge, 1), ryrs = Math.max(life - rAge, 1);
  
  // 미래 필요 자금 계산 (명목 기준)
  const INF_RATE = inflation / 100;
  const futureNeed = need * Math.pow(1 + INF_RATE, yrs);
  const netNeed = Math.max(futureNeed - pension, 0);
  
  // 목표 자산 계산 (은퇴 시점 기준)
  const WR = 0.03 / 12; // 은퇴 후 인출 수익률 가정 (연 3%)
  const targetNominal = netNeed > 0 ? netNeed * (1 - Math.pow(1 + WR, -(ryrs * 12))) / WR : 0;
  
  // 시뮬레이션 데이터 준비
  const simC = useMemo(() => showReal ? simulateReal(bal, contrib, sr.cons * 100, inflation, yrs) : simulate(bal, contrib, sr.cons, yrs), [bal, contrib, sr.cons, yrs, inflation, showReal]);
  const simB = useMemo(() => showReal ? simulateReal(bal, contrib, sr.base * 100, inflation, yrs) : simulate(bal, contrib, sr.base, yrs), [bal, contrib, sr.base, yrs, inflation, showReal]);
  const simO = useMemo(() => showReal ? simulateReal(bal, contrib, sr.opt * 100, inflation, yrs) : simulate(bal, contrib, sr.opt, yrs), [bal, contrib, sr.opt, yrs, inflation, showReal]);
  
  const bB = simB[simB.length - 1].b;
  const target = showReal ? targetNominal / Math.pow(1 + INF_RATE, yrs) : targetNominal;
  const ok = bB >= target;
  
  const wdCheck = useMemo(() => checkWithdraw(bB, showReal ? netNeed / Math.pow(1 + INF_RATE, yrs) : netNeed, 0.03, ryrs), [bB, netNeed, ryrs, inflation, showReal, yrs]);
  const nc = useMemo(() => calcNeededContrib(target, sr.base * 100, yrs, bal), [target, sr.base, yrs, bal]);

  // SVG 차트 설정 코드 생략 (기존 로직 유지하되 target 값만 업데이트)
  const CW = 520, CH = 180, PAD = 48;
  const maxV = Math.max(simO[simO.length - 1].b, target) * 1.12;
  const tx = yr => (yr / yrs) * (CW - PAD - 8) + PAD;
  const ty = v => CH - 14 - (v / (maxV || 1)) * (CH - 30);
  const lp = sim => sim.map((p, i) => `${i ? "L" : "M"}${tx(p.y).toFixed(1)},${ty(p.b).toFixed(1)}`).join(" ");
  const ap = sim => { const l = sim.map((p, i) => `${i ? "L" : "M"}${tx(p.y).toFixed(1)},${ty(p.b).toFixed(1)}`).join(" "); return `${l} L${tx(yrs)},${CH - 14} L${tx(0)},${CH - 14} Z`; };
  const tgY = ty(target);

  const SL = (label, val, set, min, max, step, extra) => (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span><span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(val)}원</span></div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} style={{ width: "100%" }} />
      {extra && <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>{extra}</div>}
    </div>
  );
  
  const SLA = (label, val, set, min, max, step, unit) => (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span><span style={{ fontSize: 13, fontWeight: 500 }}>{val}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "255px 1fr", gap: "1rem", alignItems: "start" }}>
      <div>
        <Card>
          <ST>은퇴 설계 옵션</ST>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>구매력 기준 (실질 가치)</span>
            <input type="checkbox" checked={showReal} onChange={e => setShowReal(e.target.checked)} />
          </div>
          {SLA("예상 물가 상승률", inflation, setInflation, 0, 10, 0.5, "%")}
        </Card>
        
        <Card>
          <ST>나이 설정</ST>
          {SLA("현재 나이", cAge, setCAge, 25, 65, 1, "세")}
          {SLA("은퇴 나이", rAge, v => { if (v > cAge) setRAge(v) }, cAge + 1, 75, 1, "세")}
          {SLA("기대 수명", life, setLife, rAge + 5, 100, 1, "세")}
        </Card>

        <Card>
          <ST>연금 자산 및 생활비</ST>
          {SL("현재 잔고", bal, setBal, 0, 500000000, 5000000)}
          {SL("월 납입액", contrib, setContrib, 0, 5000000, 100000)}
          {SL("목표 생활비", need, setNeed, 1000000, 15000000, 100000)}
        </Card>

        <Card>
          <ST>투자 전략</ST>
          <select value={strat} onChange={e => setStrat(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 8, border: "0.5px solid var(--border-glass)", background: "var(--bg-card)", color: "var(--text-main)" }}>
            {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name} ({fmtR(s.annualRet.base)})</option>)}
          </select>
        </Card>
      </div>

      <div>
        <Card accent={ok ? "#3b6d11" : "#a32d2d"}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>
                {showReal ? "필요 은퇴 자산 (현재 가치 기준)" : "필요 은퇴 자산 (명목 기준)"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{fmt(target)}원</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, lineHeight: 1.5 }}>
                은퇴 후 {ryrs}년간 매월 {fmt(showReal ? need : futureNeed)}원 인출 가정<br />
                (기본 수익률 {fmtR(sr.base)} · 물가 상승률 {inflation}% 반영)
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Badge bg={ok ? "#eaf3de" : "#fcebeb"} c={ok ? "#3b6d11" : "#a32d2d"}>
                {ok ? "달성 가능" : "추가 필요"}
              </Badge>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: ok ? "#3b6d11" : "#a32d2d" }}>
                {ok ? "+" : "-"}{fmt(Math.abs(bB - target))}원
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <ST>자산 성장 시뮬레이션 ({showReal ? "실질 구매력" : "명목 금액"})</ST>
          <div style={{ height: 220, position: "relative" }}>
            <svg viewBox={`0 0 ${CW} ${CH + 20}`} width="100%" height="100%">
              {[0, .25, .5, .75, 1].map((t, i) => {
                const v = maxV * t, y = ty(v);
                return (
                  <g key={i}>
                    <line x1={PAD} y1={y} x2={CW - 8} y2={y} stroke="var(--border-glass)" strokeDasharray="2 2" />
                    <text x={PAD - 5} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">{fmt(v)}</text>
                  </g>
                );
              })}
              <line x1={PAD} y1={tgY} x2={CW - 8} y2={tgY} stroke="var(--color-danger)" strokeWidth={1.5} strokeDasharray="4 2" />
              <path d={ap(simB)} fill="var(--color-primary)" fillOpacity={0.05} />
              <path d={lp(simB)} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} />
              <path d={lp(simO)} fill="none" stroke="var(--color-success)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />
              <path d={lp(simC)} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />
              <text x={CW - 10} y={tgY - 6} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--color-danger)">목표선</text>
            </svg>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <Card>
            <ST>전문 자산관리사 가이드: 인출 순서</ST>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { step: 1, name: "연금저축계좌", desc: "이연퇴직소득 이후 가장 먼저 인출" },
                { step: 2, name: "IRP 계좌", desc: "공제받지 않은 납입금 → 이연퇴직소득 순" },
                { step: 3, name: "ISA 계좌", desc: "비과세/분리과세 혜택 활용 후 인출" },
                { step: 4, name: "일반/위탁 계좌", desc: "가장 마지막에 인출하여 과세 이연 극대화" }
              ].map(it => (
                <div key={it.step} style={{ display: "flex", gap: 10, alignItems: "start" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--color-primary)", color: "white", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{it.step}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{it.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <ST>세무 알림: 연금 수령 한도</ST>
            <div style={{ background: (netNeed * 12) > 15000000 ? "#fff3cd" : "#d1e7dd", padding: "12px", borderRadius: 8, fontSize: 12 }}>
              {(netNeed * 12) > 15000000 ? (
                <>
                  ⚠️ <strong>연간 1,500만원 초과 예상</strong><br />
                  <span style={{ fontSize: 11, color: "#664d03", marginTop: 4, display: "block" }}>
                    사적연금 분리과세 한도를 초과하여 종합과세 또는 16.5% 분리과세 대상이 될 수 있습니다. 인출 기간 연장을 검토하세요.
                  </span>
                </>
              ) : (
                <>
                  ✅ <strong>절세 한도 내 인출 가능</strong><br />
                  <span style={{ fontSize: 11, color: "#0f5132", marginTop: 4, display: "block" }}>
                    현재 목표 생활비는 사적연금 저율과세(3.3~5.5%) 구간 내에 있습니다.
                  </span>
                </>
              )}
            </div>
          </Card>
        </div>
        <div style={{ marginTop: "0.5rem", fontSize: 11, color: "var(--text-dim)", textAlign: "right" }}>
          ※ 본 시뮬레이션은 만 60세부터 연금 수렴을 시작하는 범용적 기준을 가정하여 설계되었습니다.
        </div>
      </div>
    </div>
  );
}
