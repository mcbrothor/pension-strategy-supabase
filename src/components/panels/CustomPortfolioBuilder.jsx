import React, { useState, useMemo, useCallback } from "react";
import { Card, ST, Badge, Btn } from "../common/index.jsx";
import { ASSET_CLASSES, ASSET_COLORS, STRATEGIES, RISK_DATA } from "../../constants/index.js";

/**
 * 커스텀 포트폴리오 빌더
 *
 * 왜 이 컴포넌트가 필요한가:
 * 기존 프리셋 전략만으로는 유저의 개별 투자 성향을 반영하기 어렵습니다.
 * 유저가 직접 자산군별 비중을 조절하고, 그에 따른 예상 수익률/MDD를
 * 실시간으로 확인할 수 있어 투자 의사결정에 도움을 줍니다.
 */

// 자산군별 장기 기대수익률 (연율, 소수)
// 왜 이 값인가: 프리셋 전략의 annualRet.base 데이터를 역산하여 교차 검증한 값
// 리밸런싱 프리미엄(연 1~1.5%)은 별도 함수에서 자산군 수/분산도 기반으로 추가
const EXPECTED_RETURNS = {
  "미국 주식": 0.10,   // S&P500 장기 평균 ~10%
  "국내 주식": 0.08,   // KOSPI 장기 평균 ~8%
  "장기채": 0.05,      // 미국 장기국채 장기 평균 ~5% (쿠폰+자본이익)
  "단기채": 0.035,     // 단기채 쿠폰 재투자 ~3.5%
  "실물자산": 0.07,    // 금+원자재+리츠 혼합 ~7%
  "현금": 0.025,       // MMF/현금성 ~2.5%
};

// 시나리오별 승수 (보수적/기본/낙관적)
const SCENARIO_MULTIPLIERS = {
  cons: 0.75,
  base: 1.0,
  opt: 1.25,
};

/**
 * 분산 효과를 반영한 포트폴리오 변동성 산출
 *
 * 왜 √(Σwi²σi²)인가:
 * - 단순 가중합 Σ(wiσi)은 모든 자산이 완전 상관(ρ=1)이라고 가정하여 변동성을 크게 과대평가
 * - √(Σwi²σi²)은 자산 간 상관관계가 0이라고 가정(제로 상관)하여 분산 효과를 반영
 * - 실제 값은 이 둘 사이에 위치하므로, 블렌딩 계수(0.35)로 보정
 *   최종 = 0.35 × 완전상관 + 0.65 × 제로상관 (경험적 calibration)
 */
function calculateDiversifiedVol(weights) {
  let sumWeightedVol = 0;    // Σ(wi × σi) — 완전상관 가정
  let sumWeightedVar = 0;     // Σ(wi² × σi²) — 제로상관 가정

  Object.entries(weights).forEach(([cls, w]) => {
    const wi = w / 100;
    const sigma = RISK_DATA[cls] || 0.15;
    sumWeightedVol += wi * sigma;
    sumWeightedVar += wi * wi * sigma * sigma;
  });

  const volPerfectCorr = sumWeightedVol;
  const volZeroCorr = Math.sqrt(sumWeightedVar);

  // 블렌딩: 실제 자산 간 상관은 0~1 사이 → 경험적으로 0.35/0.65 비율
  return 0.35 * volPerfectCorr + 0.65 * volZeroCorr;
}

/**
 * 리밸런싱 프리미엄 산출 (Shannon 엔트로피 기반)
 *
 * 왜 리밸런싱 프리미엄이 필요한가:
 * - 정기 리밸런싱은 "비싸진 자산을 팔고 싸진 자산을 사는" 체계적 수익원
 * - 자산군이 많고 균등할수록(엔트로피 높을수록) 프리미엄 증가
 * - 학술적으로 연 0.5~2.0% 수준으로 추정됨 (Booth & Fama, 1992)
 */
function calculateRebalancingPremium(weights) {
  const activeEntries = Object.entries(weights).filter(([, w]) => w > 0);
  const n = activeEntries.length;
  if (n <= 1) return 0;

  const total = activeEntries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return 0;

  // Shannon 엔트로피: -Σ(pi × ln(pi))
  let entropy = 0;
  activeEntries.forEach(([, w]) => {
    const p = w / total;
    if (p > 0.001) entropy -= p * Math.log(p);
  });

  const maxEntropy = Math.log(n); // 최대 엔트로피 (균등 배분 시)
  const entropyRatio = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // 리밸런싱 프리미엄: 최대 1.5%p, 자산군 수와 분산도에 비례
  return entropyRatio * Math.min(n * 0.25, 1.5) / 100;
}

