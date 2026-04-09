import React from "react";
import { fmt, fmtP } from "../../utils/formatters.js";

export const Card = ({ children, style, accent }) => (
  <div style={{
    background: "var(--bg-card)",
    border: `${accent ? "2px" : "0.5px"} solid ${accent || "var(--border-glass)"}`,
    borderRadius: "var(--border-radius-lg)",
    padding: "1.25rem",
    marginBottom: "1rem",
    ...style
  }}>
    {children}
  </div>
);

export const ST = ({ children }) => (
  <div style={{
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-dim)",
    marginBottom: ".75rem",
    letterSpacing: ".04em"
  }}>
    {children}
  </div>
);

export const Badge = ({ children, c, bg }) => (
  <span style={{
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 20,
    fontWeight: 600,
    background: bg,
    color: c,
    display: "inline-block"
  }}>
    {children}
  </span>
);

export const Btn = ({ children, onClick, primary, danger, sm, style, disabled, ...rest }) => (
  <button 
    onClick={onClick} 
    disabled={disabled}
    {...rest}
    style={{
      padding: sm ? "5px 12px" : "8px 20px",
      border: `0.5px solid ${primary || danger ? "transparent" : "var(--border-glass)"}`,
      borderRadius: "var(--radius-md)",
      background: danger ? "#a32d2d" : primary ? "var(--text-main)" : "none",
      color: danger || primary ? "var(--bg-card)" : "var(--text-main)",
      fontSize: sm ? 11 : 13,
      fontWeight: 500,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontFamily: "var(--font-sans)",
      ...style
    }}
  >
    {children}
  </button>
);

export const MetaCard = ({ label, value, sub, subColor }) => (
  <div style={{ background: "var(--bg-main)", borderRadius: "var(--radius-md)", padding: ".875rem", textAlign: "center" }}>
    <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 500 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: subColor || "var(--text-dim)", fontWeight: 500, marginTop: 2 }}>{sub}</div>}
  </div>
);

export const AllocBar = ({ label, pct, target, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
    <div style={{ fontSize: 11, minWidth: 130, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    <div style={{ flex: 1, height: 7, background: "var(--bg-main)", borderRadius: 4, overflow: "hidden", position: "relative", minWidth: 60 }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4 }} />
      {target != null && <div style={{ position: "absolute", top: 0, left: `${Math.min(target, 100)}%`, width: 2, height: "100%", background: "var(--text-main)", opacity: .3 }} />}
    </div>
    <span style={{ fontSize: 11, fontWeight: 500, minWidth: 30, textAlign: "right" }}>{pct.toFixed(1)}%</span>
    {target != null && <span style={{ fontSize: 10, minWidth: 44, textAlign: "right", color: Math.abs(pct - target) >= 5 ? (pct > target ? "#a32d2d" : "#0c447c") : "#3b6d11" }}>{fmtP(pct - target)}</span>}
  </div>
);

export const VixBar = ({ vix }) => {
  const pct = Math.min(Math.max(vix / 50 * 100, 2), 98);
  return (
    <div>
      <div style={{ height: 9, borderRadius: 5, background: "linear-gradient(to right,#185fa5,#639922,#ba7517,#d85a30,#a32d2d)", position: "relative", margin: "8px 0 3px" }}>
        <div style={{ position: "absolute", top: -5, left: `${pct}%`, width: 3, height: 19, background: "var(--text-main)", borderRadius: 1, transform: "translateX(-50%)" }} />
      </div>
      <div style={{ display: "flex", justifyBetween: "space-between", fontSize: 10, color: "var(--text-dim)" }}>
        <span>0 안정</span><span>15</span><span>25</span><span>35</span><span>50+</span>
      </div>
    </div>
  );
};

export const ReasonBox = ({ type, title, body }) => {
  const tC = { ok: "#27500a", warn: "#633806", danger: "#791f1f", info: "#0c447c" };
  const tB = { ok: "#eaf3de", warn: "#faeeda", danger: "#fcebeb", info: "#e6f1fb" };
  return (
    <div style={{ background: tB[type], borderRadius: "var(--radius-md)", padding: ".875rem 1rem", marginBottom: 8, borderLeft: `3px solid ${tC[type]}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: tC[type], marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: tC[type], opacity: .9, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
};
