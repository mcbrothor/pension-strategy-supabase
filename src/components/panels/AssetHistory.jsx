import React, { useEffect, useState, useMemo } from "react";
import { usePortfolio } from "../../context/PortfolioContext.jsx";
import { Card, ST, Badge } from "../common/index.jsx";
import { fmt } from "../../utils/formatters.js";

function formatDateTime(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function AssetHistory() {
  const { fetchAssetHistory, isFetching } = usePortfolio();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await fetchAssetHistory();
      setHistory(data || []);
      setLoading(false);
    }
    load();
  }, [fetchAssetHistory]);

  const historyWithDelta = useMemo(() => {
    // history is ordered by recorded_at DESC
    return history.map((item, index) => {
      const nextItem = history[index + 1]; // chronological previous item
      const delta = nextItem ? Number(item.evaluation_amount) - Number(nextItem.evaluation_amount) : null;
      const pct = nextItem && Number(nextItem.evaluation_amount) !== 0 
        ? (delta / Number(nextItem.evaluation_amount)) * 100 
        : null;
      
      return { 
        ...item, 
        delta, 
        pct 
      };
    });
  }, [history]);

  if (loading || isFetching) {
    return <div style={{ padding: "1rem", color: "var(--text-dim)", fontSize: "13px" }}>히스토리 불러오는 중...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <ST>자산 평가 히스토리</ST>
            <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
              계좌 평가 금액(MTS 수동)이 업데이트될 때마다 자동으로 기록된 내역입니다.
            </div>
          </div>
          <Badge bg="var(--bg-main)" c="var(--text-main)">총 {history.length}개 기록</Badge>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-dim)", border: "1px dashed var(--border-glass)", borderRadius: "12px" }}>
            아직 기록된 히스토리가 없습니다.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: "220px" }}>기록 일시</th>
                  <th style={{ textAlign: "right", width: "160px" }}>계좌 평가 금액</th>
                  <th style={{ textAlign: "right", width: "160px" }}>변동폭 (전회 대비)</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {historyWithDelta.map((item, idx) => {
                  const deltaColor = !item.delta ? "var(--text-dim)" : item.delta > 0 ? "var(--alert-ok-color)" : "var(--alert-danger-color)";
                  
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500, color: idx === 0 ? "var(--accent-main)" : "inherit" }}>
                        {formatDateTime(item.recorded_at)}
                        {idx === 0 && <Badge sm bg="var(--accent-main)" c="#fff" style={{ marginLeft: "8px" }}>최신</Badge>}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(item.evaluation_amount)}</td>
                      <td style={{ textAlign: "right" }}>
                        {item.delta !== null ? (
                          <div style={{ color: deltaColor, fontWeight: 600 }}>
                            {item.delta > 0 ? "+" : ""}{fmt(item.delta)}
                            <span style={{ fontSize: "11px", marginLeft: "4px", opacity: 0.8 }}>
                              ({item.pct > 0 ? "+" : ""}{item.pct?.toFixed(2)}%)
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>-</span>
                        )}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                        {idx === historyWithDelta.length - 1 ? "최초 기록" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
