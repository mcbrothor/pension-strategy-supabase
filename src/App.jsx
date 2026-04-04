import React, { useState } from "react";

// Context Hooks
import { useAuth } from "./context/AuthContext.jsx";
import { useMarket } from "./context/MarketContext.jsx";
import { usePortfolio } from "./context/PortfolioContext.jsx";

// Common Components
import { Badge, Btn } from "./components/common/index.jsx";
import ConfirmModal from "./components/common/ConfirmModal.jsx";
import AuthSetup from "./components/common/AuthSetup.jsx";

// Feature Panels
import Dashboard from "./components/panels/Dashboard";
import StrategySelect from "./components/panels/StrategySelect";
import RebalanceJudge from "./components/panels/RebalanceJudge";
import RetirementRoadmap from "./components/panels/RetirementRoadmap";
import EntryPanel from "./components/panels/EntryPanel";
import CompareWeights from "./components/panels/CompareWeights";
import AlertsPanel from "./components/panels/AlertsPanel";
import HistoryPanel from "./components/panels/HistoryPanel";
import MonthlyReport from "./components/panels/MonthlyReport";

const TABS = [
  { id: "dashboard", label: "대시보드" },
  { id: "strategy", label: "투자 전략" },
  { id: "rebalance", label: "리밸런싱 판단" },
  { id: "roadmap", label: "은퇴 로드맵" },
  { id: "entry", label: "종목 입력" },
  { id: "compare", label: "비중 비교" },
  { id: "alerts", label: "경고·손절" },
  { id: "history", label: "변동 추이" },
  { id: "report", label: "월간 리포트" },
  { id: "account", label: "계정 설정" },
];

export default function PensionPilot() {
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  // Contexts
  const { user, login, signUp, logout, loading: authLoading } = useAuth();
  const { vix, vixSource, vixUpdatedAt, vixLoading, fetchVix, krEtfs, tickerMap } = useMarket();
  const { portfolio, setPortfolio, isDemo, isSaving, updateStrategy, saveHoldings } = usePortfolio();

  const handleSelectStrategy = (id) => {
    setModal({
      isOpen: true,
      title: "투자 전략 변경",
      message: `현재 전략을 변경하시겠습니까?`,
      onConfirm: () => updateStrategy(id)
    });
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--text-main)" }}>
      {/* 앱 헤더 */}
      <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-glass)", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 2 }}>연금 포트폴리오 파일럿</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>삼성증권 IRP/연금저축 · Supabase 클라우드 DB · 은퇴 목표 관리</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isDemo && <Badge c="#633806" bg="#faeeda">데모 모드</Badge>}
            <Badge 
              c={vixLoading ? "var(--text-dim)" : (vixSource === "KIS" ? "#1a73e8" : "#27500a")} 
              bg={vixLoading ? "var(--bg-main)" : (vixSource === "KIS" ? "#eef6ff" : "#eaf3de")}
              title={vixUpdatedAt ? `최종 업데이트: ${new Date(vixUpdatedAt).toLocaleString("ko-KR")} (출처: ${vixSource})` : "조회 중..."}
            >
              VIX {vixLoading ? "…" : (vix?.toFixed(1) || "…")}
              {vixUpdatedAt && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>({vixSource})</span>}
            </Badge>
            <Btn sm onClick={() => setTab("account")}>{user ? "계정 관리" : "로그인"}</Btn>
            <Btn sm onClick={() => setTab("report")} style={{ background: "var(--color-primary)", color: "#fff", border: "none" }}>월간 리포트 PDF</Btn>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1rem" }}>
        {/* 탭 */}
        <div className="no-scrollbar" style={{ display: "flex", gap: 2, borderBottom: "0.5px solid var(--border-glass)", marginBottom: "1.5rem", overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 15px", fontSize: 13, border: "none", background: "none", cursor: "pointer", color: tab === t.id ? "var(--text-main)" : "var(--text-dim)", borderBottom: `2px solid ${tab === t.id ? "var(--text-main)" : "transparent"}`, fontWeight: tab === t.id ? 500 : 400, fontFamily: "var(--font-sans)", marginBottom: -1, whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 패널 */}
        {tab === "dashboard" && <Dashboard portfolio={portfolio} vix={vix} vixSource={vixSource} vixUpdatedAt={vixUpdatedAt} vixLoading={vixLoading} onFetchVix={fetchVix} onGo={setTab} />}
        {tab === "strategy" && <StrategySelect accountType={portfolio.accountType} onStrategyApply={handleSelectStrategy} />}
        {tab === "rebalance" && <RebalanceJudge portfolio={portfolio} vix={vix} vixSource={vixSource} vixUpdatedAt={vixUpdatedAt} />}
        {tab === "roadmap" && <RetirementRoadmap strategyId={portfolio.strategy} />}
        {tab === "entry" && <EntryPanel portfolio={portfolio} onSave={saveHoldings} krEtfs={krEtfs} tickerMap={tickerMap} />}
        {tab === "compare" && <CompareWeights portfolio={portfolio} />}
        {tab === "alerts" && <AlertsPanel portfolio={portfolio} onStopLossChange={v => setPortfolio(p => ({ ...p, stopLoss: v }))} onMddChange={v => setPortfolio(p => ({ ...p, mddLimit: v }))} />}
        {tab === "history" && <HistoryPanel portfolio={portfolio} />}
        {tab === "report" && <MonthlyReport portfolio={portfolio} vix={vix} vixSource={vixSource} vixUpdatedAt={vixUpdatedAt} />}
        {tab === "account" && <AuthSetup user={user} onLogin={login} onSignUp={signUp} onLogout={logout} isSaving={isSaving} />}
      </div>
      <ConfirmModal {...modal} onClose={() => setModal(m => ({ ...m, isOpen: false }))} />
    </div>
  );
}
