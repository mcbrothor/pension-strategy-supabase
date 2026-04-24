import React, { useState, useMemo } from "react";
import { Card, ST, Btn, Badge } from "../common/index.jsx";
import { fmt, fmtR } from "../../utils/formatters.js";
import { simulate, simulateReal, calcNeededContrib, checkWithdraw } from "../../utils/calculators.js";
import { STRATEGIES } from "../../constants/index.js";
import { usePortfolio } from "../../context/PortfolioContext.jsx";

export default function RetirementRoadmap({ strategyId }) {
  const { portfolio, updateRetirementPlan } = usePortfolio();
  const plan = portfolio.retirementPlan || {};
  const cAge = plan.currentAge ?? 40;
  const rAge = plan.retirementAge ?? 60;
  const life = plan.lifeExpectancy ?? 90;
  const bal = plan.currentBalance ?? portfolio.evaluationAmount ?? portfolio.total ?? 0;
  const contrib = plan.monthlyContribution ?? 500000;
  const need = plan.monthlyNeed ?? 3000000;
  const pension = plan.monthlyPension ?? 1000000;
  const inflation = plan.inflationPct ?? 2;
  const [strat, setStrat] = useState(strategyId || portfolio.strategy || "allseason");
  const [showReal, setShowReal] = useState(false); // 실질 가치 토글
  const setCAge = value => updateRetirementPlan({ currentAge: value });
  const setRAge = value => updateRetirementPlan({ retirementAge: value });
  const setLife = value => updateRetirementPlan({ lifeExpectancy: value });
  const setBal = value => updateRetirementPlan({ currentBalance: value });
  const setContrib = value => updateRetirementPlan({ monthlyContribution: value });
  const setNeed = value => updateRetirementPlan({ monthlyNeed: value });
  const setPension = value => updateRetirementPlan({ monthlyPension: value });
  const setInflation = value => updateRetirementPlan({ inflationPct: value });

  React.useEffect(() => {
    setStrat(strategyId || portfolio.strategy || "allseason");
  }, [strategyId, portfolio.strategy]);

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
  const targetCagr = plan.targetCagr ?? 0;
  const targetCagrPct = `${(targetCagr * 100).toFixed(1)}%`;
  const annualContribution = plan.annualContribution ?? contrib * 12;
  const taxCreditUsed = plan.taxCreditUsed ?? Math.min(annualContribution, plan.taxCreditLimit ?? 6000000);
  const taxCreditAmount = plan.taxCreditAmount ?? Math.round(taxCreditUsed * (plan.taxCreditRate ?? 0.165));
  const withdrawalStartAge = plan.withdrawalStartAge ?? 55;
  
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
  const ap = sim => { 
    const l = sim.map((p, i) => `${i ? "L" : "M"}${tx(p.y).toFixed(1)},${ty(p.b).toFixed(1)}`).join(" "); 
    return `${l} L${tx(yrs)},${CH - 14} L${tx(0)},${CH - 14} Z`; 
  };
  const tgY = ty(target);

  // 공통 숫자 입력 + 게이지(슬라이더) 컴포넌트
  const NumericInput = ({ label, value, onChange, min, max, step, unit, isMoney = false, hint }) => {
    // 금액인 경우 만원 단위로 변환하여 표시 (10,000 -> 1)
    const displayValue = isMoney ? Math.round(value / 10000) : value;
    
    const handleInputChange = (e) => {
      let val = Number(e.target.value) || 0;
      // 유효 범위 체크 (간단히)
      if (val < 0) val = 0;
      onChange(isMoney ? val * 10000 : val);
    };

    return (
      <div style={{ marginBottom: "1.25rem" }}>
        {/* 상단: 라벨 및 입력창 가로 배치 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "12px", color: "var(--text-main)", fontWeight: 600 }}>{label}</span>
            {hint && <span style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 1 }}>{hint}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input 
              type="number" 
              step={step / (isMoney ? 10000 : 1)}
              value={displayValue} 
              onChange={handleInputChange}
              style={{ 
                width: isMoney ? "85px" : "60px", 
                padding: "4px 8px", 
                borderRadius: "6px", 
                border: "1.5px solid var(--border-glass)", 
                background: "var(--bg-card)", 
                color: "var(--text-main)",
                fontSize: "13px",
                fontWeight: 700,
                textAlign: "right",
                outline: "none"
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--text-dim)", width: "30px" }}>{unit}</span>
          </div>
        </div>
        
        {/* 하단: 슬라이더 (게이지) - 영역 이탈 방지를 위해 여유 패딩 확보 */}
        <div style={{ padding: "0 6px", boxSizing: "border-box" }}>
          <input 
            type="range" 
            min={min} 
            max={max} 
            step={step} 
            value={value} 
            onChange={e => onChange(Number(e.target.value))} 
            style={{ 
              width: "100%", 
              height: "4px", 
              appearance: "none",
              background: "var(--border-glass)",
              borderRadius: "2px",
              accentColor: "var(--color-primary)", 
              cursor: "pointer",
              display: "block",
              margin: "6px 0"
            }} 
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "start" }}>
      {/* 1. 설정 사이드바 (Grouped Controls) */}
      <div style={{ flex: "1 1 320px", maxWidth: "380px", minWidth: "300px", display: "flex", flexDirection: "column", gap: "1rem" }}>
        
        {/* 섹션 1: 생애 주기 설정 */}
        <Card>
          <ST>1. 생애 주기 설정</ST>
          <NumericInput label="현재 나이" value={cAge} onChange={setCAge} min={20} max={65} step={1} unit="세" />
          <NumericInput label="은퇴 나이" value={rAge} onChange={v => { if (v > cAge) setRAge(v) }} min={cAge + 1} max={85} step={1} unit="세" hint="조기 은퇴 또는 정년 기준" />
          <NumericInput label="기대 수명" value={life} onChange={setLife} min={rAge + 5} max={110} step={1} unit="세" hint="한국인 평균 수명: 남 81세/여 87세" />
        </Card>
        
        {/* 섹션 2: 자산 및 수입 정보 */}
        <Card>
          <ST>2. 자산 및 수입 정보</ST>
          <NumericInput label="현재 잔고" value={bal} onChange={setBal} min={0} max={1000000000} step={1000000} unit="만원" isMoney hint="연금저축/IRP 합산 잔액" />
          <NumericInput label="월 납입액" value={contrib} onChange={setContrib} min={0} max={10000000} step={100000} unit="만원" isMoney hint="매달 추가 투자하는 금액" />
          <NumericInput label="월 예상 연금" value={pension} onChange={setPension} min={0} max={10000000} step={100000} unit="만원" isMoney hint="국민/퇴직연금 예상 수령액" />
          <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg-main)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>연금 세제 메타</div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              연 납입액 {fmt(annualContribution)}원 / 세액공제 반영 {fmt(taxCreditUsed)}원 / 예상 세액공제 {fmt(taxCreditAmount)}원
            </div>
          </div>
        </Card>

        {/* 섹션 3: 목표 및 환경 설정 */}
        <Card>
          <ST>3. 목표 및 환경 설정</ST>
          <NumericInput label="목표 생활비" value={need} onChange={setNeed} min={1000000} max={20000000} step={100000} unit="만원" isMoney hint="은퇴 후 한 달 생활 자금" />
          <NumericInput label="예상 물가 상승률" value={inflation} onChange={setInflation} min={0} max={8} step={0.1} unit="%" hint="최근 10년 평균 약 2%" />
          
          <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <div style={{ fontSize: "12px", color: "var(--text-main)", fontWeight: 600, marginBottom: "8px" }}>투자 전략 (기대수익률)</div>
            <select value={strat} onChange={e => setStrat(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1.5px solid var(--border-glass)", background: "var(--bg-card)", color: "var(--text-main)", fontSize: "13px", fontWeight: 700, cursor: "pointer", outline: "none" }}>
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name} ({fmtR(s.annualRet.base)})</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1rem", padding: "8px 10px", background: "rgba(0,0,0,0.03)", borderRadius: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>실질 가치 (구매력) 기준</span>
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>물가 상승률을 차감한 가지</span>
            </div>
            <input type="checkbox" checked={showReal} onChange={e => setShowReal(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
          </div>
          <div style={{ marginTop: "0.75rem", padding: "10px 12px", borderRadius: 8, background: cAge < withdrawalStartAge ? "#fcebeb" : "#eaf3de", color: cAge < withdrawalStartAge ? "#791f1f" : "#27500a", fontSize: 11, lineHeight: 1.7 }}>
            {cAge < withdrawalStartAge
              ? `현재 ${cAge}세로 연금 수령 개시 기준 ${withdrawalStartAge}세 이전입니다. 중도 인출은 페널티 가능성이 큽니다.`
              : `현재 ${cAge}세로 연금 수령 개시 기준 ${withdrawalStartAge}세 이상입니다. 연금 수령 시뮬레이션 검토 구간입니다.`}
          </div>
        </Card>
      </div>

      {/* 2. 대시보드 및 결과 영역 */}
      <div style={{ flex: "10 1 500px", minWidth: "320px", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Card accent={ok ? "#3b6d11" : "#a32d2d"}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge bg="#e6f1fb" c="#0c447c">전략 메뉴 연동</Badge>
                <Badge bg={targetCagr > 0.1 ? "#fcebeb" : "#eaf3de"} c={targetCagr > 0.1 ? "#791f1f" : "#27500a"}>
                  필요 CAGR {targetCagrPct}
                </Badge>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>
                {showReal ? "필요 은퇴 자산 (현재 가치 기준)" : "필요 은퇴 자산 (명목 기준)"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{fmt(target)}원</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, lineHeight: 1.5 }}>
                은퇴 후 {ryrs}년간 매월 {fmt(showReal ? need : futureNeed)}원 인출 가정<br />
                (기본 수익률 {fmtR(sr.base)} · 물가 상승률 {inflation}% · 필요 CAGR {targetCagrPct})
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.6 }}>
                55세 수령 개시 기준: {withdrawalStartAge}세 · 연 세액공제 예상 {fmt(taxCreditAmount)}원
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
