import React, { Suspense, useState } from "react";

import { useAuth } from "./context/AuthContext.jsx";
import { useMarket } from "./context/MarketContext.jsx";
import { usePortfolio } from "./context/PortfolioContext.jsx";

import { Badge, Btn } from "./components/common/index.jsx";
import ConfirmModal from "./components/common/ConfirmModal.jsx";
import KPIStrip from "./components/common/KPIStrip.jsx";

const DailyCheckPanel = React.lazy(() => import("./components/panels/DailyCheckPanel.jsx"));
const RiskPanel = React.lazy(() => import("./components/panels/RiskPanel.jsx"));
const OrderPlanPanel = React.lazy(() => import("./components/panels/OrderPlanPanel.jsx"));
const ValidationPanel = React.lazy(() => import("./components/panels/ValidationPanel.jsx"));
const MonthlyReport = React.lazy(() => import("./components/panels/MonthlyReport.jsx"));
const SettingsPanel = React.lazy(() => import("./components/panels/SettingsPanel.jsx"));

import { estimateRiskMetrics, estimateSortino, estimateCVaR } from "./services/riskEngine.js";
import { RISK_DATA } from "./constants/index.js";
import { getStrat } from "./utils/helpers.js";

const TABS = [
  { id: "daily", label: "일일점검", num: 1 },
  { id: "risk", label: "리스크", num: 2 },
  { id: "orders", label: "주문계획", num: 3 },
  { id: "validation", label: "전략검증", num: 4 },
  { id: "report", label: "리포트", num: 5 },
  { id: "settings", label: "설정", num: 6 },
];

