import React from "react";

/**
 * 밀도 토글 — 표준/컴팩트 전환 버튼
 */
export default function DensityToggle({ density, onChange }) {
  return (
    <div className="density-toggle">
      <button
        className={density === "standard" ? "active" : ""}
        onClick={() => onChange("standard")}
      >
        표준
      </button>
      <button
        className={density === "compact" ? "active" : ""}
        onClick={() => onChange("compact")}
      >
        컴팩트
      </button>
    </div>
  );
}
