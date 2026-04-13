import React, { useState } from "react";
import { Card, Badge, Btn, ST } from "../common/index.jsx";
import { STRATEGIES, ASSET_COLORS } from "../../constants/index.js";
import { irpLimit } from "../../utils/helpers.js";
import { fmtR } from "../../utils/formatters.js";
import { usePortfolio } from "../../context/PortfolioContext.jsx";
import {
  applyPolicyToTargetWeights,
  calculateGlidePathMinimum,
  compositionToWeights,
  optimizeAssetLocation,
} from "../../services/portfolioPlanningEngine.js";

function fmtWeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${num.toFixed(1).replace(/\.0$/, "")}%`;
}

function sourceText(source) {
  if (source === "api") return "실시간 시장 데이터";
  if (source === "fallback_last") return "직전 유효 계산값";
  if (source === "fallback_default") return "전략 기본값 폴백";
  return "계산 대기";
}

function visibleWeights(weights = {}) {
  return Object.entries(weights)
    .filter(([key, value]) => !String(key).startsWith("_") && Number(value) > 0)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ko-KR"));
}

function MomentumCalculationPanel({ detail, rawTargets, finalTargets, calcText, calcLoading, glideMinSafePct }) {
  const rawRows = visibleWeights(rawTargets || detail?.rawTargets || {});
  const finalRows = visibleWeights(finalTargets || {});
  const policy = detail?.policy || {};
  const baseCashPct = Number(policy.baseCashPct) || 0;

  return (
    <div data-testid="momentum-calculation-detail" style={{ background: "var(--bg-main)", border: "1.5px solid #ba7517", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem", position: "relative" }}>
      <div style={{ position: "absolute", top: -10, right: 10, background: "#ba7517", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>MOMENTUM ENGINE</div>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#633806" }}>동적 배분 계산 상세</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Badge c="#633806" bg="#faeeda">계산 출처: {sourceText(detail?.source)}</Badge>
        <Badge c="#0c447c" bg="#e6f1fb">평시 현금 {fmtWeight(baseCashPct)}</Badge>
        {glideMinSafePct > 0 && <Badge c="#633806" bg="#faeeda">안전자산 하한 {fmtWeight(glideMinSafePct)}</Badge>}
      </div>

      {calcLoading && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>시장 데이터 조회 및 모멘텀 계산 중입니다.</div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-main)", lineHeight: 1.7, marginBottom: 10 }}>
        {detail?.summary || "선택한 동적 전략의 원천 신호와 최종 비중 계산 과정을 표시합니다."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-main)", marginBottom: 6 }}>전략 원비중</div>
          {rawRows.length > 0 ? rawRows.map(([cls, weight]) => (
            <div key={cls} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: "var(--text-dim)" }}>
              <span>{cls}</span><strong style={{ color: "var(--text-main)" }}>{fmtWeight(weight)}</strong>
            </div>
          )) : <div style={{ fontSize: 11, color: "var(--text-dim)" }}>계산 대기</div>}
        </div>
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-main)", marginBottom: 6 }}>정책 반영 후 최종 비중</div>
          {finalRows.length > 0 ? finalRows.map(([cls, weight]) => (
            <div key={cls} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: "var(--text-dim)" }}>
              <span>{cls}</span><strong style={{ color: "var(--text-main)" }}>{fmtWeight(weight)}</strong>
            </div>
          )) : <div style={{ fontSize: 11, color: "var(--text-dim)" }}>계산 대기</div>}
        </div>
      </div>

      {detail?.steps?.length > 0 && (
        <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-main)", marginBottom: 6 }}>도출 과정</div>
          {detail.steps.map((step) => (
            <div key={step} style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.7 }}>- {step}</div>
          ))}
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.7, marginTop: 6 }}>
            - 후처리: 원전략 비중을 정규화한 뒤 평시 현금 {fmtWeight(baseCashPct)}를 제외한 투자 가능 비중으로 축소하고, 은퇴 잔여기간 기준 안전자산 하한을 적용합니다.
          </div>
        </div>
      )}

      {detail?.rows?.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                {["자산군", "역할", "원천 신호", "판정식", "결과"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 7px", color: "var(--text-dim)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((row, index) => (
                <tr key={`${row.assetClass}-${index}`} style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                  <td style={{ padding: "7px", fontWeight: 600 }}>{row.assetClass}</td>
                  <td style={{ padding: "7px", color: "var(--text-dim)" }}>{row.role}</td>
                  <td style={{ padding: "7px", color: "var(--text-dim)" }}>{row.value || row.signal}</td>
                  <td style={{ padding: "7px", color: "var(--text-dim)" }}>{row.rule}</td>
                  <td style={{ padding: "7px" }}>
                    <Badge c={row.passed ? "#27500a" : "#791f1f"} bg={row.passed ? "#eaf3de" : "#fcebeb"}>{row.result}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>계산 로직</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.7, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", background: "var(--bg-card)", padding: 10, borderRadius: 6 }}>
        {(detail?.formula || calcText || "N/A") + "\n\npolicy_final = applySafeAssetFloor(applyCashScaling(raw_momentum_targets, baseCashPct), glidePathMinimum)"}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: "#ba7517", fontWeight: 500 }}>
        데이터 기준: {detail?.dataBasis || "시장 데이터 조회 후 계산"}.
      </div>
    </div>
  );
}

export default function StrategySelect({ accountType, onStrategyApply }) {
  const { fetchMomentumTargets, portfolio, updateAllocationPolicy } = usePortfolio();
  const [acc, setAcc] = useState(accountType || "연금저축");
  const [filt, setFilt] = useState("all");
  const [sel, setSel] = useState(null);
  const [precalcTargets, setPrecalcTargets] = useState(null);
  const [precalcRawTargets, setPrecalcRawTargets] = useState(null);
  const [momentumDetail, setMomentumDetail] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const limit = irpLimit(acc);
  const retirementPlan = portfolio.retirementPlan || {};
  const allocationPolicy = portfolio.allocationPolicy || {};
  const targetCagr = Number(retirementPlan.targetCagr) || 0;
  const baseCashPct = Number(allocationPolicy.baseCashPct) || 0;
  const glideMinSafePct = calculateGlidePathMinimum({
    currentAge: retirementPlan.currentAge,
    retirementAge: retirementPlan.retirementAge,
    annualStepPct: allocationPolicy.glidePathStepPct,
    triggerYears: allocationPolicy.glidePathTriggerYears,
    maxSafePct: allocationPolicy.maxSafePct,
  });
  const vis = STRATEGIES.filter(s => filt === "all" || s.type === filt);

  function irpBadge(s) {
    if (acc === "연금저축") return { lbl: "제한 없음", c: "#27500a", bg: "#eaf3de" };
    const r = s.irpRisk;
    if (r > limit) return { lbl: `IRP 주의 (${r}%)`, c: "#633806", bg: "#faeeda" };
    return { lbl: `IRP 적합 (${r}%)`, c: "#27500a", bg: "#eaf3de" };
  }
  const lvC = { 초급: "#085041", 중급: "#0c447c", 고급: "#26215c" };
  const lvB = { 초급: "#e1f5ee", 중급: "#e6f1fb", 고급: "#eeedfe" };
  const selS = STRATEGIES.find(s => s.id === sel);
  const selectedTargets = React.useMemo(() => {
    if (!selS) return {};
    if (selS.type === "momentum" && precalcRawTargets) {
      return applyPolicyToTargetWeights(precalcRawTargets, allocationPolicy, retirementPlan);
    }
    if (precalcTargets) return precalcTargets;
    return applyPolicyToTargetWeights(
      compositionToWeights(selS.composition),
      allocationPolicy,
      retirementPlan
    );
  }, [selS, precalcTargets, precalcRawTargets, allocationPolicy, retirementPlan]);
  const assetLocation = React.useMemo(
    () => optimizeAssetLocation(
      Object.entries(selectedTargets).map(([cls, target]) => ({ cls, target })),
      { irpRiskLimitPct: limit }
    ),
    [selectedTargets, limit]
  );

  return (
    <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>투자 전략 선택</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>삼성증권 연금계좌 실제 매수 가능 ETF 기준</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <Badge c="#0c447c" bg="#e6f1fb">로드맵 필요 CAGR {fmtR(targetCagr)}</Badge>
              <Badge c="#27500a" bg="#eaf3de">평시 현금 {baseCashPct.toFixed(0)}%</Badge>
              {glideMinSafePct > 0 && <Badge c="#633806" bg="#faeeda">글라이드패스 안전자산 하한 {glideMinSafePct.toFixed(0)}%</Badge>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {["IRP", "연금저축", "혼합"].map(t => (
              <Btn key={t} sm onClick={() => setAcc(t)} primary={acc === t}>{t}</Btn>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "0.5px solid var(--border-glass)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>평시 기본 현금/단기채 비중</span>
            <strong style={{ fontSize: 13 }}>{baseCashPct.toFixed(0)}%</strong>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={baseCashPct}
            onChange={e => updateAllocationPolicy({ baseCashPct: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            모든 정적/동적 전략의 원래 비중을 남은 투자금 안에서 축소하고, 차액을 현금MMF로 배정합니다.
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 6, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {[[ "all", "전체", null ], [ "fixed", "실행 가능 — 고정비중", "#3b6d11" ], [ "momentum", "자동 계산 — 모멘텀", "#ba7517" ]].map(([f, lbl, col]) => (
          <Btn key={f} sm onClick={() => setFilt(f)} style={{ background: filt === f ? (col || "var(--text-main)") : "none", color: filt === f ? "#fff" : "var(--text-dim)", borderColor: filt === f ? "transparent" : "var(--border-glass)" }}>
            {lbl} ({f === "all" ? STRATEGIES.length : STRATEGIES.filter(s => s.type === f).length})
          </Btn>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 10, marginBottom: "1.5rem" }}>
        {vis.map(s => {
          const irp = irpBadge(s);
          const isSel = s.id === sel;
          const expectedReturn = Number(s.annualRet?.base) || 0;
          const hasTarget = targetCagr > 0;
          const meetsTarget = hasTarget && expectedReturn >= targetCagr;
          return (
            <div key={s.id} data-testid={`strategy-card-${s.id}`} onClick={async () => {
              if (s.id === sel) {
                setSel(null);
                setPrecalcTargets(null);
                setPrecalcRawTargets(null);
                setMomentumDetail(null);
              } else {
                setSel(s.id);
                if (s.type === "momentum") {
                  setCalcLoading(true);
                  setPrecalcTargets(null);
                  setPrecalcRawTargets(null);
                  setMomentumDetail(null);
                  try {
                    const result = await fetchMomentumTargets(s.id, { returnDetails: true });
                    setPrecalcTargets(result?.targets || {});
                    setPrecalcRawTargets(result?.rawTargets || result?.detail?.rawTargets || null);
                    setMomentumDetail(result?.detail || null);
                  } finally {
                    setCalcLoading(false);
                  }
                } else {
                  setPrecalcTargets(null);
                  setPrecalcRawTargets(null);
                  setMomentumDetail(null);
                }
              }
            }}
              style={{ background: "var(--bg-card)", border: `${isSel ? "2px" : "0.5px"} solid ${isSel ? (s.type === "fixed" ? "#3b6d11" : "#ba7517") : "var(--border-glass)"}`, borderRadius: "var(--border-radius-lg)", padding: "1rem", cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 7 }}>
                <Badge c={s.type === "fixed" ? "#27500a" : "#633806"} bg={s.type === "fixed" ? "#eaf3de" : "#faeeda"}>{s.type === "fixed" ? "실행가능" : "자동 계산"}</Badge>
                <Badge c={lvC[s.level]} bg={lvB[s.level]}>{s.level}</Badge>
                <Badge c={irp.c} bg={irp.bg}>{irp.lbl}</Badge>
                {hasTarget && (
                  <Badge c={meetsTarget ? "#27500a" : "#791f1f"} bg={meetsTarget ? "#eaf3de" : "#fcebeb"}>
                    {meetsTarget ? "⭐ 추천" : "⚠️ 목표 수익률 미달"}
                  </Badge>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, lineHeight: 1.4 }}>{s.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>수익 <strong style={{ color: "var(--text-main)" }}>{s.ret}</strong></span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>MDD <strong style={{ color: "var(--text-main)" }}>{s.mdd}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {selS && (
        <Card>
          <div style={{ display: "flex", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
            <Badge c={selS.type === "fixed" ? "#27500a" : "#633806"} bg={selS.type === "fixed" ? "#eaf3de" : "#faeeda"}>
              {selS.type === "fixed" ? "고정비중 — 즉시 실행 가능" : "모멘텀 — 전략 적용 시 자동 계산"}
            </Badge>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 5 }}>{selS.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 10 }}>{selS.desc}</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "1.5rem" }}>
            <div>
              {acc !== "연금저축" && (() => {
                const r = selS.irpRisk, bC = r > limit ? "#a32d2d" : r > limit * .85 ? "#ba7517" : "#3b6d11";
                return (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ height: 9, background: "var(--bg-main)", borderRadius: 5, overflow: "hidden", position: "relative", margin: "4px 0 3px" }}>
                      <div style={{ height: "100%", width: `${Math.min(r, 100)}%`, background: bC, borderRadius: 5 }} />
                      <div style={{ position: "absolute", top: 0, left: `${limit}%`, width: 2, height: "100%", background: "#a32d2d", opacity: .6, transform: "translateX(-50%)" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}><span>0%</span><span style={{ color: "#a32d2d", fontWeight: 600 }}>{limit}% 한도</span><span>100%</span></div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: bC }}>{r > limit ? `⚠ 위험자산 ${r}% — 한도 초과` : r > limit * .85 ? `△ 위험자산 ${r}% — 한도 근접` : `✓ 위험자산 ${r}% — IRP 적합`}</div>
                  </div>
                );
              })()}
              
              {selS.type === "momentum" && (
                <MomentumCalculationPanel
                  detail={momentumDetail}
                  rawTargets={precalcRawTargets}
                  finalTargets={selectedTargets}
                  calcText={selS.calc}
                  calcLoading={calcLoading}
                  glideMinSafePct={glideMinSafePct}
                />
              )}

              <ST>{selS.type === "fixed" ? "전략 자산군 배분" : "투자 대상 자산군"}</ST>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>자산군</th>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>{selS.type === "fixed" ? "비중" : "역할"}</th>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>위험</th>
                </tr></thead>
                 <tbody>{selS.composition.map((c, i) => {
                  const targetW = selectedTargets[c.cls];
                  return (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                      <td style={{ padding: "8px 6px" }}><div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-main)" }}>{c.cls}</div></td>
                      <td style={{ padding: "8px 6px" }}>
                        {(selS.type === "fixed" || precalcTargets) && targetW != null
                          ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ flex: 1, height: 5, background: "var(--bg-main)", borderRadius: 3, overflow: "hidden", minWidth: 40 }}>
                                <div style={{ height: "100%", width: `${targetW}%`, background: ASSET_COLORS[c.cls] || "#888", borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, minWidth: 26, textAlign: "right" }}>{targetW}%</span>
                            </div>
                          : <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{calcLoading ? "계산 중..." : (c.note || "자동 계산")}</span>}
                      </td>
                      <td style={{ padding: "8px 6px" }}><span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 600, background: c.risk ? "#fcebeb" : "#eaf3de", color: c.risk ? "#791f1f" : "#27500a" }}>{c.risk ? "위험" : "안전"}</span></td>
                    </tr>
                  );
                })}</tbody>
                {Object.entries(selectedTargets)
                  .filter(([cls]) => !selS.composition.some(c => c.cls === cls))
                  .map(([cls, targetW]) => (
                    <tbody key={cls}>
                      <tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                        <td style={{ padding: "8px 6px" }}><div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-main)" }}>{cls}</div></td>
                        <td style={{ padding: "8px 6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ flex: 1, height: 5, background: "var(--bg-main)", borderRadius: 3, overflow: "hidden", minWidth: 40 }}>
                              <div style={{ height: "100%", width: `${targetW}%`, background: ASSET_COLORS[cls] || "#888", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, minWidth: 26, textAlign: "right" }}>{targetW}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 6px" }}><span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 600, background: "#eaf3de", color: "#27500a" }}>안전</span></td>
                      </tr>
                    </tbody>
                  ))}
              </table>
            </div>
            <div>
              <ST>자산 비중 시각화</ST>
              {Object.entries(selectedTargets).map(([cls, weight]) => (
                <div key={cls} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, minWidth: 100, color: "var(--text-main)", fontWeight: 500 }}>{cls}</div>
                  <div style={{ flex: 1, height: 8, background: "var(--bg-main)", borderRadius: 4, overflow: "hidden", minWidth: 50 }}><div style={{ height: "100%", width: `${weight}%`, background: ASSET_COLORS[cls] || "#888", borderRadius: 4 }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 35, textAlign: "right" }}>{weight}%</span>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <ST>계좌별 자산 배치</ST>
                {assetLocation.suggestions.slice(0, 5).map((item) => (
                  <div key={item.cls} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "6px 0", borderBottom: "0.5px solid var(--border-glass)" }}>
                    <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{item.cls}</span>
                    <span style={{ color: "var(--text-dim)", textAlign: "right" }}>{item.preferredAccount}</span>
                  </div>
                ))}
                {assetLocation.warnings.map((warning) => (
                  <div key={warning} style={{ fontSize: 10, color: "#791f1f", marginTop: 6 }}>{warning}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1rem", paddingTop: "1rem", borderTop: "0.5px solid var(--border-glass)", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{selS.type === "fixed" ? `DB에 전략(${selS.id})이 직접 적용됩니다. · 리밸런싱: ${selS.rebal}` : `모멘텀 가중치는 전략 적용 및 페이지 로드 시 자동 계산됩니다. · 리밸런싱: ${selS.rebal}`}</div>
            <Btn primary={selS.type === "fixed"} style={selS.type !== "fixed" ? { background: "#ba7517", color: "#fff", borderColor: "transparent" } : {}} onClick={() => onStrategyApply && onStrategyApply(selS.id)}>
              {selS.type === "fixed" ? "이 전략 적용하기" : "모멘텀 자동 계산 적용"}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
