import React, { useEffect, useMemo, useState } from "react";
import { Badge, Btn, Card, ST } from "../common/index.jsx";
import { fmt } from "../../utils/formatters.js";
import { ASSET_CLASSES, ASSET_COLORS } from "../../constants/index.js";
import { buildHoldingsCsvTemplate, parseHoldingsCsvText } from "../../utils/holdingsCsv.js";

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
};

const labelStyle = {
  fontSize: "11px",
  fontWeight: 700,
  color: "var(--text-dim)",
  display: "block",
  marginBottom: "8px",
  letterSpacing: "0.03em",
};

const ASSET_CLASS_DISPLAY_NAMES = [
  "미국주식",
  "선진국주식",
  "신흥국주식",
  "국내주식",
  "미국단기채권",
  "미국중기채권",
  "물가연동채권",
  "회사채",
  "하이일드채권",
  "신흥국채권",
  "글로벌채권",
  "금",
  "원자재",
  "부동산리츠",
  "현금MMF",
];

const ASSET_CLASS_LABELS = new Map(
  ASSET_CLASSES.map((value, index) => [value, ASSET_CLASS_DISPLAY_NAMES[index] || value])
);

const DEFAULT_ASSET_CLASS = ASSET_CLASSES[0];
const CASH_ASSET_CLASS =
  ASSET_CLASSES.find((item) => ASSET_CLASS_LABELS.get(item) === "현금MMF") ||
  ASSET_CLASSES[ASSET_CLASSES.length - 1];

function getAssetClassLabel(assetClass) {
  return ASSET_CLASS_LABELS.get(assetClass) || assetClass || "기타";
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "");
}

function resolveAssetByName(name, tickerMap = {}, krEtfs = []) {
  if (!name) return null;

  if (tickerMap[name]) return tickerMap[name];

  const normalizedInput = normalizeName(name);
  if (!normalizedInput) return null;

  const exact = krEtfs.find((asset) => normalizeName(asset.name) === normalizedInput);
  if (exact) return exact;

  const partialMatches = krEtfs.filter((asset) => {
    const normalizedAssetName = normalizeName(asset.name);
    return normalizedAssetName.includes(normalizedInput) || normalizedInput.includes(normalizedAssetName);
  });

  return partialMatches.length === 1 ? partialMatches[0] : null;
}

function makeEmptyItem() {
  return {
    etf: "",
    code: "",
    cls: DEFAULT_ASSET_CLASS,
    qty: 0,
    price: 0,
    amt: 0,
    costAmt: 0,
  };
}

