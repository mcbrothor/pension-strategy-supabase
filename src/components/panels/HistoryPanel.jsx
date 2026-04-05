import React from "react";
import { Card, ST } from "../common/index.jsx";
import { fmt } from "../../utils/formatters.js";
import { ASSET_COLORS } from "../../constants/index.js";

export default function HistoryPanel({ portfolio }) {
  const history = portfolio.history || [];

  // SVG 미니 라인차트 설정
  const CW = 560, CH = 160, PAD = 52;
  const vals = history.map(h => h.total || 0);
  const minV = Math.min(...vals) * 0.97, maxV = Math.max(...vals) * 1.03;
  const tx = i => PAD + (i / (Math.max(history.length - 1, 1))) * (CW - PAD - 10);
  const ty = v => CH - 14 - ((v - minV) / (maxV - minV || 1)) * (CH - 30);
  const lp = history.map((h, i) => `${i ? "L" : "M"}${tx(i).toFixed(1)},${ty(h.total || 0).toFixed(1)}`).join(" ");
  const ap = lp + ` L${tx(history.length - 1)},${CH - 14} L${tx(0)},${CH - 14} Z`;

  const recent = history.slice(-6);
  const allCls = [...new Set(recent.flatMap(h => Object.keys(h.weights || {})))];

  return (
    <div>
      {history.length < 2 ? (
        <div style={{ background: "var(--bg-main)", borderRadius: "var(--border-radius-lg)", padding: "3rem", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
          계정에 로그인하고 자산을 2회 이상 저장하면 변동 추이가 표시됩니다.
        </div>
      ) : (
        <>
          <Card>
            <ST>총 평가금액 추이</ST>
            <div style={{ overflowX: "auto" }}>
              <svg viewBox={`0 0 ${CW} ${CH + 20}`} width="100%" style={{ display: "block" }}>
                {[0, .25, .5, .75, 1].map((t, i) => {
                  const v = minV + (maxV - minV) * t, y = ty(v);
                  return (<g key={i}><line x1={PAD} y1={y} x2={CW - 10} y2={y} stroke="rgba(128,128,128,0.1)" strokeWidth={1} /><text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-dim)">{fmt(v)}</text></g>);
                })}
                {history.map((h, i) => (
                  <text key={i} x={tx(i)} y={CH + 14} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{h.date}</text>
                ))}
                <path d={ap} fill="#185fa515" />
                <path d={lp} fill="none" stroke="#185fa5" strokeWidth={2.5} />
                {history.map((h, i) => (
                  <circle key={i} cx={tx(i)} cy={ty(h.total || 0)} r={3} fill="#185fa5" />
                ))}
              </svg>
            </div>
          </Card>

          <Card>
            <ST>최근 스냅샷</ST>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                  <th style={{ textAlign: "left", padding: "5px 8px", fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>날짜</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>전략</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>총 평가금액</th>
                  <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0, 10).map((h, i, arr) => {
                  const prev = arr[i + 1];
                  const chg = prev && prev.total > 0 ? ((h.total - prev.total) / prev.total * 100) : null;
                  return (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--border-glass)" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 500 }}>{h.date}</td>
                      <td style={{ padding: "7px 8px", color: "var(--text-dim)", fontSize: 11 }}>{h.strategy || "—"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 500 }}>{fmt(h.total || 0)}원</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: chg === null ? "var(--text-dim)" : chg >= 0 ? "#3b6d11" : "#a32d2d", fontWeight: 500 }}>
                        {chg === null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {recent.length > 0 && allCls.length > 0 && (
            <Card style={{ marginBottom: 0 }}>
              <ST>자산군별 비중 추이 (최근 {recent.length}회)</ST>
              {allCls.filter(cls => recent.some(h => (h.weights || {})[cls] > 0)).map(cls => (
                <div key={cls} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <div style={{ fontSize: 11, minWidth: 100, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cls}</div>
                  <div style={{ flex: 1, display: "flex", gap: 2 }}>
                    {recent.map((h, i) => {
                      const pct = (h.weights || {})[cls] || 0;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ width: "100%", height: 24, background: "var(--bg-main)", borderRadius: 3, overflow: "hidden", display: "flex", alignItems: "flex-end" }}>
                            <div style={{ width: "100%", height: `${Math.min(pct / 30 * 100, 100)}%`, background: ASSET_COLORS[cls] || "#888", borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 9, color: "var(--text-dim)" }}>{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {recent.map((h, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--text-dim)" }}>{h.date}</div>)}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
