import React from "react";
import { Btn } from "./index.jsx";

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000, padding: "1.5rem"
    }} onClick={onClose}>
      <div style={{
        backgroundColor: "var(--bg-card)",
        borderRadius: "var(--border-radius-lg)",
        width: "100%", maxWidth: "400px",
        padding: "1.75rem",
        boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        animation: "modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
      }} onClick={e => e.stopPropagation()}>
        <style>{`
          @keyframes modal-in {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-main)" }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: "2rem" }}>{message}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Btn style={{ flex: 1, height: 44 }} onClick={onClose}>아니오</Btn>
          <Btn primary style={{ flex: 1, height: 44 }} onClick={() => { onConfirm(); onClose(); }}>네, 적용합니다</Btn>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
