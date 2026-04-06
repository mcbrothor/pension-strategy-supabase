import React, { useState, useEffect, useMemo } from "react";
import { Card, ST, Badge, Btn } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { ASSET_COLORS, ASSET_CLASSES } from "../../constants/index.js";

// -- Shared Styles for Premium Inputs --
const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1.5px solid var(--border-glass)",
  background: "rgba(255, 255, 255, 0.03)",
  color: "var(--text-main)",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.2s ease",
};

const labelStyle = {
  fontSize: "10.5px",
  fontWeight: 700,
  color: "var(--text-dim)",
  display: "block",
  marginBottom: "8px",
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  opacity: 0.8
};

// -- Edit Modal Component --
const EditModal = ({ item, isOpen, onClose, onSave, krEtfs, tickerMap }) => {
  if (!isOpen) return null;
  const [data, setData] = useState({ ...item });
  const [loading, setLoading] = useState(false);

  const isCash = data.cls === "현금MMF";

  async function fetchPrice() {
    if (!data.code || isCash) return;
    setLoading(true);
    try {
      const isDomestic = /^[0-9]/.test(data.code);
      const url = `/api/kis-price?ticker=${data.code}${isDomestic ? "" : "&type=overseas"}`;
      const res = await fetch(url);
      const resData = await res.json();
      if (!res.ok) {
        alert("시세 조회 실패: " + (resData.error || "알 수 없는 에러"));
        return;
      }
      if (resData.price) {
        setData(prev => {
          const next = { ...prev, price: resData.price, amt: (prev.qty || 0) * resData.price };
          if (resData.name && !prev.etf) next.etf = resData.name;
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      alert("시세 조회 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const update = (key, val) => {
    setData(prev => {
      const next = { ...prev, [key]: val };
      if (next.cls === "현금MMF") {
        next.qty = 0; next.price = 0;
      } else {
        if (key === "qty" || key === "price") {
          next.amt = (Number(next.qty) || 0) * (Number(next.price) || 0);
        }
      }
      return next;
    });
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <Card style={{ width: "95%", maxWidth: 480, padding: "2.5rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ marginBottom: "2rem" }}>
          <ST>종목 정보 수정</ST>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "-4px" }}>보유 자산의 상세 정보를 안전하게 정정합니다.</div>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={labelStyle}>자산군</label>
            <select style={inputStyle} value={data.cls} onChange={e => update("cls", e.target.value)}>
              {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>종목명</label>
            <input style={inputStyle} value={data.etf} onChange={e => update("etf", e.target.value)} list="etf-list-modal" placeholder="종목 이름을 입력하세요" />
          </div>
          
          {!isCash && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: "10px", alignItems: "end" }}>
               <div>
                  <label style={labelStyle}>티커 / 종목 코드</label>
                  <input style={{ ...inputStyle, fontFamily: "monospace" }} value={data.code} onChange={e => update("code", e.target.value)} onBlur={fetchPrice} placeholder="예: 360750" />
               </div>
               <Btn sm onClick={fetchPrice} style={{ height: "42px", width: "100%" }} disabled={loading}>{loading ? "..." : "시세조회"}</Btn>
            </div>
          )}
          
          {!isCash ? (
             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <div>
                   <label style={labelStyle}>수량</label>
                   <input type="number" style={inputStyle} value={data.qty} onChange={e => update("qty", e.target.value)} />
                </div>
                <div>
                   <label style={labelStyle}>현재가 (단가)</label>
                   <input type="number" style={inputStyle} value={data.price} onChange={e => update("price", e.target.value)} />
                </div>
             </div>
          ) : (
             <div>
                <label style={labelStyle}>실제 평가 금액 (원)</label>
                <input type="number" style={{ ...inputStyle, fontWeight: 700, fontSize: "16px", border: "1px solid var(--accent-main)" }} value={data.amt} onChange={e => update("amt", e.target.value)} />
             </div>
          )}
          
          <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Btn style={{ padding: "12px" }} onClick={onClose}>취소</Btn>
            <Btn primary style={{ padding: "12px" }} onClick={() => onSave(data)}>변경 사항 적용</Btn>
          </div>
        </div>
      </Card>
      <datalist id="etf-list-modal">
        {krEtfs.map((it, idx) => <option key={idx} value={it.name}>{it.ticker}</option>)}
      </datalist>
    </div>
  );
};

// -- Main Panel Component --
export default function EntryPanel({ portfolio, onSave, krEtfs = [], tickerMap = {}, masterError }) {
  const [rows, setRows] = useState(portfolio.holdings || []);
  const [newItem, setNewItem] = useState({ etf: "", code: "", cls: "미국주식", qty: 0, price: 0, amt: 0 });
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState({ item: null, idx: -1 });

  useEffect(() => {
    if (portfolio.holdings) setRows(portfolio.holdings);
  }, [portfolio.holdings]);

  const totalAmt = rows.reduce((s, h) => s + (Number(h.amt) || 0), 0);
  const sortedAlloc = useMemo(() => {
    const counts = {};
    rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + (Number(r.amt) || 0); });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // -- Add Logic --
  async function fetchNewItemPrice() {
    if (!newItem.code || newItem.cls === "현금MMF") return;
    setLoading(true);
    try {
      const isDomestic = /^[0-9]/.test(newItem.code);
      const url = `/api/kis-price?ticker=${newItem.code}${isDomestic ? "" : "&type=overseas"}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        alert("시세 조회 실패: " + (data.error || "알 수 없는 에러"));
        return;
      }
      if (data.price) {
        setNewItem(prev => {
          const next = { ...prev, price: data.price, amt: (prev.qty || 0) * data.price };
          if (data.name && !prev.etf) next.etf = data.name;
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      alert("시세 조회 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const updateNew = (key, val) => {
    setNewItem(prev => {
      const next = { ...prev, [key]: val };
      if (key === "etf" && tickerMap[val]) {
        const info = tickerMap[val];
        next.code = info.ticker; next.cls = info.assetClass || next.cls;
      }
      if (next.cls === "현금MMF") {
        next.qty = 0; next.price = 0;
      } else if (key === "qty" || key === "price") {
        next.amt = (Number(next.qty) || 0) * (Number(next.price) || 0);
      }
      return next;
    });
  };

  async function handleAddItem() {
    if (!newItem.cls) return alert("자산군을 선택하세요.");
    if (newItem.cls !== "현금MMF" && !newItem.code) return alert("종목 코드 또는 티커를 입력하세요.");
    if (Number(newItem.amt) <= 0) return alert("금액을 0보다 크게 입력하세요.");

    const updatedRows = [...rows, { ...newItem }];
    setRows(updatedRows);
    setNewItem({ etf: "", code: "", cls: "미국주식", qty: 0, price: 0, amt: 0 }); // reset form
    await onSave(updatedRows);
  }

  // -- Edit Logic --
  async function handleCompleteEdit(updatedItem) {
    const updatedRows = [...rows];
    updatedRows[editTarget.idx] = updatedItem;
    setRows(updatedRows);
    setEditTarget({ item: null, idx: -1 });
    await onSave(updatedRows);
  }

  // -- Delete Logic --
  async function handleRemove(idx) {
    if (!window.confirm("정말 이 종목을 삭제하시겠습니까?")) return;
    const updatedRows = rows.filter((_, i) => i !== idx);
    setRows(updatedRows);
    await onSave(updatedRows);
  }

  async function clearAll() {
    if (window.confirm("모든 데이터를 초기화하시겠습니까?")) {
      setRows([]);
      await onSave([]);
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Section: Add Form & Holding Table */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Add Form Card */}
          <Card accent="var(--accent-main)">
            <div style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <ST>새 종목 추가하기</ST>
              {newItem.cls !== "현금MMF" && (
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                  예상 합계: <strong style={{ color: "var(--accent-main)", fontSize: "15px" }}>{fmt(newItem.amt)}</strong>원
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Row 1: Main Info */}
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 180px", gap: "15px" }}>
                <div>
                  <label style={labelStyle}>자산군</label>
                  <select style={inputStyle} value={newItem.cls} onChange={e => updateNew("cls", e.target.value)}>
                    {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>종목명 (자동완성 추천)</label>
                  <input placeholder="종목명을 검색하세요" style={inputStyle} value={newItem.etf} onChange={e => updateNew("etf", e.target.value)} list="etf-list-main" />
                </div>
                {newItem.cls !== "현금MMF" ? (
                  <div>
                    <label style={labelStyle}>수량 및 단가</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input placeholder="수량" type="number" style={{ ...inputStyle, width: "70px", padding: "10px 8px" }} value={newItem.qty || ""} onChange={e => updateNew("qty", e.target.value)} />
                      <input placeholder="현재가" type="number" style={inputStyle} value={newItem.price || ""} onChange={e => updateNew("price", e.target.value)} onBlur={fetchNewItemPrice} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>현금 평가 금액</label>
                    <input placeholder="액수 입력 (원)" type="number" style={{ ...inputStyle, fontWeight: 700 }} value={newItem.amt || ""} onChange={e => updateNew("amt", e.target.value)} />
                  </div>
                )}
              </div>

              {/* Row 2: Helper & Action */}
              <div style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {newItem.cls !== "현금MMF" && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>티커 검색:</label>
                        <input placeholder="예: 360750" style={{ ...inputStyle, width: "100px", padding: "6px 10px" }} value={newItem.code} onChange={e => updateNew("code", e.target.value)} onBlur={fetchNewItemPrice} onKeyDown={e => e.key === 'Enter' && fetchNewItemPrice()} />
                      </div>
                      <Btn sm onClick={fetchNewItemPrice} disabled={loading || !newItem.code} style={{ height: "32px", fontSize: "11px" }}>
                        {loading ? "조회 중..." : "시세 자동조회"}
                      </Btn>
                    </>
                  )}
                  {newItem.cls === "현금MMF" && <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>현금 자산은 티커 입력 없이 금액만 저장됩니다.</div>}
                </div>
                <Btn primary onClick={handleAddItem} style={{ height: "38px", padding: "0 24px", fontSize: "13px", fontWeight: 700 }}>종목 포트폴리오에 추가</Btn>
              </div>
            </div>
          </Card>

          {/* Holdings List Card */}
          <Card>
            <div style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <ST>보유 자산 내역</ST>
              <Btn sm onClick={clearAll} danger>전체 삭제</Btn>
            </div>
            
            <div style={{ overflowX: "auto" }}>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>종목 정보</th>
                    <th style={{ width: 120 }}>자산군</th>
                    <th style={{ textAlign: "right", width: 100 }}>수량</th>
                    <th style={{ textAlign: "right", width: 120 }}>현재가</th>
                    <th style={{ textAlign: "right", width: 150 }}>평가금액</th>
                    <th style={{ textAlign: "center", width: 110 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "16px 0" }}>
                        <div style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text-main)" }}>{r.etf || "미지정 자산"}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace", marginTop: 4, letterSpacing: "0.02em" }}>{r.code || "CASH_ASSET"}</div>
                      </td>
                      <td style={{ padding: "16px 0" }}><Badge bg={ASSET_COLORS[r.cls] + "15"} c={ASSET_COLORS[r.cls]}>{r.cls}</Badge></td>
                      <td style={{ textAlign: "right", fontSize: "13.5px", padding: "16px 0" }}>{fmt(r.qty)}</td>
                      <td style={{ textAlign: "right", fontSize: "13.5px", color: "var(--text-dim)", padding: "16px 0" }}>{fmt(r.price)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontSize: "14.5px", color: "var(--text-main)", padding: "16px 0" }}>{fmt(r.amt)}</td>
                      <td style={{ textAlign: "center", padding: "16px 0" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                          <Btn sm onClick={() => setEditTarget({ item: r, idx: i })} style={{ padding: "4px 10px", fontSize: "10px" }}>수정</Btn>
                          <Btn sm onClick={() => handleRemove(i)} danger style={{ padding: "4px 10px", fontSize: "10px" }}>삭제</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-dim)", fontSize: "14px", border: "1px dashed var(--border-glass)", borderRadius: "8px", marginTop: "1rem" }}>
                등록된 자산이 없습니다. 상단 양식을 통해 포트폴리오를 구성해 보세요.
              </div>
            )}
            
            <div style={{ marginTop: "2rem", padding: "1.25rem", background: "var(--bg-main)", borderRadius: "12px", display: "flex", justifyBetween: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                총 <strong style={{ color: "var(--text-main)" }}>{rows.length}</strong>개의 자산 보유 중
              </div>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                자산 합계: <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--accent-main)", marginLeft: 6 }}>{fmt(totalAmt)}</span> 원
              </div>
            </div>
          </Card>
        </div>

        {/* Right Section: Allocation Status */}
        <div style={{ position: "sticky", top: "1rem" }}>
          <Card>
            <ST>자산군별 비중 (Real-time)</ST>
            <div style={{ height: 220, position: "relative", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                      <path key={i} d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${pct > 50 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={ASSET_COLORS[cls] || "#888"} stroke="var(--bg-card)" strokeWidth={1.5} />
                    );
                  });
                })()}
                <circle cx="50" cy="50" r="30" fill="var(--bg-card)" />
              </svg>
              <div style={{ position: "absolute", textAlign: "center" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-main)" }}>{((totalAmt / 100000000) * 100).toFixed(0)}%</div>
                <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 2 }}>목표 달성률</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {sortedAlloc.map(([cls, amt], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyBetween: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: ASSET_COLORS[cls] || "#888" }} />
                    <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500 }}>{cls}</span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)" }}>{((amt / (totalAmt || 1)) * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Modal Overlay */}
      <EditModal 
        isOpen={editTarget.idx !== -1}
        item={editTarget.item}
        onClose={() => setEditTarget({ item: null, idx: -1 })}
        onSave={handleCompleteEdit}
        krEtfs={krEtfs}
        tickerMap={tickerMap}
      />

      <datalist id="etf-list-main">
        {krEtfs.map((item, idx) => (
          <option key={idx} value={item.name}>{item.ticker} | {item.assetClass}</option>
        ))}
      </datalist>
    </div>
  );
}