export default function PensionPilot() {
  const [tab, setTab] = useState("daily");
  const [requestedSubTab, setRequestedSubTab] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const { user, login, signUp, logout } = useAuth();
  const {
    vix,
    vixSource,
    vixUpdatedAt,
    vixLoading,
    vixError,
    fetchVix,
    krEtfs,
    tickerMap,
    masterError,
    avgCorrelation,
    corrUpdatedAt,
    corrLoading,
    refreshCorrelation,
    fearGreed,
    yieldSpread,
    unemployment,
    signalsLoading,
    signalsError,
    fetchMarketSignals,
  } = useMarket();

  const {
    portfolio,
    setPortfolio,
    isDemo,
    isSaving,
    updateStrategy,
    saveHoldings,
    savePrincipalTotal,
    restorePreviousPortfolio,
    restoreInfo,
    syncStatus,
    degradedMode,
    targetSource,
  } = usePortfolio();

  const currentStrategy = React.useMemo(() => getStrat(portfolio.strategy), [portfolio.strategy]);
  const annualExpRet = currentStrategy?.annualRet?.base || 0.08;

  const riskMetrics = React.useMemo(
    () => estimateRiskMetrics(portfolio.holdings, RISK_DATA, annualExpRet),
    [portfolio.holdings, annualExpRet]
  );
  const sortinoResult = React.useMemo(() => estimateSortino(annualExpRet, riskMetrics.vol), [annualExpRet, riskMetrics.vol]);
  const cvarResult = React.useMemo(() => estimateCVaR(riskMetrics.vol), [riskMetrics.vol]);

  const mddVal = portfolio.mdd || 0;
  const calmar = React.useMemo(() => (mddVal !== 0 ? (annualExpRet * 100) / Math.abs(mddVal) : 0), [annualExpRet, mddVal]);

  const handleSelectStrategy = (id) => {
    setModal({
      isOpen: true,
      title: "투자 전략 변경",
      message: "현재 전략을 변경하시겠습니까?",
      onConfirm: () => updateStrategy(id),
    });
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--text-main)" }} className="compact-mode">
      <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-glass)", padding: "1rem 1.25rem", marginBottom: 0 }}>
        <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 2 }}>연금 투자 대시보드</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>IRP/연금저축 운용 지원</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isDemo && <Badge c="#633806" bg="#faeeda">데모 모드</Badge>}
            {degradedMode && <Badge c="var(--alert-warn-color)" bg="var(--alert-warn-bg)">대체 데이터</Badge>}
            <Badge
              c={vixLoading ? "var(--text-dim)" : (vixError ? "#a32d2d" : (vixSource === "KIS" ? "#1a73e8" : "#27500a"))}
              bg={vixLoading ? "var(--bg-main)" : (vixError ? "#fcebeb" : (vixSource === "KIS" ? "#eef6ff" : "#eaf3de"))}
              title={vixError || (vixUpdatedAt ? `최종 업데이트: ${new Date(vixUpdatedAt).toLocaleString("ko-KR")} (${vixSource})` : "조회 중")}
            >
              VIX {vixLoading ? "..." : (vixError ? "Err" : (vix?.toFixed(1) || "--"))}
            </Badge>
            <Btn
              sm
              primary={!user}
              onClick={() => {
                setTab("settings");
                if (!user) setRequestedSubTab("account");
              }}
              style={{ minWidth: 70 }}
            >
              {user ? "설정" : "로그인"}
            </Btn>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1rem" }}>
        <KPIStrip
          total={portfolio.total}
          totalDiff={null}
          vix={vix}
          vixMeta={vixUpdatedAt ? { freshness: (() => { const age = (Date.now() - new Date(vixUpdatedAt).getTime()) / 60000; return age <= 5 ? "realtime" : age <= 60 ? "delayed" : "cached"; })() } : null}
          avgCorrelation={avgCorrelation}
          vol={riskMetrics.vol}
          sharpe={riskMetrics.sharpe}
          sortino={sortinoResult.sortino}
          cvar={cvarResult.cvar}
          mdd={mddVal}
          calmar={calmar}
          fearGreedScore={fearGreed?.score ?? null}
          yieldSpreadVal={yieldSpread?.spread ?? null}
          dataGrade={vixError ? "C" : vixSource === "KIS" ? "A" : "B"}
        />
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1rem" }}>
        <div className="workflow-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`workflow-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
            >
              <span className="tab-number">{t.num}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <Suspense fallback={<div style={{ padding: "1rem", fontSize: 12, color: "var(--text-dim)" }}>패널 로딩 중...</div>}>
          {tab === "daily" && (
            <DailyCheckPanel
              portfolio={portfolio}
              vix={vix}
              vixSource={vixSource}
              vixUpdatedAt={vixUpdatedAt}
              vixLoading={vixLoading}
              vixError={vixError}
              masterError={masterError}
              onFetchVix={fetchVix}
              onGo={setTab}
              avgCorrelation={avgCorrelation}
              corrUpdatedAt={corrUpdatedAt}
              corrLoading={corrLoading}
              onRefreshCorr={() => refreshCorrelation(portfolio.holdings)}
              degradedMode={degradedMode}
              targetSource={targetSource}
              fearGreed={fearGreed}
              yieldSpread={yieldSpread}
              unemployment={unemployment}
              signalsLoading={signalsLoading}
              signalsError={signalsError}
              onRefreshSignals={fetchMarketSignals}
            />
          )}

          {tab === "risk" && <RiskPanel portfolio={portfolio} />}

          {tab === "orders" && (
            <OrderPlanPanel
              portfolio={portfolio}
              vix={vix}
              vixSource={vixSource}
              vixUpdatedAt={vixUpdatedAt}
              avgCorrelation={avgCorrelation}
              fearGreed={fearGreed?.score ?? null}
              yieldSpread={yieldSpread?.spread ?? null}
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
              vix={vix}
              vixSource={vixSource}
              vixUpdatedAt={vixUpdatedAt}
              vixError={vixError}
            />
          )}

          {tab === "settings" && (
            <SettingsPanel
              portfolio={portfolio}
              setPortfolio={setPortfolio}
              saveHoldings={saveHoldings}
              savePrincipalTotal={savePrincipalTotal}
              restorePreviousPortfolio={restorePreviousPortfolio}
              restoreInfo={restoreInfo}
              syncStatus={syncStatus}
              krEtfs={krEtfs}
              tickerMap={tickerMap}
              masterError={masterError}
              user={user}
              login={login}
              signUp={signUp}
              logout={logout}
              isSaving={isSaving}
              initialSubTab={requestedSubTab}
              onSubTabHandled={() => setRequestedSubTab(null)}
            />
          )}
        </Suspense>
      </div>

      <ConfirmModal {...modal} onClose={() => setModal((m) => ({ ...m, isOpen: false }))} />
    </div>
  );
}
