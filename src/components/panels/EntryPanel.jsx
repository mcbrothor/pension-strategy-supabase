import React, { useState, useEffect, useMemo } from "react";
import { Card, ST, Badge, Btn } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { ASSET_COLORS, STRATEGIES, ASSET_CLASSES } from "../../constants/index.js";

export default function EntryPanel({ portfolio, onSave, krEtfs = [], tickerMap = {}, masterError }) {
  const [rows, setRows] = useState(portfolio.holdings || []);
  const [loading, setLoading] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (portfolio.holdings && portfolio.holdings.length > 0) {
      setRows(portfolio.holdings);
    }
  }, [portfolio.holdings]);

  const totalAmt = rows.reduce((s, h) => s + (Number(h.amt) || 0), 0);
  const totalPrevAmt = rows.reduce((s, h) => s + (Number(h.costAmt) || 0), 0);
  const diffAmt = totalAmt - totalPrevAmt;

  const sortedAlloc = useMemo(() => {
    const counts = {};
    rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + (Number(r.amt) || 0); });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  async function fetchPrice(ticker, idx) {
    if (!ticker) return;
    setLoading(prev => ({ ...prev, [idx]: true }));
    try {
      // ticker가 숫자로 시작하면 국내로 간주 (필요 시 수정 가능)
      const isDomestic = /^[0-9]/.test(ticker);
      const url = `/api/kis-price?ticker=${ticker}${isDomestic ? "" : "&type=overseas"}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (data.price) {
        updateRow(idx, "price", data.price);
        if (data.name && !rows[idx].etf) updateRow(idx, "etf", data.name);
      }
    } catch (e) {
      console.error("Price fetch error:", e);
    } finally {
      setLoading(prev => ({ ...prev, [idx]: false }));
    }
  }

  function updateRow(idx, key, val) {
    const next = [...rows];
    
    if (key === "etf" && tickerMap[val]) {
      const info = tickerMap[val];
      next[idx] = { ...next[idx], etf: val, code: info.ticker, cls: info.assetClass || next[idx].cls };
    } else {
      next[idx] = { ...next[idx], [key]: val };
    }

    // 금액 계산 로직
    if (next[idx].cls === "현금MMF") {
      if (key === "amt") {
        next[idx].qty = 0;
        next[idx].price = 0;
      }
    } else {
      if (key === "qty" || key === "price") {
        const q = Number(key === "qty" ? val : next[idx].qty) || 0;
        const p = Number(key === "price" ? val : next[idx].price) || 0;
        next[idx].amt = q * p;
      }
    }
    setRows(next);
  }

  function addRow() {
    setRows([...rows, { etf: "", code: "", cls: "미국주식", qty: 0, price: 0, amt: 0, costAmt: 0 }]);
  }

  function removeRow(idx) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function clearAll() {
    if (window.confirm("모든 데이터를 초기화하시겠습니까?")) {
      setRows([]);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(rows);
      alert("잔고가 저장되었습니다.");
    } catch (e) {
      alert("저장 오류: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {masterError && (
        <div style={{ backgroundColor: "#faeeda", border: "1px solid #ba7517", borderRadius: 8, padding: "8px 12px", marginBottom: "1rem", fontSize: 12, color: "#633806" }}>
          ⚠️ 종목 자동 검색 데이터를 불러올 수 없습니다. {masterError}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1rem", alignItems: "start" }}>
        <div>
          <Card>
            <div style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <ST>수동 잔고 입력 및 수정</ST>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn sm onClick={clearAll} danger>전체 초기화</Btn>
                <Btn sm onClick={addRow} primary>종목 추가</Btn>
              </div>
            </div>

            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>관리</th>
                  <th style={{ width: 220 }}>종목명/티커</th>
                  <th style={{ width: 140 }}>자산군</th>
                  <th style={{ textAlign: "right", width: 80 }}>수량</th>
                  <th style={{ textAlign: "right", width: 100 }}>현재가</th>
                  <th style={{ textAlign: "right", width: 140 }}>평가금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <button onClick={() => removeRow(i)} style={{ border: "none", background: "none", color: "#a32d2d", cursor: "pointer", fontSize: 18, width: "100%", textAlign: "center" }}>×</button>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input 
                          value={r.etf} 
                          list="etf-list"
                          onChange={e => updateRow(i, "etf", e.target.value)} 
                          placeholder="종목명 입력" 
                        />
                        <div style={{ display: "flex", gap: 4 }}>
                          <input 
                            value={r.code} 
                            onChange={e => updateRow(i, "code", e.target.value)} 
                            onBlur={() => fetchPrice(r.code, i)} 
                            placeholder="티커" 
                            style={{ flex: 1, fontFamily: "monospace" }} 
                            disabled={r.cls === "현금MMF"}
                          />
                          <Btn sm onClick={() => fetchPrice(r.code, i)} disabled={loading[i] || !r.code || r.cls === "현금MMF"} style={{ padding: "0 10px", minHeight: "28px" }}>
                            {loading[i] ? "…" : "조회"}
                          </Btn>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select value={r.cls} onChange={e => updateRow(i, "cls", e.target.value)}>
                        {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input 
                        type="number" 
                        value={r.qty} 
                        onChange={e => updateRow(i, "qty", e.target.value)} 
                        style={{ textAlign: "right" }} 
                        disabled={r.cls === "현금MMF"}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input 
                        type="number" 
                        value={r.price} 
                        onChange={e => updateRow(i, "price", e.target.value)} 
                        style={{ textAlign: "right" }} 
                        disabled={r.cls === "현금MMF"}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                       {r.cls === "현금MMF" ? (
                         <input 
                            type="number" 
                            value={r.amt} 
                            onChange={e => updateRow(i, "amt", e.target.value)} 
                            placeholder="금액 입력"
                            style={{ textAlign: "right", fontWeight: 700, border: "1px solid var(--accent-main)" }}
                         />
                       ) : (
                         <div style={{ fontWeight: 700, color: "var(--text-main)", fontSize: 14 }}>
                           {fmt(r.amt)}
                         </div>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-dim)", fontSize: 13 }}>
                데이터가 없습니다. [종목 추가] 버튼을 눌러 시작하세요.
              </div>
            )}

            <div style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border-glass)" }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                총 평가금액: <strong style={{ color: "var(--text-main)", fontSize: 14 }}>{fmt(totalAmt)}원</strong>
              </div>
              <Btn primary onClick={handleSave} disabled={saving} style={{ minWidth: 120 }}>
                {saving ? "저장 중…" : "최종 잔고 저장"}
              </Btn>
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <ST>자산 배분 현황 (실시간)</ST>
            <div style={{ height: 200, position: "relative", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                {(() => {
                  let start = 0;
                  return sortedAlloc.map(([cls, amt], i) => {
                    if (totalAmt <= 0) return null;
                    const pct = amt / totalAmt * 100;
                    const x1 = Math.cos(2 * Math.PI * start / 100) * 40 + 50;
                    const y1 = Math.sin(2 * Math.PI * start / 100) * 40 + 50;
                    start += pct;
                    const x2 = Math.cos(2 * Math.PI * start / 100) * 40 + 50;
                    const y2 = Math.sin(2 * Math.PI * start / 100) * 40 + 50;
                    return (
                      <path key={i} d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${pct > 50 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={ASSET_COLORS[cls] || "#888"} stroke="var(--bg-card)" strokeWidth={1} />
                    );
                  });
                })()}
                <circle cx="50" cy="50" r="28" fill="var(--bg-card)" />
              </svg>
              <div style={{ position: "absolute", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>총 자산</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(totalAmt)}</div>
              </div>
            </div>
            {sortedAlloc.map(([cls, amt], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyBetween: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: ASSET_COLORS[cls] || "#888" }} />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{cls}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>
                  {((amt / (totalAmt || 1)) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
      
      <datalist id="etf-list">
        {krEtfs.map((item, idx) => (
          <option key={idx} value={item.name}>{item.ticker} | {item.assetClass}</option>
        ))}
      </datalist>
    </div>
  );
}
