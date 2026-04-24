import React from "react";
import { Badge, ST } from "./index.jsx";

function formatValue(value, digits = 2, suffix = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return `${numeric.toFixed(digits)}${suffix}`;
}

export default function OverlaySummaryCard({ overlay, title = "전략 오버레이 요약" }) {
  if (!overlay?.overlaySummary && !overlay?.targets) return null;

  const summary = overlay.overlaySummary || {};

  return (
    <div
      style={{
        background: "var(--bg-card)",
        borderRadius: 10,
        padding: 12,
        border: "1px solid var(--border-glass)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <ST>{title}</ST>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge c="#27500a" bg="#eaf3de">
            목표 위험자산 {formatValue(overlay.targetEquity, 1, "%")}
          </Badge>
          <Badge c="#633806" bg="#faeeda">
            Vol Scale {formatValue(overlay.volScale, 2, "x")}
          </Badge>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>
        <div>
          CAPE {formatValue(summary.cape)} / HY Spread {formatValue(summary.creditSpread)} / 10Y-2Y{" "}
          {formatValue(summary.yieldSpread)} / VIX {formatValue(summary.vix)}
        </div>
        <div>
          Valuation Shift {formatValue(summary.valuationShift, 1, "%p")} / Macro Shift{" "}
          {formatValue(summary.macroShift, 1, "%p")}
        </div>
        {overlay.updatedAt && (
          <div>업데이트: {new Date(overlay.updatedAt).toLocaleString("ko-KR")}</div>
        )}
      </div>
    </div>
  );
}
