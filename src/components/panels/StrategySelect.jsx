import React, { useState } from "react";
import { Card, Badge, Btn, ST } from "../common/index.jsx";
import { STRATEGIES, ASSET_COLORS } from "../../constants/index.js";
import { irpLimit } from "../../utils/helpers.js";

export default function StrategySelect({ accountType, onStrategyApply }) {
  const [acc, setAcc] = useState(accountType || "IRP");
  const [filt, setFilt] = useState("all");
  const [sel, setSel] = useState(null);
  const limit = irpLimit(acc);
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

  return (
    <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>투자 전략 선택</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>삼성증권 연금계좌 실제 매수 가능 ETF 기준</div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {["IRP", "연금저축", "혼합"].map(t => (
              <Btn key={t} sm onClick={() => setAcc(t)} primary={acc === t}>{t}</Btn>
            ))}
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
          return (
            <div key={s.id} onClick={() => setSel(s.id === sel ? null : s.id)}
              style={{ background: "var(--bg-card)", border: `${isSel ? "2px" : "0.5px"} solid ${isSel ? (s.type === "fixed" ? "#3b6d11" : "#ba7517") : "var(--border-glass)"}`, borderRadius: "var(--border-radius-lg)", padding: "1rem", cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 7 }}>
                <Badge c={s.type === "fixed" ? "#27500a" : "#633806"} bg={s.type === "fixed" ? "#eaf3de" : "#faeeda"}>{s.type === "fixed" ? "실행가능" : "자동 계산"}</Badge>
                <Badge c={lvC[s.level]} bg={lvB[s.level]}>{s.level}</Badge>
                <Badge c={irp.c} bg={irp.bg}>{irp.lbl}</Badge>
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
              {selS.type === "fixed" ? "고정비중 — 즉시 실행 가능" : "모멘텀 — 매월 자동 계산"}
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
              {selS.type === "momentum" && selS.calc && (
                <div style={{ background: "#faeeda", border: "0.5px solid #f0a500", borderRadius: 8, padding: ".875rem", marginBottom: "1rem", fontSize: 11, color: "#633806", lineHeight: 1.8, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}>
                  <div style={{ fontWeight: 600, marginBottom: 5, fontFamily: "var(--font-sans)" }}>매월 계산 방법</div>
                  {selS.calc}
                </div>
              )}
              <ST>{selS.type === "fixed" ? "구성 ETF (삼성증권 연금계좌 매수 가능)" : "대상 ETF 풀"}</ST>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>ETF명</th>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>코드</th>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>{selS.type === "fixed" ? "비중" : "역할"}</th>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>위험</th>
                </tr></thead>
                <tbody>{selS.etfs.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                    <td style={{ padding: "6px 6px" }}><div style={{ fontWeight: 500, fontSize: 12 }}>{e.name}</div><div style={{ fontSize: 10, color: "var(--text-dim)" }}>{e.cls}</div></td>
                    <td style={{ padding: "6px 6px" }}><span style={{ fontFamily: "monospace", fontSize: 10, background: "var(--bg-main)", padding: "1px 4px", borderRadius: 3, color: "var(--text-dim)" }}>{e.code}</span></td>
                    <td style={{ padding: "6px 6px" }}>
                      {selS.type === "fixed" && e.w != null
                        ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ flex: 1, height: 5, background: "var(--bg-main)", borderRadius: 3, overflow: "hidden", minWidth: 40 }}><div style={{ height: "100%", width: `${e.w}%`, background: ASSET_COLORS[e.cls] || "#888", borderRadius: 3 }} /></div><span style={{ fontSize: 11, fontWeight: 600, minWidth: 26, textAlign: "right" }}>{e.w}%</span></div>
                        : <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{e.note || "-"}</span>}
                    </td>
                    <td style={{ padding: "6px 6px" }}><span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 600, background: e.risk ? "#fcebeb" : "#eaf3de", color: e.risk ? "#791f1f" : "#27500a" }}>{e.risk ? "위험" : "안전"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <ST>{selS.type === "fixed" ? "자산군별 배분" : "자산군 분류"}</ST>
              {selS.type === "fixed"
                ? selS.etfs.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
                    <div style={{ fontSize: 11, minWidth: 120, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name.replace(" (H)", "").replace("(합성H)", "")}</div>
                    <div style={{ flex: 1, height: 7, background: "var(--bg-main)", borderRadius: 4, overflow: "hidden", minWidth: 50 }}><div style={{ height: "100%", width: `${e.w}%`, background: ASSET_COLORS[e.cls] || "#888", borderRadius: 4 }} /></div>
                    <span style={{ fontSize: 12, fontWeight: 500, minWidth: 28, textAlign: "right" }}>{e.w}%</span>
                  </div>
                ))
                : [...new Set(selS.etfs.map(e => e.cls))].map(cls => (
                  <div key={cls} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: ASSET_COLORS[cls] || "#888", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{cls}</span>
                  </div>
                ))
              }
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1rem", paddingTop: "1rem", borderTop: "0.5px solid var(--border-glass)", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{selS.type === "fixed" ? `[투자전략설정] 시트 B1에 "${selS.id}" 입력 · 리밸런싱: ${selS.rebal}` : `매월 계산 후 [종목 입력] 시트에 기록 · 리밸런싱: ${selS.rebal}`}</div>
            <Btn primary={selS.type === "fixed"} style={selS.type !== "fixed" ? { background: "#ba7517", color: "#fff", borderColor: "transparent" } : {}} onClick={() => onStrategyApply && onStrategyApply(selS.id)}>
              {selS.type === "fixed" ? "이 전략 적용하기" : "모멘텀 자동 계산 적용"}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
