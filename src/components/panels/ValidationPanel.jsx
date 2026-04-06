import React from "react";
import StrategySelect from "./StrategySelect.jsx";
import CompareWeights from "./CompareWeights.jsx";
import { Card, ST, Badge } from "../common/index.jsx";

/**
 * 전략검증 패널 — 전략 선택 + 비중 비교
 * 2단계에서 백테스트/OOS/워크포워드 분석이 추가될 예정입니다.
 */
export default function ValidationPanel({ portfolio, accountType, onStrategyApply }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* 전략 선택 (기존 StrategySelect 재사용) */}
      <StrategySelect accountType={accountType} onStrategyApply={onStrategyApply} />

      {/* 비중 비교 (기존 CompareWeights 재사용) */}
      <CompareWeights portfolio={portfolio} />

      {/* 2단계 예고 영역 */}
      <Card>
        <ST>📊 백테스트 & Walk-Forward 분석 (2단계 예정)</ST>
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-dim)" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>전략 검증 도구</div>
          <div style={{ fontSize: 11, lineHeight: 1.6 }}>
            수수료·슬리피지 반영 백테스트, Walk-forward 검증,<br />
            Out-of-Sample 분리, 전략별 실패구간 리포트가 2단계에서 제공됩니다.
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
            <Badge c="var(--alert-info-color)" bg="var(--alert-info-bg)">백테스트</Badge>
            <Badge c="var(--alert-info-color)" bg="var(--alert-info-bg)">Walk-Forward</Badge>
            <Badge c="var(--alert-info-color)" bg="var(--alert-info-bg)">OOS 검증</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
