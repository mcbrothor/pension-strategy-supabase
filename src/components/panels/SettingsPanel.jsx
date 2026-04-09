import React, { useState } from "react";
import EntryPanel from "./EntryPanel.jsx";
import AuthSetup from "../common/AuthSetup.jsx";
import RetirementRoadmap from "./RetirementRoadmap.jsx";
import AlertsPanel from "./AlertsPanel.jsx";
import { Btn } from "../common/index.jsx";

/**
 * 설정 패널 — 자산관리 + 계정 + 은퇴로드맵 + 알림설정 통합
 * 서브탭으로 구분하여 한 화면에서 모든 설정을 관리합니다.
 */
const SUB_TABS = [
  { id: "assets", label: "자산 관리", icon: "📊" },
  { id: "alerts", label: "알림 설정", icon: "🔔" },
  { id: "roadmap", label: "은퇴 로드맵", icon: "🗺️" },
  { id: "account", label: "계정", icon: "👤" },
];

export default function SettingsPanel({
  portfolio, setPortfolio, saveHoldings, savePrincipalTotal, krEtfs, tickerMap, masterError,
  user, login, signUp, logout, isSaving, initialSubTab, onSubTabHandled
}) {
  const [subTab, setSubTab] = useState("assets");

  React.useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
      if (onSubTabHandled) onSubTabHandled();
    }
  }, [initialSubTab, onSubTabHandled]);

  return (
    <div>
      {/* 서브탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {SUB_TABS.map(t => (
          <Btn
            key={t.id}
            sm
            primary={subTab === t.id}
            onClick={() => setSubTab(t.id)}
            data-testid={`settings-subtab-${t.id}`}
          >
            {t.icon} {t.label}
          </Btn>
        ))}
      </div>

      {/* 콘텐츠 */}
      {subTab === "assets" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <EntryPanel
            portfolio={portfolio}
            onSave={saveHoldings}
            onPrincipalTotalChange={savePrincipalTotal}
            onRowsChange={(nextRows) =>
              setPortfolio((prev) => ({
                ...prev,
                holdings: nextRows,
                total: nextRows.reduce((sum, item) => sum + (Number(item.amt) || 0), 0),
              }))
            }
            krEtfs={krEtfs}
            tickerMap={tickerMap}
            masterError={masterError}
          />
        </div>
      )}

      {subTab === "alerts" && (
        <AlertsPanel
          portfolio={portfolio}
          onStopLossChange={v => setPortfolio(p => ({ ...p, stopLoss: v }))}
          onMddChange={v => setPortfolio(p => ({ ...p, mddLimit: v }))}
        />
      )}

      {subTab === "roadmap" && (
        <RetirementRoadmap strategyId={portfolio.strategy} />
      )}

      {subTab === "account" && (
        <AuthSetup
          user={user}
          onLogin={login}
          onSignUp={signUp}
          onLogout={logout}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