function mergeHolding(existingItem, incomingItem) {
  const mergedQty = (Number(existingItem.qty) || 0) + (Number(incomingItem.qty) || 0);
  const mergedAmt = (Number(existingItem.amt) || 0) + (Number(incomingItem.amt) || 0);
  const mergedCostAmt = (Number(existingItem.costAmt) || 0) + (Number(incomingItem.costAmt) || 0);

  return {
    ...existingItem,
    ...incomingItem,
    id: existingItem.id || incomingItem.id,
    etf: incomingItem.etf || existingItem.etf,
    code: incomingItem.code || existingItem.code,
    cls: incomingItem.cls || existingItem.cls,
    qty: incomingItem.cls === CASH_ASSET_CLASS ? 0 : mergedQty,
    price: Number(incomingItem.price) || Number(existingItem.price) || 0,
    amt: incomingItem.cls === CASH_ASSET_CLASS ? mergedAmt : mergedAmt,
    costAmt: mergedCostAmt,
  };
}

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
  const blob = new Blob(["\uFEFF" + buildHoldingsCsvTemplate()], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "holdings_template.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function ImportResultModal({ isOpen, results, currentRows, onClose, onConfirm }) {
  const [rows, setRows] = useState(results);

  useEffect(() => {
    setRows(results);
  }, [results]);

  const summary = useMemo(() => {
    let added = 0;
    let updated = 0;

    rows.forEach((item) => {
      const existing = currentRows.find((row) => (row.code && row.code === item.code) || row.etf === item.etf);
      if (!existing) added += 1;
      else updated += 1;
    });

    return { added, updated, total: rows.length };
  }, [currentRows, rows]);

  if (!isOpen) return null;

  const updateCell = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      if (key === "qty" || key === "price") {
        next[index].amt = (Number(next[index].qty) || 0) * (Number(next[index].price) || 0);
      }
      return next;
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
      <Card style={{ width: "95%", maxWidth: 860, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <ST>CSV 업로드 검토</ST>
        <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "1rem" }}>
          업로드한 보유내역을 반영하기 전에 종목 분류와 수량을 확인할 수 있습니다.
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "1rem", flexWrap: "wrap" }}>
          <Badge c="#0c447c" bg="#e6f1fb">총 {summary.total}건</Badge>
          <Badge c="#27500a" bg="#eaf3de">신규 {summary.added}건</Badge>
          <Badge c="#633806" bg="#faeeda">업데이트 {summary.updated}건</Badge>
        </div>

        <div style={{ overflow: "auto", marginBottom: "1rem" }}>
          <table className="premium-table" data-testid="csv-preview-table">
            <thead>
              <tr>
                <th>자산군</th>
                <th>종목</th>
                <th style={{ textAlign: "right" }}>수량</th>
                <th style={{ textAlign: "right" }}>현재가</th>
                <th style={{ textAlign: "right" }}>평가금액</th>
                <th style={{ textAlign: "center" }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={`${item.code}-${index}`}>
                  <td>
                    <select style={{ ...inputStyle, padding: "6px 8px" }} value={item.cls} onChange={(e) => updateCell(index, "cls", e.target.value)}>
                      {ASSET_CLASSES.map((assetClass) => (
                        <option key={assetClass} value={assetClass}>
                          {getAssetClassLabel(assetClass)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.etf}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{item.code}</div>
                  </td>
                  <td>
                    <input type="number" style={{ ...inputStyle, textAlign: "right", padding: "6px 8px" }} value={item.qty} onChange={(e) => updateCell(index, "qty", e.target.value)} />
                  </td>
                  <td>
                    <input type="number" style={{ ...inputStyle, textAlign: "right", padding: "6px 8px" }} value={item.price} onChange={(e) => updateCell(index, "price", e.target.value)} />
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(item.amt)}</td>
                  <td style={{ textAlign: "center" }}>
                    <Btn sm danger onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>
                      삭제
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose}>취소</Btn>
          <Btn primary data-testid="csv-import-confirm" onClick={() => onConfirm(rows)}>
            포트폴리오에 반영
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function EditModal({ isOpen, item, krEtfs, onClose, onSave }) {
  const [form, setForm] = useState(item || makeEmptyItem());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(item || makeEmptyItem());
  }, [item]);

  if (!isOpen) return null;

  const isCash = form.cls === CASH_ASSET_CLASS;

  const updateForm = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (next.cls === CASH_ASSET_CLASS) {
        next.qty = 0;
        next.price = 0;
      }
      if (key === "qty" || key === "price") {
        next.amt = (Number(next.qty) || 0) * (Number(next.price) || 0);
      }
      return next;
    });
  };

  const fetchPrice = async () => {
    if (!form.code || isCash) return;
    setLoading(true);
    try {
      const isDomestic = /^[0-9]/.test(form.code);
      const response = await fetch(`/api/kis-price?ticker=${form.code}${isDomestic ? "" : "&type=overseas"}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "시세 조회에 실패했습니다.");

      setForm((prev) => ({
        ...prev,
        etf: prev.etf || data.name || prev.etf,
        price: data.price,
        amt: (Number(prev.qty) || 0) * data.price,
      }));
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const pnlPct =
    Number(form.costAmt) > 0 ? (((Number(form.amt) || 0) - Number(form.costAmt)) / Number(form.costAmt)) * 100 : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <Card style={{ width: "95%", maxWidth: 520 }}>
        <ST>보유 자산 수정</ST>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>자산군</label>
            <select style={inputStyle} value={form.cls} onChange={(e) => updateForm("cls", e.target.value)}>
              {ASSET_CLASSES.map((assetClass) => (
                <option key={assetClass} value={assetClass}>
                  {getAssetClassLabel(assetClass)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>종목명</label>
            <input style={inputStyle} value={form.etf} onChange={(e) => updateForm("etf", e.target.value)} list="etf-list-modal" placeholder="종목명을 입력하세요" />
          </div>

          {!isCash && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: "10px", alignItems: "end" }}>
              <div>
                <label style={labelStyle}>티커</label>
                <input style={{ ...inputStyle, fontFamily: "monospace" }} value={form.code} onChange={(e) => updateForm("code", e.target.value)} onBlur={fetchPrice} placeholder="예: 360750" />
              </div>
              <Btn sm onClick={fetchPrice} disabled={loading} style={{ height: "42px" }}>
                {loading ? "조회 중" : "시세 조회"}
              </Btn>
            </div>
          )}

          {isCash ? (
            <div>
              <label style={labelStyle}>금액</label>
              <input type="number" style={inputStyle} value={form.amt || ""} onChange={(e) => updateForm("amt", e.target.value)} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={labelStyle}>수량</label>
                <input type="number" style={inputStyle} value={form.qty || ""} onChange={(e) => updateForm("qty", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>현재가</label>
                <input type="number" style={inputStyle} value={form.price || ""} onChange={(e) => updateForm("price", e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>매입원가 / 원금</label>
            <input type="number" style={inputStyle} value={form.costAmt || ""} onChange={(e) => updateForm("costAmt", e.target.value)} placeholder="선택 입력" />
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px" }}>
              {pnlPct == null ? "원가를 입력하면 평가손익을 계산합니다." : `현재 수익률 ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <Btn onClick={onClose}>취소</Btn>
            <Btn primary onClick={() => onSave(form)}>
              저장
            </Btn>
          </div>
        </div>
      </Card>
      <datalist id="etf-list-modal">
        {krEtfs.map((asset) => (
          <option key={asset.ticker} value={asset.name}>
            {asset.ticker}
          </option>
        ))}
      </datalist>
    </div>
  );
}

export default function EntryPanel({ portfolio, onSave, onRowsChange, krEtfs = [], tickerMap = {}, masterError }) {
  const [rows, setRows] = useState(portfolio.holdings || []);
  const [newItem, setNewItem] = useState(makeEmptyItem());
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState({ item: null, idx: -1 });
  const [importResults, setImportResults] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [updatedTickers, setUpdatedTickers] = useState(new Set());

  useEffect(() => {
    setRows(portfolio.holdings || []);
  }, [portfolio.holdings]);

  const syncRows = (nextRows) => {
    setRows(nextRows);
    onRowsChange?.(nextRows);
  };

  const totalAmt = rows.reduce((sum, row) => sum + (Number(row.amt) || 0), 0);

  const sortedAlloc = useMemo(() => {
    const grouped = {};
    rows.forEach((row) => {
      grouped[row.cls] = (grouped[row.cls] || 0) + (Number(row.amt) || 0);
    });
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const isNewCash = newItem.cls === CASH_ASSET_CLASS;

  const updateNewItem = (key, value) => {
    setNewItem((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "etf") {
        const resolved = resolveAssetByName(value, tickerMap, krEtfs);
        if (resolved) {
          next.etf = resolved.name;
          next.code = resolved.ticker;
          next.cls = resolved.assetClass || next.cls;
        }
      }
      if (next.cls === CASH_ASSET_CLASS) {
        next.qty = 0;
        next.price = 0;
      }
      if (key === "qty" || key === "price") {
        next.amt = (Number(next.qty) || 0) * (Number(next.price) || 0);
      }
      return next;
    });
  };

  const fetchNewItemPrice = async () => {
    if (!newItem.code || isNewCash) return;
    setLoading(true);
    try {
      const isDomestic = /^[0-9]/.test(newItem.code);
      const response = await fetch(`/api/kis-price?ticker=${newItem.code}${isDomestic ? "" : "&type=overseas"}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "시세 조회에 실패했습니다.");

      setNewItem((prev) => ({
        ...prev,
        etf: prev.etf || data.name || prev.etf,
        price: data.price,
        amt: (Number(prev.qty) || 0) * data.price,
      }));
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    const resolved = newItem.code ? null : resolveAssetByName(newItem.etf, tickerMap, krEtfs);
    const nextItem = resolved
      ? {
          ...newItem,
          etf: resolved.name,
          code: resolved.ticker,
          cls: resolved.assetClass || newItem.cls,
        }
      : newItem;

    if (!nextItem.cls) return alert("자산군을 선택하세요.");
    if (nextItem.cls !== CASH_ASSET_CLASS && !nextItem.code) {
      return alert("종목명 자동완성 또는 티커 입력으로 종목을 확인해주세요.");
    }
    if (Number(nextItem.amt) <= 0) return alert("평가금액은 0보다 커야 합니다.");

    const existingIndex = rows.findIndex(
      (row) =>
        (nextItem.code && row.code === nextItem.code) ||
        (!nextItem.code && nextItem.etf && row.etf === nextItem.etf)
    );

    const nextRows =
      existingIndex === -1
        ? [...rows, { ...nextItem }]
        : rows.map((row, index) => (index === existingIndex ? mergeHolding(row, nextItem) : row));

    const updatedKey = nextItem.code || nextItem.etf;
    syncRows(nextRows);
    setUpdatedTickers(new Set(updatedKey ? [updatedKey] : []));
    setTimeout(() => setUpdatedTickers(new Set()), 5000);
    setNewItem(makeEmptyItem());
    await onSave(nextRows);
  };

  const handleEditSave = async (item) => {
    const nextRows = [...rows];
    nextRows[editTarget.idx] = item;
    syncRows(nextRows);
    setEditTarget({ item: null, idx: -1 });
    await onSave(nextRows);
  };

  const handleRemove = async (index) => {
    if (!window.confirm("선택한 종목을 삭제할까요?")) return;
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    syncRows(nextRows);
    await onSave(nextRows);
  };

  const clearAll = async () => {
    if (!window.confirm("보유 자산을 모두 삭제할까요?")) return;
    syncRows([]);
    await onSave([]);
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (loadEvent) => {
      try {
        const text = decodeCsvBuffer(loadEvent.target.result);
        const parsed = parseHoldingsCsvText(text, tickerMap);
        if (parsed.length === 0) throw new Error("유효한 보유내역이 없습니다.");
        setImportResults(parsed);
      } catch (error) {
        alert(`CSV 파싱 실패: ${error.message}`);
      } finally {
        setImportLoading(false);
      }
    };
    reader.onerror = () => {
      setImportLoading(false);
      alert("파일 읽기에 실패했습니다.");
    };
  };

  const handleBatchAdd = async (items) => {
    if (!window.confirm(`총 ${items.length}개 종목을 반영할까요?`)) return;

    const merged = {};
    rows.forEach((row) => {
      merged[row.code || row.etf] = row;
    });

    const nextUpdated = new Set();
    items.forEach((item) => {
      const key = item.code || item.etf;
      merged[key] = item;
      nextUpdated.add(key);
    });

    const nextRows = Object.values(merged);
    syncRows(nextRows);
    setImportResults([]);
    setUpdatedTickers(nextUpdated);
    setTimeout(() => setUpdatedTickers(new Set()), 5000);
    await onSave(nextRows);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <Card style={{ border: "2px dashed var(--accent-main)", position: "relative", background: "rgba(37, 99, 235, 0.02)", opacity: importLoading ? 0.7 : 1 }}>
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "24px", marginBottom: "10px" }}>보유내역</div>
              <div style={{ fontWeight: 700, color: "var(--accent-main)", marginBottom: "6px" }}>
                {importLoading ? "CSV 분석 중..." : "보유내역 CSV 업로드"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6 }}>
                MTS에서 받은 CSV 파일을 업로드하면 보유 자산을 한 번에 갱신할 수 있습니다.
              </div>
              <div style={{ marginTop: "12px", position: "relative", zIndex: 2 }}>
                <Btn sm onClick={downloadCsvTemplate} data-testid="csv-template-download">
                  CSV 양식 다운로드
                </Btn>
              </div>
              <input
                type="file"
                accept=".csv"
                data-testid="csv-upload-input"
                onChange={handleCsvFile}
                disabled={importLoading}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              />
            </div>
          </Card>

          <Card accent="var(--accent-main)">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <ST>새 종목 추가하기</ST>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                예상 합계: <strong style={{ color: "var(--accent-main)", fontSize: "16px" }}>{fmt(newItem.amt)}</strong>
              </div>
            </div>

            {masterError && (
              <div style={{ marginBottom: "1rem", padding: "10px 12px", borderRadius: "10px", background: "#faeeda", color: "#633806", fontSize: "12px" }}>
                종목 마스터를 불러오지 못했습니다. {masterError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 180px", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>자산군</label>
                  <select style={inputStyle} value={newItem.cls} onChange={(e) => updateNewItem("cls", e.target.value)} data-testid="manual-class-select">
                    {ASSET_CLASSES.map((assetClass) => (
                      <option key={assetClass} value={assetClass}>
                        {getAssetClassLabel(assetClass)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>종목명 (자동완성 추천)</label>
                  <input
                    style={inputStyle}
                    value={newItem.etf}
                    onChange={(e) => updateNewItem("etf", e.target.value)}
                    list="etf-list-main"
                    data-testid="manual-name-input"
                    placeholder="종목명을 검색하세요"
                  />
                </div>

                {isNewCash ? (
                  <div>
                    <label style={labelStyle}>금액</label>
                    <input type="number" style={{ ...inputStyle, fontWeight: 700 }} value={newItem.amt || ""} onChange={(e) => updateNewItem("amt", e.target.value)} data-testid="manual-amount-input" placeholder="금액 입력" />
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>수량 및 단가</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input type="number" style={{ ...inputStyle, width: "72px", padding: "10px 8px" }} value={newItem.qty || ""} onChange={(e) => updateNewItem("qty", e.target.value)} data-testid="manual-qty-input" placeholder="수량" />
                      <input type="number" style={inputStyle} value={newItem.price || ""} onChange={(e) => updateNewItem("price", e.target.value)} onBlur={fetchNewItemPrice} data-testid="manual-price-input" placeholder="현재가" />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>매입원가 / 원금 (선택)</label>
                <input type="number" style={inputStyle} value={newItem.costAmt || ""} onChange={(e) => updateNewItem("costAmt", e.target.value)} placeholder="평가손익 계산용" />
                <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px" }}>
                  MTS의 매입금액을 입력하면 리포트와 자산 목록에서 원가 기준 손익률을 계산합니다.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {!isNewCash ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>티커 검색</label>
                        <input style={{ ...inputStyle, width: "110px", padding: "6px 10px" }} value={newItem.code} onChange={(e) => updateNewItem("code", e.target.value)} onBlur={fetchNewItemPrice} onKeyDown={(e) => e.key === "Enter" && fetchNewItemPrice()} data-testid="manual-code-input" placeholder="예: 360750" />
                      </div>
                      <Btn sm onClick={fetchNewItemPrice} disabled={loading || !newItem.code} style={{ height: "32px" }}>
                        {loading ? "조회 중" : "시세 자동조회"}
                      </Btn>
                    </>
                  ) : (
                    <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>현금성 자산은 티커 없이 금액만 입력할 수 있습니다.</div>
                  )}
                </div>

                <Btn primary data-testid="manual-add-button" onClick={handleAddItem} style={{ height: "38px", padding: "0 24px", fontWeight: 700 }}>
                  종목 포트폴리오에 추가
                </Btn>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <ST>보유 자산 내역</ST>
              <Btn sm danger onClick={clearAll}>
                전체 삭제
              </Btn>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="premium-table" data-testid="holdings-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>종목 정보</th>
                    <th style={{ width: 120 }}>자산군</th>
                    <th style={{ textAlign: "right", width: 100 }}>수량</th>
                    <th style={{ textAlign: "right", width: 120 }}>현재가</th>
                    <th style={{ textAlign: "right", width: 150 }}>평가금액</th>
                    <th style={{ textAlign: "right", width: 140 }}>평가손익</th>
                    <th style={{ textAlign: "center", width: 110 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const pnl = Number(row.costAmt) > 0 ? Number(row.amt) - Number(row.costAmt) : null;
                    const pnlPct = pnl != null ? (pnl / Number(row.costAmt)) * 100 : null;
                    const isUpdated = updatedTickers.has(row.code || row.etf);

                    return (
                      <tr key={`${row.code || row.etf}-${index}`} data-testid="holdings-row" style={{ background: isUpdated ? "rgba(5, 150, 105, 0.08)" : undefined }}>
                        <td style={{ padding: "16px 0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
                            {row.etf || "이름 없는 자산"}
                            {isUpdated ? <Badge c="#fff" bg="#0f9d58">업데이트</Badge> : null}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace", marginTop: "4px" }}>{row.code || "CASH"}</div>
                        </td>
                        <td style={{ padding: "16px 0" }}>
                          <Badge c={ASSET_COLORS[row.cls] || "#333"} bg={`${ASSET_COLORS[row.cls] || "#888"}22`}>
                            {getAssetClassLabel(row.cls)}
                          </Badge>
                        </td>
                        <td style={{ textAlign: "right", padding: "16px 0" }}>{fmt(row.qty)}</td>
                        <td style={{ textAlign: "right", padding: "16px 0", color: "var(--text-dim)" }}>{fmt(row.price)}</td>
                        <td style={{ textAlign: "right", padding: "16px 0", fontWeight: 700 }}>{fmt(row.amt)}</td>
                        <td style={{ textAlign: "right", padding: "16px 0", color: pnl == null ? "var(--text-dim)" : pnl >= 0 ? "var(--alert-ok-color)" : "var(--alert-danger-color)" }}>
                          {pnl == null ? "원가 필요" : `${pnl >= 0 ? "+" : "-"}${fmt(Math.abs(pnl))} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`}
                        </td>
                        <td style={{ textAlign: "center", padding: "16px 0" }}>
                          <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                            <Btn sm onClick={() => setEditTarget({ item: row, idx: index })}>
                              수정
                            </Btn>
                            <Btn sm danger onClick={() => handleRemove(index)}>
                              삭제
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-dim)", border: "1px dashed var(--border-glass)", borderRadius: "8px", marginTop: "1rem" }}>
                등록된 자산이 없습니다. 직접 입력이나 CSV 업로드를 이용해 포트폴리오를 구성해보세요.
              </div>
            )}

            <div style={{ marginTop: "1.5rem", padding: "1rem 1.25rem", background: "var(--bg-main)", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>총 {rows.length}개 자산</div>
              <div style={{ fontSize: "15px", fontWeight: 600 }}>
                자산 합계 <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--accent-main)" }}>{fmt(totalAmt)}</span>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ position: "sticky", top: "1rem" }}>
          <Card>
            <ST>자산군 비중 (실시간)</ST>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {sortedAlloc.map(([assetClass, amount]) => {
                const pct = totalAmt > 0 ? (amount / totalAmt) * 100 : 0;
                return (
                  <div key={assetClass}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}>
                      <span>{getAssetClassLabel(assetClass)}</span>
                      <strong>{pct.toFixed(1)}%</strong>
                    </div>
                    <div style={{ height: "10px", borderRadius: "999px", background: "var(--bg-main)", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: ASSET_COLORS[assetClass] || "#888" }} />
                    </div>
                  </div>
                );
              })}
              {sortedAlloc.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>표시할 자산이 없습니다.</div>}
            </div>
          </Card>
        </div>
      </div>

      <EditModal
        isOpen={editTarget.idx !== -1}
        item={editTarget.item}
        krEtfs={krEtfs}
        onClose={() => setEditTarget({ item: null, idx: -1 })}
        onSave={handleEditSave}
      />

      <ImportResultModal
        isOpen={importResults.length > 0}
        results={importResults}
        currentRows={rows}
        onClose={() => setImportResults([])}
        onConfirm={handleBatchAdd}
      />

      <datalist id="etf-list-main">
        {krEtfs.map((asset) => (
          <option key={asset.ticker} value={asset.name}>
            {asset.ticker} | {getAssetClassLabel(asset.assetClass)}
          </option>
        ))}
      </datalist>
    </div>
  );
}
