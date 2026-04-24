import React, { useState } from "react";
import EntryPanel from "./EntryPanel.jsx";
import AssetHistory from "./AssetHistory.jsx";
import TransactionsPanel from "./TransactionsPanel.jsx";
import { Btn } from "../common/index.jsx";

const SUB_TABS = [
  { id: "manage", label: "자산 관리", icon: "📊" },
  { id: "transactions", label: "거래내역", icon: "🧾" },
  { id: "history", label: "자산 히스토리", icon: "📜" },
];

export default function AssetPanel({
  portfolio,
  setPortfolio,
  saveHoldings,
  savePrincipalTotal,
  saveEvaluationAmount,
  saveTransactions,
  restorePreviousPortfolio,
  restoreInfo,
  syncStatus,
  krEtfs,
  tickerMap,
  masterError,
  onRefreshPrices,
}) {
  const [subTab, setSubTab] = useState("manage");

  return (
    <div>
      {/* 서브탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {SUB_TABS.map((t) => (
          <Btn
            key={t.id}
            sm
            primary={subTab === t.id}
            onClick={() => setSubTab(t.id)}
            data-testid={`asset-subtab-${t.id}`}
          >
            {t.icon} {t.label}
          </Btn>
        ))}
      </div>

      {/* 콘텐츠 */}
      {subTab === "manage" && (
        <EntryPanel
          portfolio={portfolio}
          onSave={saveHoldings}
          onPrincipalTotalChange={savePrincipalTotal}
          onEvaluationAmountChange={saveEvaluationAmount}
          onRestorePrevious={restorePreviousPortfolio}
          onRefreshPrices={onRefreshPrices}
          restoreInfo={restoreInfo}
          syncStatus={syncStatus}
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
      )}

      {subTab === "transactions" && (
        <TransactionsPanel
          transactions={portfolio.transactions || []}
          onSave={saveTransactions}
        />
      )}

      {subTab === "history" && <AssetHistory />}
    </div>
  );
}
