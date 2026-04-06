import React, { useState } from "react";
import { Card, ST, Badge } from "../common/index.jsx";
import { fmt } from "../../utils/formatters.js";
import { STRATEGIES, ASSET_COLORS } from "../../constants/index.js";

export default function CompareWeights({ portfolio }) {
  const [benchKey, setBenchKey] = useState(portfolio.strategy || "allseason");
  const total = portfolio.total || 0;
  const bench = STRATEGIES.find(s => s.id === benchKey) || STRATEGIES[3];
  // 버그 수정: etfs → composition (실제 전략 데이터 필드명)
  const benchMap = Object.fromEntries((bench.composition || []).filter(e => e.w != null && e.w > 0).map(e => [e.cls, e.w]));

  const holdings = portfolio.holdings.map(h => {
    const cur = total > 0 ? Math.round(h.amt / total * 1000) / 10 : 0;
    const bm = benchMap[h.cls] || 0;
    const diff = Math.round((cur - bm) * 10) / 10;
    const targetAmt = Math.round(total * bm / 100);
    const actionAmt = Math.round((h.amt - targetAmt) / 10000) * 10000;
    return { ...h, cur, bm, diff, targetAmt, actionAmt };
  });

  const allCls = [...new Set([...holdings.map(h => h.cls), ...Object.keys(benchMap)])];
  const sells = holdings.filter(h => h.actionAmt > 5000).sort((a, b) => b.actionAmt - a.actionAmt);
  const buys = holdings.filter(h => h.actionAmt < -5000).sort((a, b) => a.actionAmt - b.actionAmt);

  return (
    <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyBetween: "space-between", marginBottom: ".875rem", flexWrap: "wrap", gap: 8 }}>
          <ST>벤치마크 전략 선택</ST>
          <select value={benchKey} onChange={e => setBenchKey(e.target.value)}
            style={{ padding: "6px 10px", border: "0.5px solid var(--border-glass)", borderRadius: "var(--radius-md)", fontSize: 12, background: "var(--bg-card)", color: "var(--text-main)", fontFamily: "var(--font-sans)" }}>
            {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type === 'fixed' ? '고정' : '모멘텀'})</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-dim)", marginBottom: "1rem" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 4, background: "var(--text-main)", opacity: .3, marginRight: 4, verticalAlign: "middle" }} />벤치마크 목표</span>
        </div>
        {allCls.map((cls, i) => {
          const h = holdings.find(x => x.cls === cls);
          const cur = h ? h.cur : 0;
          const bm = benchMap[cls] || 0;
          const diff = Math.round((cur - bm) * 10) / 10;
          const dc = Math.abs(diff) >= 5 ? (diff > 0 ? "#a32d2d" : "#0c447c") : "#27500a";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              <div style={{ fontSize: 11, minWidth: 120, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cls}</div>
              <div style={{ flex: 1, height: 7, background: "var(--bg-main)", borderRadius: 4, overflow: "hidden", position: "relative", minWidth: 60 }}>
                <div style={{ height: "100%", width: `${Math.min(cur, 100)}%`, background: ASSET_COLORS[cls] || "#888", borderRadius: 4 }} />
                {bm > 0 && <div style={{ position: "absolute", top: 0, left: `${Math.min(bm, 100)}%`, width: 2, height: "100%", background: "var(--text-main)", opacity: .35 }} />}
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, minWidth: 30, textAlign: "right" }}>{cur.toFixed(1)}%</span>
              <span style={{ fontSize: 11, fontWeight: 500, minWidth: 44, textAlign: "right", color: dc }}>{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%p</span>
            </div>
          );
        })}
      </Card>

      {(sells.length > 0 || buys.length > 0) && (
        <Card>
          <ST>리밸런싱 조정 금액 (5%p 이상 이탈)</ST>
          {sells.map((h, i) => (
            <div key={i} style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--border-glass)", fontSize: 12 }}>
              <div><span style={{ fontWeight: 500 }}>{h.etf}</span><span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 6 }}>{h.cls}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--text-dim)" }}>{h.cur.toFixed(1)}% → {h.bm.toFixed(1)}%</span>
                <Badge c="#791f1f" bg="#fcebeb">매도 {fmt(h.actionAmt)}원</Badge>
              </div>
            </div>
          ))}
          {buys.map((h, i) => (
            <div key={i} style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--border-glass)", fontSize: 12 }}>
              <div><span style={{ fontWeight: 500 }}>{h.etf}</span><span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 6 }}>{h.cls}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--text-dim)" }}>{h.cur.toFixed(1)}% → {h.bm.toFixed(1)}%</span>
                <Badge c="#0c447c" bg="#e6f1fb">매수 {fmt(Math.abs(h.actionAmt))}원</Badge>
              </div>
            </div>
          ))}
          <div style={{ marginTop: "1rem", padding: ".875rem", background: "var(--bg-main)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
            총 매도: {fmt(sells.reduce((s, h) => s + h.actionAmt, 0))}원 →
            총 매수: {fmt(Math.abs(buys.reduce((s, h) => s + h.actionAmt, 0)))}원
          </div>
        </Card>
      )}

      {sells.length === 0 && buys.length === 0 && (
        <div style={{ background: "#eaf3de", borderRadius: "var(--border-radius-lg)", padding: "1.5rem", textAlign: "center", fontSize: 13, color: "#27500a" }}>
          모든 자산이 벤치마크 비중 ±5%p 이내에 있습니다. 리밸런싱 불필요.
        </div>
      )}
    </div>
  );
}
