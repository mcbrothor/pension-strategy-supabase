import React, { useState, useEffect, useMemo } from "react";
import { Card, ST, Badge, Btn } from "../common/index.jsx";
import { fmt, fmtP } from "../../utils/formatters.js";
import { ASSET_COLORS, ASSET_CLASSES } from "../../constants/index.js";
import { parseHoldingsCsvText, buildHoldingsCsvTemplate } from "../../utils/holdingsCsv.js";

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

// -- Import Result Modal Component (CSV/Manual Batch) --
const ImportResultModal = ({ isOpen, onClose, results, onConfirm, tickerMap, currentRows }) => {
  if (!isOpen) return null;
  const [data, setData] = useState(results.map(r => ({
    ...r,
    cls: tickerMap[r.etf]?.assetClass || (tickerMap[r.code]?.assetClass) || "誘멸뎅二쇱떇"
  })));

  // -- Diff Analysis --
  const diffSummary = useMemo(() => {
    let news = 0, updates = 0, totals = data.length;
    data.forEach(item => {
      const existing = currentRows.find(r => (r.code && r.code === item.code) || r.etf === item.etf);
      if (!existing) news++;
      else if (existing.qty !== item.qty || existing.amt !== item.amt) updates++;
    });
    return { news, updates, totals };
  }, [data, currentRows]);

  const update = (idx, key, val) => {
    const next = [...data];
    next[idx][key] = val;
    if (key === "qty" || key === "price") {
      next[idx].amt = (Number(next[idx].qty) || 0) * (Number(next[idx].price) || 0);
    }
    setData(next);
  };

  const handleRemove = (idx) => setData(data.filter((_, i) => i !== idx));

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, backdropFilter: "blur(12px)" }}>
      <Card style={{ width: "95%", maxWidth: 800, padding: "2.5rem", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <ST>CSV ?먯궛 ?댁뿭 寃??</ST>
          <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "4px" }}>
            ?뚯씪?먯꽌 異붿텧???곗씠?곗엯?덈떎. ?뺥솗?섏? ?딆? ?뺣낫???섏젙 ??[?ы듃?대━?ㅼ뿉 諛섏쁺]???뚮윭二쇱꽭??
          </div>
        </div>

        {/* Diff Summary Box */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "1.5rem", padding: "1rem", background: "rgba(37, 99, 235, 0.05)", borderRadius: "10px", border: "1px solid rgba(37, 99, 235, 0.1)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "var(--color-primary)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>蹂寃??ы빆 ?붿빟</div>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>
              珥?{diffSummary.totals}媛?以?<span style={{ color: "var(--color-primary)" }}>{diffSummary.news}媛??좉퇋</span>, <span style={{ color: "var(--color-warning)" }}>{diffSummary.updates}媛??낅뜲?댄듃</span> ?덉젙
            </div>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
            諛섏쁺?섏떆寃좎뒿?덇퉴? "??瑜??꾨Ⅴ硫??꾩옱 ?ы듃?대━?ㅼ뿉 蹂묓빀?⑸땲??
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: "1.5rem" }}>
          <table className="premium-table" data-testid="csv-preview-table">
            <thead>
              <tr>
                <th>?먯궛援?</th>
                <th>醫낅ぉ紐?/ ?곗빱</th>
                <th style={{ textAlign: "right" }}>?섎웾</th>
                <th style={{ textAlign: "right" }}>?꾩옱媛</th>
                <th style={{ textAlign: "right" }}>?됯?湲덉븸</th>
                <th style={{ textAlign: "center" }}>??젣</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td>
                    <select style={{ ...inputStyle, padding: "6px" }} value={r.cls} onChange={e => update(i, "cls", e.target.value)}>
                      {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.etf}</div>
                    <div style={{ fontSize: "11px", opacity: 0.6 }}>{r.code}</div>
                  </td>
                  <td><input type="number" style={{ ...inputStyle, textAlign: "right", padding: "6px" }} value={r.qty} onChange={e => update(i, "qty", e.target.value)} /></td>
                  <td><input type="number" style={{ ...inputStyle, textAlign: "right", padding: "6px" }} value={r.price} onChange={e => update(i, "price", e.target.value)} /></td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(r.amt)}</td>
                  <td style={{ textAlign: "center" }}>
                    <Btn sm danger onClick={() => handleRemove(i)}>횞</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <Btn style={{ padding: "10px 20px" }} onClick={onClose}>痍⑥냼</Btn>
          <Btn primary style={{ padding: "10px 30px" }} onClick={() => onConfirm(data)} data-testid="csv-import-confirm">?ы듃?대━?ㅼ뿉 諛섏쁺?섍린</Btn>
        </div>
      </Card>
    </div>
  );
};

