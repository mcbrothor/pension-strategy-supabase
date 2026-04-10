import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext.jsx';
import { DEMO_PORTFOLIO, STRATEGIES } from '../constants/index.js';
import { computeTargets } from '../services/momentumEngine.js';

const PortfolioContext = createContext();
const PRINCIPAL_STORAGE_PREFIX = 'portfolio_principal_total';
const PORTFOLIO_STORAGE_PREFIX = 'portfolio_state';
const PORTFOLIO_BACKUP_STORAGE_PREFIX = 'portfolio_state_backup';
const PORTFOLIO_BACKUP_LIMIT = 5;

function getPrincipalStorageKey(userId) {
  return `${PRINCIPAL_STORAGE_PREFIX}:${userId || 'demo'}`;
}

function getPortfolioStorageKey(userId) {
  return `${PORTFOLIO_STORAGE_PREFIX}:${userId || 'demo'}`;
}

function getPortfolioBackupStorageKey(userId) {
  return `${PORTFOLIO_BACKUP_STORAGE_PREFIX}:${userId || 'demo'}`;
}

function readStoredPrincipalTotal(userId) {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(getPrincipalStorageKey(userId));
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeStoredPrincipalTotal(userId, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getPrincipalStorageKey(userId), String(Number(value) || 0));
}

function normalizeHolding(item = {}) {
  return {
    ...item,
    qty: Number(item.qty) || 0,
    price: Number(item.price) || 0,
    amt: Number(item.amt) || 0,
    costAmt: Number(item.costAmt) || 0,
    target: Number(item.target) || 0,
    updatedAt: item.updatedAt || null,
  };
}

function readStoredPortfolio(userId) {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(getPortfolioStorageKey(userId));
  if (!raw) return null;

  try {
    return readPortfolioLike(JSON.parse(raw));
  } catch (error) {
    console.error('Stored portfolio parse error:', error);
    return null;
  }
}

function writeStoredPortfolio(userId, portfolio) {
  if (typeof window === 'undefined') return;
  const normalizedPortfolio = {
    ...portfolio,
    holdings: Array.isArray(portfolio?.holdings) ? portfolio.holdings.map(normalizeHolding) : [],
  };
  window.localStorage.setItem(getPortfolioStorageKey(userId), JSON.stringify(normalizedPortfolio));

  if (normalizedPortfolio.holdings.length === 0) return;

  const backupKey = getPortfolioBackupStorageKey(userId);
  const existingBackupsRaw = window.localStorage.getItem(backupKey);
  let existingBackups = [];

  try {
    existingBackups = existingBackupsRaw ? JSON.parse(existingBackupsRaw) : [];
  } catch {
    existingBackups = [];
  }

  const nextBackup = {
    savedAt: new Date().toISOString(),
    portfolio: normalizedPortfolio,
  };

  const dedupedBackups = existingBackups.filter((item) => {
    try {
      return JSON.stringify(item?.portfolio?.holdings || []) !== JSON.stringify(normalizedPortfolio.holdings);
    } catch {
      return true;
    }
  });

  window.localStorage.setItem(
    backupKey,
    JSON.stringify([nextBackup, ...dedupedBackups].slice(0, PORTFOLIO_BACKUP_LIMIT))
  );
}

function readStoredPortfolioBackups(userId) {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(getPortfolioBackupStorageKey(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        savedAt: item?.savedAt || null,
        portfolio: item?.portfolio ? readPortfolioLike(item.portfolio) : null,
      }))
      .filter((item) => item.portfolio && item.portfolio.holdings.length > 0);
  } catch (error) {
    console.error('Stored portfolio backup parse error:', error);
    return [];
  }
}

function readPortfolioLike(parsed) {
  const holdings = Array.isArray(parsed?.holdings) ? parsed.holdings.map(normalizeHolding) : [];
  const total = holdings.reduce((sum, item) => sum + (Number(item.amt) || 0), 0);
  const principalTotal =
    Number(parsed?.principalTotal) ||
    holdings.reduce((sum, item) => sum + (Number(item.costAmt) || 0), 0) ||
    DEMO_PORTFOLIO.principalTotal;

  return {
    ...DEMO_PORTFOLIO,
    ...parsed,
    total,
    principalTotal,
    holdings,
    history: Array.isArray(parsed?.history) ? parsed.history : DEMO_PORTFOLIO.history,
  };
}

/**
 * 전략 composition으로부터 기본 target 맵을 생성하는 헬퍼
 * - fixed 전략: composition의 w 값 사용
 * - momentum 전략: composition의 w 값 사용 (없으면 균등 배분 추정)
 */
