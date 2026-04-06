import React, { useState } from "react";

// Context Hooks
import { useAuth } from "./context/AuthContext.jsx";
import { useMarket } from "./context/MarketContext.jsx";
import { usePortfolio } from "./context/PortfolioContext.jsx";

// Common Components
import { Badge, Btn } from "./components/common/index.jsx";
import ConfirmModal from "./components/common/ConfirmModal.jsx";
import KPIStrip from "./components/common/KPIStrip.jsx";
import DensityToggle from "./components/common/DensityToggle.jsx";

// Feature Panels (워크플로우형 IA)
import DailyCheckPanel from "./components/panels/DailyCheckPanel.jsx";
import RiskPanel from "./components/panels/RiskPanel.jsx";
import OrderPlanPanel from "./components/panels/OrderPlanPanel.jsx";
import ValidationPanel from "./components/panels/ValidationPanel.jsx";
import MonthlyReport from "./components/panels/MonthlyReport.jsx";
import SettingsPanel from "./components/panels/SettingsPanel.jsx";

// Services
import { estimateRiskMetrics } from "./services/riskEngine.js";
import { RISK_DATA } from "./constants/index.js";
import { getStrat } from "./utils/helpers.js";

/**
 * 워크플로우형 탭 구조 (6탭)
 * 순서: 일일점검 → 리스크 → 주문계획 → 전략검증 → 리포트 → 설정
 */
const TABS = [
  { id: "daily",      label: "일일점검",   icon: "📋", num: 1 },
  { id: "risk",       label: "리스크",     icon: "📈", num: 2 },
  { id: "orders",     label: "주문계획",   icon: "📝", num: 3 },
  { id: "validation", label: "전략검증",   icon: "🔬", num: 4 },
  { id: "report",     label: "리포트",     icon: "📄", num: 5 },
  { id: "settings",   label: "설정",       icon: "⚙️", num: 6 },
];

export default function PensionPilot() {
  // 기본 진입: 일일점검
  const [tab, setTab] = useState("daily");
  const [density, setDensity] = useState("standard");
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  // Contexts
  const { user, login, signUp, logout, loading: authLoading } = useAuth();
  const { 
    vix, vixSource, vixUpdatedAt, vixLoading, vixError, fetchVix, krEtfs, tickerMap, masterError,
    avgCorrelation, corrUpdatedAt, corrLoading, refreshCorrelation
  } = useMarket();

  const { portfolio, setPortfolio, isDemo, isSaving, updateStrategy, saveHoldings, degradedMode, targetSource } = usePortfolio();

  // 리스크 지표 (KPI 스트립용)
  const s = getStrat(portfolio.strategy);
  const annualExpRet = s?.annualRet?.base || 0.08;
  const riskMetrics = estimateRiskMetrics(portfolio.holdings, RISK_DATA, annualExpRet);

  // 전략 변경 핸들러
  const handleSelectStrategy = (id) => {
    setModal({
      isOpen: true,
      title: "투자 전략 변경",
      message: `현재 전략을 변경하시겠습니까?`,
      onConfirm: () => updateStrategy(id)
    });
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--text-main)" }} className={density === "compact" ? "compact-mode" : ""}>
      {/* ===== 앱 헤더 ===== */}
      <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-glass)", padding: "1rem 1.25rem", marginBottom: 0 }}>
        <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 2 }}>연금 운용 데스크</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>삼성증권 IRP/연금저축 · 실무형 운용 관리 시스템</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isDemo && <Badge c="#633806" bg="#faeeda">데모 모드</Badge>}
            {degradedMode && <Badge c="var(--alert-warn-color)" bg="var(--alert-warn-bg)">⚡ 폴백</Badge>}
            <Badge 
              c={vixLoading ? "var(--text-dim)" : (vixError ? "#a32d2d" : (vixSource === "KIS" ? "#1a73e8" : "#27500a"))} 
              bg={vixLoading ? "var(--bg-main)" : (vixError ? "#fcebeb" : (vixSource === "KIS" ? "#eef6ff" : "#eaf3de"))}
              title={vixError || (vixUpdatedAt ? `최종 업데이트: ${new Date(vixUpdatedAt).toLocaleString("ko-KR")} (출처: ${vixSource})` : "조회 중...")}
            >
              VIX {vixLoading ? "…" : (vixError ? "Err" : (vix?.toFixed(1) || "…"))}
              {vixUpdatedAt && !vixError && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>({vixSource})</span>}
            </Badge>
            <DensityToggle density={density} onChange={setDensity} />
            <Btn sm onClick={() => setTab("settings")}>{user ? "설정" : "로그인"}</Btn>
          </div>
        </div>
      </div>

      {/* ===== KPI 스트립 (전 탭 공통) ===== */}
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1rem" }}>
        <KPIStrip
          total={portfolio.total}
          totalDiff={null}
          vix={vix}
          vixMeta={vixUpdatedAt ? { freshness: (() => { const age = (Date.now() - new Date(vixUpdatedAt).getTime()) / 60000; return age <= 5 ? 'realtime' : age <= 60 ? 'delayed' : 'cached'; })() } : null}
          avgCorrelation={avgCorrelation}
          vol={riskMetrics.vol}
          sharpe={riskMetrics.sharpe}
          dataGrade={vixError ? 'C' : vixSource === 'KIS' ? 'A' : 'B'}
        />
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1rem" }}>
        {/* ===== 워크플로우 탭 ===== */}
        <div className="workflow-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`workflow-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-number">{t.num}</span>
              <span>{t.icon} {t.label}</span>
            </button>
          ))}
        </div>

        {/* ===== 패널 렌더링 ===== */}
        {tab === "daily" && (
          <DailyCheckPanel
            portfolio={portfolio}
            vix={vix} vixSource={vixSource} vixUpdatedAt={vixUpdatedAt} vixLoading={vixLoading} vixError={vixError}
            masterError={masterError} onFetchVix={fetchVix} onGo={setTab}
            avgCorrelation={avgCorrelation} corrUpdatedAt={corrUpdatedAt} corrLoading={corrLoading} onRefreshCorr={() => refreshCorrelation(portfolio.holdings)}
            degradedMode={degradedMode} targetSource={targetSource}
          />
        )}

        {tab === "risk" && (
          <RiskPanel portfolio={portfolio} />
        )}

        {tab === "orders" && (
          <OrderPlanPanel
            portfolio={portfolio}
            vix={vix} vixSource={vixSource} vixUpdatedAt={vixUpdatedAt}
            avgCorrelation={avgCorrelation}
          />
        )}

        {tab === "validation" && (
          <ValidationPanel
            portfolio={portfolio}
            accountType={portfolio.accountType}
            onStrategyApply={handleSelectStrategy}
          />
        )}

        {tab === "report" && (
          <MonthlyReport
            portfolio={portfolio}
            vix={vix} vixSource={vixSource} vixUpdatedAt={vixUpdatedAt} vixError={vixError}
          />
        )}

        {tab === "settings" && (
          <SettingsPanel
            portfolio={portfolio}
            setPortfolio={setPortfolio}
            saveHoldings={saveHoldings}
            krEtfs={krEtfs}
            tickerMap={tickerMap}
            masterError={masterError}
            user={user}
            login={login}
            signUp={signUp}
            logout={logout}
            isSaving={isSaving}
          />
        )}
      </div>

      <ConfirmModal {...modal} onClose={() => setModal(m => ({ ...m, isOpen: false }))} />
    </div>
  );
}