// -- Edit Modal Component --
const EditModal = ({ item, isOpen, onClose, onSave, krEtfs, tickerMap }) => {
  if (!isOpen) return null;
  const [data, setData] = useState({ ...item });
  const [loading, setLoading] = useState(false);

  const isCash = data.cls === "?꾧툑MMF";

  async function fetchPrice() {
    if (!data.code || isCash) return;
    setLoading(true);
    try {
      const isDomestic = /^[0-9]/.test(data.code);
      const url = `/api/kis-price?ticker=${data.code}${isDomestic ? "" : "&type=overseas"}`;
      const res = await fetch(url);
      const resData = await res.json();
      if (!res.ok) {
        alert("?쒖꽭 議고쉶 ?ㅽ뙣: " + (resData.error || "?????녿뒗 ?먮윭"));
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
      alert("?쒖꽭 議고쉶 以??ㅽ듃?뚰겕 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
    } finally {
      setLoading(false);
    }
  }

  const update = (key, val) => {
    setData(prev => {
      const next = { ...prev, [key]: val };
      if (next.cls === "?꾧툑MMF") {
        next.qty = 0; next.price = 0;
      } else {
        if (key === "qty" || key === "price") {
          next.amt = (Number(next.qty) || 0) * (Number(next.price) || 0);
        }
      }
      return next;
    });
  };

  const pnlPct = Number(data.costAmt) > 0
    ? ((Number(data.amt) - Number(data.costAmt)) / Number(data.costAmt)) * 100
    : null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <Card style={{ width: "95%", maxWidth: 480, padding: "2.5rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ marginBottom: "2rem" }}>
          <ST>醫낅ぉ ?뺣낫 ?섏젙</ST>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "-4px" }}>蹂댁쑀 ?먯궛???곸꽭 ?뺣낫瑜??덉쟾?섍쾶 ?뺤젙?⑸땲??</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={labelStyle}>?먯궛援?</label>
            <select style={inputStyle} value={data.cls} onChange={e => update("cls", e.target.value)}>
              {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>醫낅ぉ紐?</label>
            <input style={inputStyle} value={data.etf} onChange={e => update("etf", e.target.value)} list="etf-list-modal" placeholder="Enter asset name" />
          </div>

          {!isCash && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: "10px", alignItems: "end" }}>
              <div>
                <label style={labelStyle}>?곗빱 / 醫낅ぉ 肄붾뱶</label>
                <input style={{ ...inputStyle, fontFamily: "monospace" }} value={data.code} onChange={e => update("code", e.target.value)} onBlur={fetchPrice} placeholder="?? 360750" />
              </div>
              <Btn sm onClick={fetchPrice} style={{ height: "42px", width: "100%" }} disabled={loading}>{loading ? "..." : "?쒖꽭議고쉶"}</Btn>
            </div>
          )}

          {!isCash ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div>
                <label style={labelStyle}>?섎웾</label>
                <input type="number" style={inputStyle} value={data.qty} onChange={e => update("qty", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>?꾩옱媛 (?④?)</label>
                <input type="number" style={inputStyle} value={data.price} onChange={e => update("price", e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <label style={labelStyle}>?ㅼ젣 ?됯? 湲덉븸 (??</label>
              <input type="number" style={{ ...inputStyle, fontWeight: 700, fontSize: "16px", border: "1px solid var(--accent-main)" }} value={data.amt} onChange={e => update("amt", e.target.value)} />
            </div>
          )}

          <div>
            <label style={labelStyle}>留ㅼ엯?먭? / ?먭툑 (?좏깮)</label>
            <input
              type="number"
              style={inputStyle}
              value={data.costAmt || ""}
              onChange={e => update("costAmt", e.target.value)}
              placeholder="Enter cost amount"
            />
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 5 }}>
              {pnlPct != null ? `?꾩옱 ?됯??먯씡瑜?${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : "?낅젰 ??蹂닿퀬?쒖쓽 ?됯??먯씡瑜?怨꾩궛??諛섏쁺?⑸땲??"}
            </div>
          </div>

          <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Btn style={{ padding: "12px" }} onClick={onClose}>痍⑥냼</Btn>
            <Btn primary style={{ padding: "12px" }} onClick={() => onSave(data)}>蹂寃??ы빆 ?곸슜</Btn>
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
export default function EntryPanel({ portfolio, onSave, onRowsChange, krEtfs = [], tickerMap = {}, masterError }) {
  const [rows, setRows] = useState(portfolio.holdings || []);
  const [newItem, setNewItem] = useState({ etf: "", code: "", cls: "誘멸뎅二쇱떇", qty: 0, price: 0, amt: 0, costAmt: 0 });
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState({ item: null, idx: -1 });
  const [importResults, setImportResults] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [updatedTickers, setUpdatedTickers] = useState(new Set());

  useEffect(() => {
    if (portfolio.holdings) setRows(portfolio.holdings);
  }, [portfolio.holdings]);

  const syncRows = (nextRows) => {
    setRows(nextRows);
    if (onRowsChange) onRowsChange(nextRows);
  };

  const totalAmt = rows.reduce((s, h) => s + (Number(h.amt) || 0), 0);
  const sortedAlloc = useMemo(() => {
    const counts = {};
    rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + (Number(r.amt) || 0); });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // -- Add Logic --
  async function fetchNewItemPrice() {
    if (!newItem.code || newItem.cls === "?꾧툑MMF") return;
    setLoading(true);
    try {
      const isDomestic = /^[0-9]/.test(newItem.code);
      const url = `/api/kis-price?ticker=${newItem.code}${isDomestic ? "" : "&type=overseas"}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        alert("?쒖꽭 議고쉶 ?ㅽ뙣: " + (data.error || "?????녿뒗 ?먮윭"));
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
      alert("?쒖꽭 議고쉶 以??ㅽ듃?뚰겕 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
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
      if (next.cls === "?꾧툑MMF") {
        next.qty = 0; next.price = 0;
      } else if (key === "qty" || key === "price") {
        next.amt = (Number(next.qty) || 0) * (Number(next.price) || 0);
      }
      return next;
    });
  };

  async function handleAddItem() {
    if (!newItem.cls) return alert("?먯궛援곗쓣 ?좏깮?섏꽭??");
    if (newItem.cls !== "?꾧툑MMF" && !newItem.code) return alert("醫낅ぉ 肄붾뱶 ?먮뒗 ?곗빱瑜??낅젰?섏꽭??");
    if (Number(newItem.amt) <= 0) return alert("湲덉븸??0蹂대떎 ?ш쾶 ?낅젰?섏꽭??");

    const updatedRows = [...rows, { ...newItem }];
    syncRows(updatedRows);
    setNewItem({ etf: "", code: "", cls: "誘멸뎅二쇱떇", qty: 0, price: 0, amt: 0, costAmt: 0 }); // reset form
    await onSave(updatedRows);
  }

  // -- Edit Logic --
  async function handleCompleteEdit(updatedItem) {
    const updatedRows = [...rows];
    updatedRows[editTarget.idx] = updatedItem;
    syncRows(updatedRows);
    setEditTarget({ item: null, idx: -1 });
    await onSave(updatedRows);
  }

  // -- Delete Logic --
  async function handleRemove(idx) {
    if (!window.confirm("?뺣쭚 ??醫낅ぉ????젣?섏떆寃좎뒿?덇퉴?")) return;
    const updatedRows = rows.filter((_, i) => i !== idx);
    syncRows(updatedRows);
    await onSave(updatedRows);
  }

  async function clearAll() {
    if (window.confirm("紐⑤뱺 ?곗씠?곕? 珥덇린?뷀븯?쒓쿋?듬땲源?")) {
      syncRows([]);
      await onSave([]);
    }
  }

  // -- CSV Import Logic --
  function decodeCsvBuffer(buffer) {
    const utf8Text = new TextDecoder("utf-8").decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text;
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch {
      return utf8Text;
    }
  }

  function downloadCsvTemplate() {
    const csv = "\uFEFF" + buildHoldingsCsvTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "holdings_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (evt) => {
      try {
        const text = decodeCsvBuffer(evt.target.result);
        const parsed = parseHoldingsCsvText(text, tickerMap);

        if (parsed.length === 0) throw new Error("No valid holdings rows found.");
        setImportResults(parsed);
      } catch (err) {
        alert("CSV parse failed: " + err.message);
      }
      setImportLoading(false);
    };
    reader.onerror = () => {
      alert("File read failed");
      setImportLoading(false);
    };
  }

  function handleBatchAdd(items) {

    if (!window.confirm(`珥?${items.length}媛쒖쓽 ??ぉ???쇱씠釉??ы듃?대━?ㅼ뿉 諛섏쁺?섏떆寃좎뒿?덇퉴?`)) return;

    const existingMap = {};
    const newUpdated = new Set();
    
    rows.forEach(r => { existingMap[r.code || r.etf] = r; });

    items.forEach(item => {
      const key = item.code || item.etf;
      existingMap[key] = item;
      newUpdated.add(key);
    });

    const updatedList = Object.values(existingMap);
    syncRows(updatedList);
    onSave(updatedList);
    setImportResults(null);

    setUpdatedTickers(newUpdated);
    setTimeout(() => setUpdatedTickers(new Set()), 5000); // 5珥???媛뺤“ ?쒓굅
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Section: CSV Import & Add Form & Holding Table */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* CSV Import Upload Zone */}
          <Card style={{ border: "2px dashed var(--accent-main)", opacity: importLoading ? 0.6 : 1, transition: "all 0.3s ease", position: "relative", background: "rgba(37, 99, 235, 0.02)" }}>
             <div style={{ textAlign: "center", padding: "1rem" }}>
                <div style={{ fontSize: "24px", marginBottom: "10px" }}>?뱤</div>
                <div style={{ fontWeight: 700, color: "var(--accent-main)", marginBottom: "4px" }}>
                  {importLoading ? "Parsing CSV..." : "Upload Holdings CSV"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                  MTS?먯꽌 ?ㅼ슫濡쒕뱶??蹂댁쑀?댁뿭 CSV ?뚯씪???낅줈?쒗븯???ы듃?대━?ㅻ? ?먮룞 媛깆떊?섏꽭??
                </div>
                <div style={{ marginTop: "10px", position: "relative", zIndex: 2 }}>
                  <Btn sm onClick={downloadCsvTemplate} data-testid="csv-template-download">Download CSV Template</Btn>
                </div>
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
                  onChange={handleCsvFile}
                  data-testid="csv-upload-input"
                  disabled={importLoading}
                />
             </div>
             {importLoading && (
               <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.05)", borderRadius: "12px" }}>
                  <div className="spinner"></div>
               </div>
             )}
          </Card>

          {/* Add Form Card */}
          <Card accent="var(--accent-main)">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <ST>??醫낅ぉ 異붽??섍린</ST>
              {newItem.cls !== "?꾧툑MMF" && (
                <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                  ?덉긽 ?⑷퀎: <strong style={{ color: "var(--accent-main)", fontSize: "15px" }}>{fmt(newItem.amt)}</strong>??                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Row 1: Main Info */}
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 180px", gap: "15px" }}>
                <div>
                  <label style={labelStyle}>?먯궛援?</label>
                  <select style={inputStyle} value={newItem.cls} onChange={e => updateNew("cls", e.target.value)} data-testid="manual-class-select">
                    {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>醫낅ぉ紐?(?먮룞?꾩꽦 異붿쿇)</label>
                  <input placeholder="醫낅ぉ紐낆쓣 寃?됲븯?몄슂" style={inputStyle} value={newItem.etf} onChange={e => updateNew("etf", e.target.value)} list="etf-list-main" />
                </div>
                {newItem.cls !== "?꾧툑MMF" ? (
                  <div>
                    <label style={labelStyle}>?섎웾 諛??④?</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input placeholder="?섎웾" type="number" style={{ ...inputStyle, width: "70px", padding: "10px 8px" }} value={newItem.qty || ""} onChange={e => updateNew("qty", e.target.value)} data-testid="manual-qty-input" />
                      <input placeholder="?꾩옱媛" type="number" style={inputStyle} value={newItem.price || ""} onChange={e => updateNew("price", e.target.value)} onBlur={fetchNewItemPrice} data-testid="manual-price-input" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>?꾧툑 ?됯? 湲덉븸</label>
                    <input placeholder="?≪닔 ?낅젰 (??" type="number" style={{ ...inputStyle, fontWeight: 700 }} value={newItem.amt || ""} onChange={e => updateNew("amt", e.target.value)} data-testid="manual-amount-input" />
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>留ㅼ엯?먭? / ?먭툑 (?좏깮)</label>
                <input
                  placeholder="Optional cost amount"
                  type="number"
                  style={inputStyle}
                  value={newItem.costAmt || ""}
                  onChange={e => updateNew("costAmt", e.target.value)}
                />
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 5 }}>
                  MTS??留ㅼ엯湲덉븸???낅젰?섎㈃ 由ы룷?몄? ?먯궛 紐⑸줉?먯꽌 ?먭? 湲곗? ?섏씡瑜좎쓣 怨꾩궛?⑸땲??
                </div>
              </div>

              {/* Row 2: Helper & Action */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {newItem.cls !== "?꾧툑MMF" && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>?곗빱 寃??</label>
                        <input placeholder="?? 360750" style={{ ...inputStyle, width: "100px", padding: "6px 10px" }} value={newItem.code} onChange={e => updateNew("code", e.target.value)} onBlur={fetchNewItemPrice} onKeyDown={e => e.key === 'Enter' && fetchNewItemPrice()} data-testid="manual-code-input" />
                      </div>
                      <Btn sm onClick={fetchNewItemPrice} disabled={loading || !newItem.code} style={{ height: "32px", fontSize: "11px" }}>
                        {loading ? "議고쉶 以?.." : "?쒖꽭 ?먮룞議고쉶"}
                      </Btn>
                    </>
                  )}
                  {newItem.cls === "?꾧툑MMF" && <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>?꾧툑 ?먯궛? ?곗빱 ?낅젰 ?놁씠 湲덉븸留???λ맗?덈떎.</div>}
                </div>
                <Btn primary onClick={handleAddItem} style={{ height: "38px", padding: "0 24px", fontSize: "13px", fontWeight: 700 }} data-testid="manual-add-button">醫낅ぉ ?ы듃?대━?ㅼ뿉 異붽?</Btn>
              </div>
            </div>
          </Card>

          {/* Holdings List Card */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <ST>蹂댁쑀 ?먯궛 ?댁뿭</ST>
              <Btn sm onClick={clearAll} danger>?꾩껜 ??젣</Btn>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="premium-table" data-testid="holdings-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>醫낅ぉ ?뺣낫</th>
                    <th style={{ width: 120 }}>?먯궛援?</th>
                    <th style={{ textAlign: "right", width: 100 }}>?섎웾</th>
                    <th style={{ textAlign: "right", width: 120 }}>?꾩옱媛</th>
                    <th style={{ textAlign: "right", width: 150 }}>?됯?湲덉븸</th>
                    <th style={{ textAlign: "right", width: 140 }}>?됯??먯씡</th>
                    <th style={{ textAlign: "center", width: 110 }}>愿由?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const pnl = Number(r.costAmt) > 0 ? Number(r.amt) - Number(r.costAmt) : null;
                    const pnlPct = pnl != null ? (pnl / Number(r.costAmt)) * 100 : null;
                    const isNewUpdate = updatedTickers.has(r.code || r.etf);

                    return (
                      <tr key={i} data-testid="holdings-row" style={{
                        borderBottom: "0.5px solid rgba(255,255,255,0.03)",
                        background: isNewUpdate ? "rgba(5, 150, 105, 0.08)" : undefined,
                        transition: "background 1s ease"
                      }}>
                        <td style={{ padding: "16px 0", position: "relative" }}>
                          {isNewUpdate && (
                            <div style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: "4px", height: "70%", background: "var(--color-success)", borderRadius: "2px" }} />
                          )}
                          <div style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text-main)", display: "flex", alignItems: "center", gap: 8 }}>
                            {r.etf || "誘몄????먯궛"}
                            {isNewUpdate && <Badge bg="var(--color-success)" c="#fff" style={{ fontSize: "9px", padding: "2px 6px" }}>理쒓렐?ㅼ틪</Badge>}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace", marginTop: 4, letterSpacing: "0.02em" }}>{r.code || "CASH_ASSET"}</div>
                        </td>
                        <td style={{ padding: "16px 0" }}><Badge bg={ASSET_COLORS[r.cls] + "15"} c={ASSET_COLORS[r.cls]}>{r.cls}</Badge></td>
                        <td style={{ textAlign: "right", fontSize: "13.5px", padding: "16px 0" }}>{fmt(r.qty)}</td>
                        <td style={{ textAlign: "right", fontSize: "13.5px", color: "var(--text-dim)", padding: "16px 0" }}>{fmt(r.price)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontSize: "14.5px", color: "var(--text-main)", padding: "16px 0" }}>{fmt(r.amt)}</td>
                        <td style={{ textAlign: "right", fontSize: "12px", padding: "16px 0", color: pnl == null ? "var(--text-dim)" : pnl >= 0 ? "var(--alert-ok-color)" : "var(--alert-danger-color)" }}>
                          {pnl == null ? "?먭? ?꾩슂" : `${pnl >= 0 ? "+" : "-"}${fmt(Math.abs(pnl))} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`}
                        </td>
                        <td style={{ textAlign: "center", padding: "16px 0" }}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                            <Btn sm onClick={() => setEditTarget({ item: r, idx: i })} style={{ padding: "4px 10px", fontSize: "10px" }}>?섏젙</Btn>
                            <Btn sm onClick={() => handleRemove(i)} danger style={{ padding: "4px 10px", fontSize: "10px" }}>??젣</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-dim)", fontSize: "14px", border: "1px dashed var(--border-glass)", borderRadius: "8px", marginTop: "1rem" }}>
                ?깅줉???먯궛???놁뒿?덈떎. ?곷떒 ?묒떇???듯빐 ?ы듃?대━?ㅻ? 援ъ꽦??蹂댁꽭??
              </div>
            )}

            <div style={{ marginTop: "2rem", padding: "1.25rem", background: "var(--bg-main)", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                珥?<strong style={{ color: "var(--text-main)" }}>{rows.length}</strong>媛쒖쓽 ?먯궛 蹂댁쑀 以?              </div>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                ?먯궛 ?⑷퀎: <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--accent-main)", marginLeft: 6 }}>{fmt(totalAmt)}</span> ??              </div>
            </div>
          </Card>
        </div>

        {/* Right Section: Allocation Status */}
        <div style={{ position: "sticky", top: "1rem" }}>
          <Card>
            <ST>?먯궛援곕퀎 鍮꾩쨷 (Real-time)</ST>
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
                <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 2 }}>紐⑺몴 ?ъ꽦瑜?</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {sortedAlloc.map(([cls, amt], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      <ImportResultModal
        isOpen={!!importResults}
        results={importResults || []}
        onClose={() => setImportResults(null)}
        onConfirm={handleBatchAdd}
        tickerMap={tickerMap}
        currentRows={rows}
      />

      <datalist id="etf-list-main">
        {krEtfs.map((item, idx) => (
          <option key={idx} value={item.name}>{item.ticker} | {item.assetClass}</option>
        ))}
      </datalist>
    </div>
  );
}