function buildDefaultTargets(strategy) {
  if (!strategy || !strategy.composition) return {};
  const targets = {};
  strategy.composition.forEach(c => {
    // w가 명시되어 있으면 사용, 없으면 0 (momentum 역할별 동적 결정이므로)
    targets[c.cls] = c.w || 0;
  });
  return targets;
}

/**
 * holdings 배열에 target 값을 재매핑하는 헬퍼
 * 왜: 전략 변경 시 기존 holdings의 target이 이전 전략 것으로 남는 문제 해결
 */
function remapHoldingsTargets(holdings, targetMap) {
  return holdings.map(h => ({
    ...h,
    target: targetMap[h.cls] ?? h.target ?? 0
  }));
}

export function PortfolioProvider({ children }) {
  const { user, loading: authLoading, lastUserId } = useAuth();
  const [portfolio, setPortfolio] = useState(DEMO_PORTFOLIO);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [restoreInfo, setRestoreInfo] = useState({ hasBackup: false, savedAt: null });
  const [momentumTargets, setMomentumTargets] = useState({});

  // 정합성 수정: 모멘텀 API 실패 시 직전 유효 타깃으로 폴백
  const [lastGoodTargets, setLastGoodTargets] = useState({});
  // 정합성 수정: 현재 target의 출처를 추적 (UI에서 폴백 경고 표시용)
  const [targetSource, setTargetSource] = useState('default'); // 'api' | 'fallback_last' | 'fallback_default'
  const [degradedMode, setDegradedMode] = useState(false);

  const fetchMomentumTargets = async (strategyId) => {
    const s = STRATEGIES.find(it => it.id === strategyId);
    if (!s || s.type !== "momentum") {
      setMomentumTargets({});
      setDegradedMode(false);
      setTargetSource('default');
      return {};
    }
    try {
      const res = await fetch("/api/momentum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          strategyId,
          composition: s.composition
        })
      });
      const data = await res.json();
      if (data.ok && data.data) {
        // API 성공: 서버에서 받은 데이터로 타깃 비중 프론트엔드 직접 계산
        const computedTargets = computeTargets(strategyId, data.data, s.composition);
        
        if (computedTargets) {
          setMomentumTargets(computedTargets);
          setLastGoodTargets(computedTargets); // 직전 유효 타깃 보존
          setDegradedMode(false);
          setTargetSource('api');
          return computedTargets;
        }
      }
    } catch (e) {
      console.error("Momentum Fetch Error:", e);
    }

    // API 실패 시 폴백 체인: lastGoodTargets → 전략 기본 composition
    const hasLastGood = Object.keys(lastGoodTargets).length > 0;
    if (hasLastGood) {
      console.warn("모멘텀 API 실패 → 직전 유효 타깃으로 폴백");
      setMomentumTargets(lastGoodTargets);
      setDegradedMode(true);
      setTargetSource('fallback_last');
      return lastGoodTargets;
    }

    // 직전 유효 타깃도 없는 경우: 전략 기본 비중으로 보수적 폴백
    const defaultTargets = buildDefaultTargets(s);
    console.warn("모멘텀 API 실패 + 직전 타깃 없음 → 전략 기본 비중으로 폴백");
    setMomentumTargets(defaultTargets);
    setDegradedMode(true);
    setTargetSource('fallback_default');
    return defaultTargets;
  };

  const refreshRestoreInfo = React.useCallback(
    (targetUserId) => {
      const backups = readStoredPortfolioBackups(targetUserId);
      const primaryPortfolio = readStoredPortfolio(targetUserId);
      const fallbackBackup = backups[0]?.portfolio || null;
      const latestPortfolio =
        primaryPortfolio?.holdings?.length > 0 ? primaryPortfolio : fallbackBackup;
      const latestSavedAt =
        backups[0]?.savedAt || latestPortfolio?.updatedAt || null;

      setRestoreInfo({
        hasBackup: Boolean(latestPortfolio && latestPortfolio.holdings.length > 0),
        savedAt: latestSavedAt,
      });

      return latestPortfolio;
    },
    []
  );

  const loadPortfolio = async () => {
    if (!user) return;
    try {
      setIsFetching(true);
      const { data: holdings, error: hErr } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", user.id);
      if (hErr) throw hErr;

      const { data: configs, error: cErr } = await supabase
        .from("config")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (cErr && cErr.code !== "PGRST116") throw cErr;

      const strategyId = configs?.strategy_id || "allseason";
      const currentStrat = STRATEGIES.find(s => s.id === strategyId);
      
      let dynamicTargets = {};
      if (currentStrat?.type === "momentum") {
        dynamicTargets = await fetchMomentumTargets(strategyId);
      }

      const assetClassTargetMap = {};
      if (currentStrat) {
        if (currentStrat.type === "fixed" && currentStrat.composition) {
          currentStrat.composition.forEach(c => {
            if (c.cls) assetClassTargetMap[c.cls] = c.w || 0;
          });
        } else if (currentStrat.type === "momentum" && dynamicTargets) {
          // dynamicTargets는 이제 API 실패 시에도 폴백 값이 들어있음
          Object.keys(dynamicTargets).forEach(key => {
            assetClassTargetMap[key] = dynamicTargets[key] || 0;
          });
        }
      }

      const { data: snapshots, error: sErr } = await supabase
        .from("snapshots")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (sErr) throw sErr;

      const mappedHoldings = (holdings || []).map(it => {
        const target = assetClassTargetMap[it.asset_class] || 0;
        return {
          id: it.id,
          etf: it.name,
          code: it.ticker,
          cls: it.asset_class,
          target: target,
          qty: Number(it.quantity) || 0,
          price: Number(it.current_price) || 0,
          amt: Number(it.amount) || 0,
          costAmt: Number(it.cost_amt) || 0,
          updatedAt: it.updated_at || null,
          cur: 0 
        };
      });

      const total = mappedHoldings.reduce((sum, h) => sum + h.amt, 0);
      const holdingsPrincipalTotal = mappedHoldings.reduce((sum, h) => sum + (Number(h.costAmt) || 0), 0);
      const storedPrincipalTotal = readStoredPrincipalTotal(user.id);
      const principalTotal = storedPrincipalTotal != null ? storedPrincipalTotal : holdingsPrincipalTotal;

      if (storedPrincipalTotal == null && holdingsPrincipalTotal > 0) {
        writeStoredPrincipalTotal(user.id, holdingsPrincipalTotal);
      }

      const nextPortfolio = {
        ...DEMO_PORTFOLIO,
        strategy: strategyId,
        total: total,
        principalTotal,
        holdings: mappedHoldings,
        history: (snapshots || []).map(s => ({
          date: s.date,
          total: s.total_amt,
          strategy: s.strategy_id,
          weights: s.weights
        }))
      };

      const cachedPortfolio = readStoredPortfolio(user.id);
      if (mappedHoldings.length === 0 && cachedPortfolio?.holdings?.length > 0) {
        setPortfolio(cachedPortfolio);
        setIsDemo(false);
        refreshRestoreInfo(user.id);
        return;
      }

      setPortfolio(nextPortfolio);
      writeStoredPortfolio(user.id, nextPortfolio);
      refreshRestoreInfo(user.id);

      setIsDemo(false);
    } catch (e) {
      console.error("Load Error:", e.message);
      const cachedPortfolio = readStoredPortfolio(user.id);
      if (cachedPortfolio) {
        setPortfolio(cachedPortfolio);
        setIsDemo(false);
      }
      refreshRestoreInfo(user.id);
    } finally {
      setIsFetching(false);
    }
  };

  const saveHoldings = async (items) => {
    const total = items.reduce((sum, h) => sum + (Number(h.amt) || 0), 0);

    if (!user) {
      setPortfolio(prev => {
        const nextPortfolio = {
          ...prev,
          total,
          holdings: items.map(normalizeHolding),
        };
        writeStoredPortfolio(null, nextPortfolio);
        refreshRestoreInfo(null);
        return nextPortfolio;
      });
      return;
    }

    setIsSaving(true);
    try {
      const saveDate = new Date().toISOString().split("T")[0];
      
      // 기존 방식(전체 삭제 후 삽입)의 데이터 유실 리스크 해결: Upsert
      const existingRes = await supabase.from('holdings').select('id').eq('user_id', user.id);
      const existingDBIds = (existingRes.data || []).map(r => r.id);
      
      const incomingIds = items.map(it => it.id).filter(id => id);
      const idsToDelete = existingDBIds.filter(id => !incomingIds.includes(id));
      
      if (idsToDelete.length > 0) {
        const { error } = await supabase.from('holdings').delete().in('id', idsToDelete);
        if (error) throw error;
      }
      
      const upsertItems = items
        .filter(it => it.code && (Number(it.qty) > 0 || Number(it.amt) > 0))
        .map(it => {
          const payload = {
            user_id: user.id,
            ticker: it.code,
            name: it.etf || "",
            asset_class: it.cls || "",
            quantity: Number(it.qty) || 0,
            current_price: Number(it.price) || 0,
            cost_amt: Number(it.costAmt) || 0,
            amount: Number(it.amt) || 0,
            updated_at: new Date().toISOString()
          };
          if (it.id) payload.id = it.id;
          return payload;
        });

      if (upsertItems.length > 0) {
        const { error } = await supabase.from('holdings').upsert(upsertItems, { onConflict: 'id' });
        if (error) throw error;
      }

      const weights = {};
      items.forEach(h => {
        if (total > 0 && h.cls) {
          const w = (Number(h.amt) / total) * 100;
          weights[h.cls] = (weights[h.cls] || 0) + w;
        }
      });
      Object.keys(weights).forEach(k => {
        weights[k] = Math.round(weights[k] * 10) / 10;
      });

      const { data: existingSnapshot, error: snapshotLookupError } = await supabase
        .from('snapshots')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', saveDate)
        .maybeSingle();

      if (snapshotLookupError) {
        console.error('Snapshot Lookup Error:', snapshotLookupError.message);
      } else {
        const snapshotPayload = {
          user_id: user.id,
          date: saveDate,
          strategy_id: portfolio.strategy,
          total_amt: total,
          weights,
        };

        const snapshotQuery = existingSnapshot?.id
          ? supabase.from('snapshots').update(snapshotPayload).eq('id', existingSnapshot.id)
          : supabase.from('snapshots').insert(snapshotPayload);

        const { error: snapshotError } = await snapshotQuery;
        if (snapshotError) {
          console.error('Snapshot Save Error:', snapshotError.message);
        }
      }

      await loadPortfolio();
    } catch (e) {
      console.error("Save Error:", e.message);
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const savePrincipalTotal = async (value) => {
    const normalized = Math.max(0, Number(value) || 0);
    writeStoredPrincipalTotal(user?.id, normalized);
    setPortfolio(prev => {
      const nextPortfolio = {
        ...prev,
        principalTotal: normalized,
      };
      writeStoredPortfolio(user?.id, nextPortfolio);
      refreshRestoreInfo(user?.id || null);
      return nextPortfolio;
    });
  };

  const restorePreviousPortfolio = React.useCallback(() => {
    const targetUserId = user?.id || lastUserId || null;
    const latestStoredPortfolio = refreshRestoreInfo(targetUserId);
    if (!latestStoredPortfolio) return false;

    setPortfolio(latestStoredPortfolio);
    setIsDemo(!targetUserId);
    return true;
  }, [lastUserId, refreshRestoreInfo, user]);

  const updateStrategy = async (strategyId) => {
    const newStrat = STRATEGIES.find(it => it.id === strategyId);

    if (!user) {
      // 정합성 수정: 데모 모드에서도 전략 변경 시 holdings target 즉시 재계산
      const newTargetMap = {};
      if (newStrat) {
        if (newStrat.type === "fixed" && newStrat.composition) {
          newStrat.composition.forEach(c => {
            if (c.cls) newTargetMap[c.cls] = c.w || 0;
          });
        } else if (newStrat.type === "momentum") {
          // 데모 모드에서는 API 호출 대신 기본 composition 비중 사용
          newStrat.composition.forEach(c => {
            if (c.cls) newTargetMap[c.cls] = c.w || 0;
          });
        }
      }

      setPortfolio(p => ({
        ...p,
        strategy: strategyId,
        // DEMO_PORTFOLIO의 rebalPeriod를 새 전략에 맞게 갱신
        rebalPeriod: newStrat?.rebal || p.rebalPeriod,
        // holdings의 target을 새 전략 기준으로 재매핑
        holdings: remapHoldingsTargets(p.holdings, newTargetMap)
      }));
      return;
    }

    try {
      await supabase.from('config').upsert({
        user_id: user.id,
        strategy_id: strategyId,
        updated_at: new Date().toISOString()
      });
      if (newStrat?.type === "momentum") await fetchMomentumTargets(strategyId);
      await loadPortfolio();
    } catch (e) {
      console.error("Strategy Update Error:", e.message);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      loadPortfolio();
      return;
    }

    const lastSignedInPortfolio = lastUserId ? readStoredPortfolio(lastUserId) : null;
    if (lastSignedInPortfolio) {
      setPortfolio(lastSignedInPortfolio);
      setIsDemo(false);
      refreshRestoreInfo(lastUserId);
      return;
    }

    const storedPortfolio = readStoredPortfolio(null);
    const storedPrincipalTotal = readStoredPrincipalTotal(null);
    setPortfolio(
      storedPortfolio || {
        ...DEMO_PORTFOLIO,
        principalTotal: storedPrincipalTotal != null ? storedPrincipalTotal : DEMO_PORTFOLIO.principalTotal
        }
    );
    setIsDemo(true);
    refreshRestoreInfo(null);
  }, [authLoading, user, lastUserId, refreshRestoreInfo]);

  return (
    <PortfolioContext.Provider value={{ 
      portfolio, 
      setPortfolio,
      isFetching, 
      isSaving, 
      isDemo, 
      loadPortfolio, 
      saveHoldings, 
      savePrincipalTotal,
      restorePreviousPortfolio,
      restoreInfo,
      updateStrategy,
      fetchMomentumTargets, // 미리보기용 노출
      degradedMode,
      targetSource
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export const usePortfolio = () => useContext(PortfolioContext);