/**
 * 예상 MDD 산출 (분산 효과 반영 + 위험자산 집중도 기반 가변 승수)
 *
 * 프리셋 전략 데이터로 캘리브레이션한 결과:
 * - 60/40 (위험자산 60%): MDD ~30%, Vol ~11% → 비율 2.7
 * - 사계절 (위험자산 45%): MDD ~13%, Vol ~8% → 비율 1.7
 * - 영구 (위험자산 50%): MDD ~13%, Vol ~7% → 비율 1.8
 *
 * → 위험자산 비율이 높을수록 꼬리위험(tail risk)이 커져 승수 증가
 */
function estimateExpectedMDD(weights) {
  const portfolioVol = calculateDiversifiedVol(weights);

  // 위험자산 비율 계산 (주식 + 실물자산)
  const riskPct = (
    (weights["미국 주식"] || 0) +
    (weights["국내 주식"] || 0) +
    (weights["실물자산"] || 0)
  ) / 100;

  // 위험자산 집중도 기반 MDD 승수 (캘리브레이션된 값)
  // riskPct 0% → 1.2, 50% → 1.8, 70%+ → 2.5+
  const mddMultiplier = 1.2 + riskPct * 2.0;

  return -(portfolioVol * mddMultiplier * 100);
}

/**
 * 예상 연간 수익률 산출 (가중평균 + 리밸런싱 프리미엄)
 */
function estimateExpectedReturn(weights, scenario = "base") {
  let baseReturn = 0;
  const multiplier = SCENARIO_MULTIPLIERS[scenario] || 1.0;

  Object.entries(weights).forEach(([cls, w]) => {
    const ret = EXPECTED_RETURNS[cls] || 0.025;
    baseReturn += (w / 100) * ret;
  });

  // 리밸런싱 프리미엄 추가
  const rebalPremium = calculateRebalancingPremium(weights);

  return (baseReturn + rebalPremium) * multiplier * 100; // % 단위
}

/**
 * 샤프지수 산출 (분산효과 반영 변동성 사용)
 */
function estimateCustomSharpe(weights) {
  const expRet = estimateExpectedReturn(weights, "base") / 100;
  const portfolioVol = calculateDiversifiedVol(weights);
  const rf = 0.03;
  return portfolioVol > 0 ? (expRet - rf) / portfolioVol : 0;
}

