import React, { useMemo, useState } from "react";
import { Card, ST, Btn, Badge } from "../common/index.jsx";
import { normalizeTransaction } from "../../services/transactionEngine.js";
import { fmt } from "../../utils/formatters.js";
import { buildTransactionsCsvRows, exportCsv, exportExcelTable } from "../../utils/exporters.js";

function emptyTransaction() {
  return normalizeTransaction({
    tradeDate: new Date().toISOString().slice(0, 10),
    side: "buy",
    quantity: 0,
    price: 0,
    fee: 0,
  });
}

export default function TransactionsPanel({ transactions = [], onSave }) {
  const [rows, setRows] = useState(() => transactions.length > 0 ? transactions : [emptyTransaction()]);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => {
    const totalBuy = rows
      .filter((row) => row.side === "buy")
      .reduce((acc, row) => acc + (Number(row.quantity) || 0) * (Number(row.price) || 0), 0);
    const totalSell = rows
      .filter((row) => row.side === "sell")
      .reduce((acc, row) => acc + (Number(row.quantity) || 0) * (Number(row.price) || 0), 0);
    const totalFees = rows.reduce((acc, row) => acc + (Number(row.fee) || 0), 0);
    return { totalBuy, totalSell, totalFees };
  }, [rows]);

  const updateRow = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = normalizeTransaction({ ...next[index], [key]: value }, index);
      return next;
    });
  };

  const addRow = () => setRows((prev) => [...prev, emptyTransaction()]);
  const removeRow = (index) => setRows((prev) => prev.filter((_, current) => current !== index));

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = rows
        .filter((row) => row.ticker || row.name)
        .map((row, index) => normalizeTransaction(row, index));
      await onSave?.(normalized);
      setRows(normalized.length > 0 ? normalized : [emptyTransaction()]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: 8, flexWrap: "wrap" }}>
          <div>
            <ST>거래내역 입력</ST>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              보유 수량과 별도로 거래내역을 기록하면 실현손익과 자산군별 성과 기여도를 계산합니다.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge c="#0c447c" bg="#e6f1fb">매수 {fmt(summary.totalBuy)}원</Badge>
            <Badge c="#633806" bg="#faeeda">매도 {fmt(summary.totalSell)}원</Badge>
            <Badge c="var(--text-dim)" bg="var(--bg-main)">수수료 {fmt(summary.totalFees)}원</Badge>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Btn sm onClick={() => exportCsv(`transactions_${new Date().toISOString().slice(0, 10)}.csv`, buildTransactionsCsvRows(rows))}>
              거래 CSV 내보내기
            </Btn>
            <Btn sm onClick={() => exportExcelTable(
              `transactions_${new Date().toISOString().slice(0, 10)}.xls`,
              "거래내역",
              ["일자", "티커", "종목명", "자산군", "구분", "수량", "가격", "수수료", "메모"],
              rows.map((row) => [row.tradeDate, row.ticker, row.name, row.assetClass, row.side, row.quantity, row.price, row.fee, row.memo])
            )}>
              Excel 호환
            </Btn>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>일자</th>
                <th>종목명</th>
                <th>티커</th>
                <th>자산군</th>
                <th>구분</th>
                <th style={{ textAlign: "right" }}>수량</th>
                <th style={{ textAlign: "right" }}>가격</th>
                <th style={{ textAlign: "right" }}>수수료</th>
                <th>메모</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || index}>
                  <td><input value={row.tradeDate} onChange={(e) => updateRow(index, "tradeDate", e.target.value)} type="date" style={{ width: 130 }} /></td>
                  <td><input value={row.name} onChange={(e) => updateRow(index, "name", e.target.value)} style={{ width: 160 }} /></td>
                  <td><input value={row.ticker} onChange={(e) => updateRow(index, "ticker", e.target.value)} style={{ width: 90 }} /></td>
                  <td><input value={row.assetClass} onChange={(e) => updateRow(index, "assetClass", e.target.value)} style={{ width: 120 }} /></td>
                  <td>
                    <select value={row.side} onChange={(e) => updateRow(index, "side", e.target.value)}>
                      <option value="buy">매수</option>
                      <option value="sell">매도</option>
                    </select>
                  </td>
                  <td><input value={row.quantity} onChange={(e) => updateRow(index, "quantity", e.target.value)} type="number" style={{ width: 80, textAlign: "right" }} /></td>
                  <td><input value={row.price} onChange={(e) => updateRow(index, "price", e.target.value)} type="number" style={{ width: 100, textAlign: "right" }} /></td>
                  <td><input value={row.fee} onChange={(e) => updateRow(index, "fee", e.target.value)} type="number" style={{ width: 90, textAlign: "right" }} /></td>
                  <td><input value={row.memo} onChange={(e) => updateRow(index, "memo", e.target.value)} style={{ width: 180 }} /></td>
                  <td><Btn sm danger onClick={() => removeRow(index)}>삭제</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Btn sm onClick={addRow}>거래 추가</Btn>
          <Btn sm primary onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "거래 저장"}</Btn>
        </div>
      </Card>
    </div>
  );
}
