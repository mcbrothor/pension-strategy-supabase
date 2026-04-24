import React from "react";
import { Badge } from "./index.jsx";
import { getFreshnessLabel, getGradeTheme } from "../../services/marketData.js";

export default function MarketDataBadge({ meta, fallbackText = "데이터 메타 없음" }) {
  if (!meta) {
    return <Badge c="var(--text-dim)" bg="var(--bg-main)">{fallbackText}</Badge>;
  }

  const theme = getGradeTheme(meta.confidenceGrade);
  const source = meta.source || "Unknown";
  const freshness = getFreshnessLabel(meta.freshness);
  const updatedAt = meta.updatedAt ? new Date(meta.updatedAt).toLocaleString("ko-KR") : "미상";

  return (
    <Badge c={theme.color} bg={theme.bg}>
      {source} · {freshness} · 등급 {meta.confidenceGrade} · {updatedAt}
    </Badge>
  );
}