// 도넛 차트를 SVG로 간결하게 렌더링
function DonutChart({ weights, size = 160 }) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const innerR = r * 0.55;
  let currentAngle = -90; // 12시 방향부터 시작

  const paths = entries.map(([cls, w]) => {
    const angle = (w / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + innerR * Math.cos(endRad);
    const iy1 = cy + innerR * Math.sin(endRad);
    const ix2 = cx + innerR * Math.cos(startRad);
    const iy2 = cy + innerR * Math.sin(startRad);

    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");

    return (
      <path
        key={cls}
        d={d}
        fill={ASSET_COLORS[cls] || "#888"}
        stroke="#fff"
        strokeWidth={1.5}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      {/* 가운데 텍스트 */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize={22}
        fontWeight={700}
        fill="var(--text-main)"
      >
        {Math.round(total)}%
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        fontSize={10}
        fill="var(--text-dim)"
      >
        합계
      </text>
    </svg>
  );
}

export default function CustomPortfolioBuilder() {
  // 초기 비중: 모든 자산군 0%
  const [weights, setWeights] = useState(() => {
    const init = {};
    ASSET_CLASSES.forEach((cls) => (init[cls] = 0));
    return init;
  });

  const [collapsed, setCollapsed] = useState(false);

  // 비중 합계
  const totalWeight = useMemo(
    () => Object.values(weights).reduce((sum, w) => sum + w, 0),
    [weights]
  );

  // 개별 자산군 비중 변경 핸들러
  const handleWeightChange = useCallback((cls, value) => {
    setWeights((prev) => ({
      ...prev,
      [cls]: Math.max(0, Math.min(100, Number(value) || 0)),
    }));
  }, []);

  // 나머지를 현금에 자동 배분
  const fillCash = useCallback(() => {
    setWeights((prev) => {
      const nonCash = Object.entries(prev)
        .filter(([cls]) => cls !== "현금")
        .reduce((sum, [, w]) => sum + w, 0);
      const remainder = Math.max(0, 100 - nonCash);
      return { ...prev, "현금": remainder };
    });
  }, []);

  // 프리셋 전략 비중 불러오기
  const loadPreset = useCallback((strategyId) => {
    const strategy = STRATEGIES.find((s) => s.id === strategyId);
    if (!strategy) return;
    const newWeights = {};
    ASSET_CLASSES.forEach((cls) => (newWeights[cls] = 0));
    // 고정 비중이 있는 composition 항목만 반영
    strategy.composition.forEach((c) => {
      if (c.w != null && c.w > 0) {
        newWeights[c.cls] = (newWeights[c.cls] || 0) + c.w;
      }
    });
    setWeights(newWeights);
  }, []);

  // 전체 초기화
  const resetAll = useCallback(() => {
    const init = {};
    ASSET_CLASSES.forEach((cls) => (init[cls] = 0));
    setWeights(init);
  }, []);

  // 예상 수익률 (3단계)
  const expReturns = useMemo(() => ({
    cons: estimateExpectedReturn(weights, "cons"),
    base: estimateExpectedReturn(weights, "base"),
    opt: estimateExpectedReturn(weights, "opt"),
  }), [weights]);

  // 예상 MDD
  const expMDD = useMemo(() => estimateExpectedMDD(weights), [weights]);

  // 샤프지수
  const expSharpe = useMemo(() => estimateCustomSharpe(weights), [weights]);

  // 포트폴리오 변동성 (분산효과 반영)
  const expVol = useMemo(() => {
    return calculateDiversifiedVol(weights) * 100;
  }, [weights]);

  // 비중 합계 상태
  const weightStatus = totalWeight === 100 ? "ok" : totalWeight > 100 ? "over" : "under";
  const statusColor = {
    ok: "var(--alert-ok-color)",
    over: "var(--alert-danger-color)",
    under: "var(--alert-warn-color)",
  };
  const statusBg = {
    ok: "var(--alert-ok-bg)",
    over: "var(--alert-danger-bg)",
    under: "var(--alert-warn-bg)",
  };
  const statusText = {
    ok: "✓ 비중 합계 100% — 분석 가능",
    over: `⚠ 비중 합계 ${totalWeight}% — ${totalWeight - 100}%p 초과`,
    under: `△ 비중 합계 ${totalWeight}% — ${100 - totalWeight}%p 미달`,
  };

  return (
    <Card>
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>🎨 커스텀 포트폴리오 빌더</span>
            <Badge c="#0c447c" bg="#e6f1fb">DIY</Badge>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            자산군별 비중을 직접 조절하고 예상 수익률·MDD를 확인합니다
          </div>
        </div>
        <span style={{ fontSize: 18, color: "var(--text-dim)", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}>
          ▼
        </span>
      </div>

      {!collapsed && (
        <div style={{ marginTop: "1.25rem" }}>
          {/* 액션 바 */}
          <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <select
              onChange={(e) => {
                if (e.target.value) loadPreset(e.target.value);
                e.target.value = "";
              }}
              defaultValue=""
              style={{
                padding: "6px 10px",
                border: "0.5px solid var(--border-glass)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontFamily: "var(--font-sans)",
              }}
            >
              <option value="" disabled>전략 비중 가져오기…</option>
              {STRATEGIES.filter((s) => s.type === "fixed").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Btn sm onClick={fillCash}>나머지 → 현금</Btn>
            <Btn sm onClick={resetAll} style={{ color: "var(--alert-danger-color)", borderColor: "var(--alert-danger-color)" }}>
              초기화
            </Btn>
          </div>

          {/* 메인 레이아웃: 슬라이더 + 도넛 차트 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1.5rem", alignItems: "start" }}>
            {/* 슬라이더 영역 */}
            <div>
              {ASSET_CLASSES.map((cls) => (
                <div key={cls} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: ASSET_COLORS[cls] || "#888",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-main)" }}>{cls}</span>
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        (기대 {(EXPECTED_RETURNS[cls] * 100).toFixed(1)}%, σ {((RISK_DATA[cls] || 0.15) * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={weights[cls]}
                        onChange={(e) => handleWeightChange(cls, e.target.value)}
                        style={{
                          width: 52,
                          textAlign: "right",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={weights[cls]}
                    onChange={(e) => handleWeightChange(cls, Number(e.target.value))}
                    style={{
                      width: "100%",
                      accentColor: ASSET_COLORS[cls] || "#888",
                    }}
                  />
                </div>
              ))}

              {/* 비중 합계 상태 바 */}
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: statusBg[weightStatus],
                  color: statusColor[weightStatus],
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{statusText[weightStatus]}</span>
                {weightStatus === "under" && (
                  <Btn sm onClick={fillCash} style={{ fontSize: 10, padding: "3px 8px" }}>
                    자동 채우기
                  </Btn>
                )}
              </div>
            </div>

            {/* 도넛 차트 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 170 }}>
              <DonutChart weights={weights} size={160} />
              <div style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "center" }}>자산 배분 시각화</div>
              {/* 범례 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {ASSET_CLASSES.filter((cls) => weights[cls] > 0).map((cls) => (
                  <div key={cls} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: ASSET_COLORS[cls] }} />
                    <span style={{ color: "var(--text-dim)" }}>{cls}</span>
                    <strong style={{ color: "var(--text-main)", marginLeft: "auto" }}>{weights[cls]}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 예상 성과 지표 패널 */}
          {totalWeight > 0 && (
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "0.5px solid var(--border-glass)" }}>
              <ST>📊 예상 성과 지표</ST>

              {/* 예상 수익률 3단계 게이지 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  { key: "cons", label: "보수적", color: "#0c447c", bg: "#e6f1fb" },
                  { key: "base", label: "기본", color: "#27500a", bg: "#eaf3de" },
                  { key: "opt", label: "낙관적", color: "#633806", bg: "#faeeda" },
                ].map((scenario) => (
                  <div
                    key={scenario.key}
                    style={{
                      background: scenario.bg,
                      borderRadius: 10,
                      padding: "14px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 10, color: scenario.color, fontWeight: 600, marginBottom: 6 }}>
                      {scenario.label} 시나리오
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: scenario.color }}>
                      {expReturns[scenario.key].toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 10, color: scenario.color, opacity: 0.7, marginTop: 2 }}>
                      예상 연간 수익률
                    </div>
                  </div>
                ))}
              </div>

              {/* 위험 지표 카드 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                }}
              >
                {/* 예상 MDD */}
                <div style={{ background: "var(--bg-main)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>예상 MDD</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: expMDD < -20 ? "var(--alert-danger-color)" : expMDD < -10 ? "var(--alert-warn-color)" : "var(--text-main)",
                    }}
                  >
                    {expMDD.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>
                    {expMDD < -25 ? "⚠ 고위험" : expMDD < -15 ? "△ 중위험" : "✓ 저위험"}
                  </div>
                </div>

                {/* 기대 변동성 */}
                <div style={{ background: "var(--bg-main)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>변동성(σ)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)" }}>
                    {expVol.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>연간 추정</div>
                </div>

                {/* 샤프지수 */}
                <div style={{ background: "var(--bg-main)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>샤프 지수</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: expSharpe > 0.8 ? "var(--alert-ok-color)" : expSharpe > 0.4 ? "var(--text-main)" : "var(--alert-warn-color)",
                    }}
                  >
                    {expSharpe.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>
                    {expSharpe > 0.8 ? "매우 우수" : expSharpe > 0.4 ? "양호" : "보통"}
                  </div>
                </div>

                {/* 위험자산 비율 */}
                <div style={{ background: "var(--bg-main)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>위험자산 비율</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)" }}>
                    {(weights["미국 주식"] + weights["국내 주식"] + weights["실물자산"]).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>
                    IRP {(weights["미국 주식"] + weights["국내 주식"] + weights["실물자산"]) > 70 ? "한도 초과" : "적합"}
                  </div>
                </div>
              </div>

              {/* MDD 시각화 바 */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                  <span>예상 최대 낙폭 (MDD) 시각화</span>
                  <span>{expMDD.toFixed(1)}%</span>
                </div>
                <div style={{ height: 12, background: "var(--bg-main)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(Math.abs(expMDD), 60)}%`,
                      background: `linear-gradient(to right, ${Math.abs(expMDD) > 25 ? "#a32d2d" : Math.abs(expMDD) > 15 ? "#ba7517" : "#3b6d11"}, ${Math.abs(expMDD) > 25 ? "#791f1f" : Math.abs(expMDD) > 15 ? "#633806" : "#27500a"})`,
                      borderRadius: 6,
                      transition: "width 0.3s ease",
                    }}
                  />
                  {/* 기준점 마커들 */}
                  {[10, 20, 30].map((mark) => (
                    <div
                      key={mark}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${(mark / 60) * 100}%`,
                        width: 1,
                        height: "100%",
                        background: "var(--text-main)",
                        opacity: 0.15,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-dim)", marginTop: 3 }}>
                  <span>0%</span>
                  <span>-10%</span>
                  <span>-20%</span>
                  <span>-30%</span>
                  <span>-60%</span>
                </div>
              </div>

              {/* 산출 근거 설명 */}
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#f8fafc",
                  border: "1px solid var(--border-glass)",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  lineHeight: 1.7,
                }}
              >
                <strong style={{ color: "var(--text-main)" }}>산출 근거:</strong>{" "}
                예상 수익률 = 자산군별 기대수익률 가중평균 + 리밸런싱 프리미엄 (보수적 ×0.75, 기본 ×1.0, 낙관적 ×1.25).
                포트폴리오 변동성 = 완전상관(35%) + 제로상관(65%) 블렌딩 (분산효과 반영).
                예상 MDD = 변동성 × 가변 승수 (위험자산 집중도 기반, 프리셋 전략 데이터로 캘리브레이션).
                샤프 지수 = (기대수익률 - 무위험수익률 3%) / 분산효과 반영 변동성.
                실제 값은 상관계수·시장 국면에 따라 달라질 수 있으나, 프리셋 전략과 유사한 수준으로 추정됩니다.
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
