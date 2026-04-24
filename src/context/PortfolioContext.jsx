import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext.jsx';
import { DEMO_PORTFOLIO, STRATEGIES } from '../constants/index.js';
import { computeTargetDecision } from '../services/momentumEngine.js';
import { applyAdaptiveOverlay, applyVolTargetOverlay } from '../services/overlayEngine.js';
import {
  CASH_ASSET_CLASS,
  DEFAULT_ALLOCATION_POLICY,
  DEFAULT_CASH_DEPLOYMENT_STATE,
  DEFAULT_RETIREMENT_PLAN,
  applyPolicyToTargetWeights,
  calculateRetirementTarget,
  compositionToWeights,
} from '../services/portfolioPlanningEngine.js';
import { isUuidLike, normalizeTransaction } from '../services/transactionEngine.js';

const ASSET_CLASS_MAPPING = {
  // 주식
  "미국주식": "미국 주식", "선진국주식": "미국 주식", "신흥국주식": "미국 주식",
  "US Stock": "미국 주식", "Developed Stock": "미국 주식", "Emerging Stock": "미국 주식",
  "국내주식": "국내 주식", "KR Stock": "국내 주식",
  // 채권 (장기)
  "미국장기채권": "장기채", "미국중기채권": "장기채", "물가연동채권": "장기채",
  "US Long Bond": "장기채", "US Mid Bond": "장기채", "TIPS": "장기채",
  // 채권 (단기)
  "미국단기채권": "단기채", "국내채권": "단기채", "회사채": "단기채",
  "하이일드채권": "단기채", "신흥국채권": "단기채", "글로벌채권": "단기채",
  "Bond": "단기채", "Corporate Bond": "단기채", "High Yield": "단기채",
  // 실물자산
  "금": "실물자산", "원자재": "실물자산", "부동산리츠": "실물자산",
  "Gold": "실물자산", "Commodity": "실물자산", "REIT": "실물자산", "Real Assets": "실물자산",
  // 현금
  "현금MMF": "현금", "Cash": "현금", "Cash MMF": "현금"
};

function migrateAssetClass(cls) {
  return ASSET_CLASS_MAPPING[cls] || cls;
}

const PortfolioContext = createContext();
const PORTFOLIO_STORAGE_PREFIX = 'portfolio_state';
const PORTFOLIO_BACKUP_STORAGE_PREFIX = 'portfolio_state_backup';
const PORTFOLIO_BACKUP_LIMIT = 5;

function normalizeAllocationPolicy(policy = {}) {
  const merged = {
    ...DEFAULT_ALLOCATION_POLICY,
    ...policy,
    cashDeploymentState: {
      ...DEFAULT_CASH_DEPLOYMENT_STATE,
      ...(policy?.cashDeploymentState || {}),
    },
  };

  return {
    ...merged,
    baseCashPct: Math.min(Math.max(Number(merged.baseCashPct) || 0, 0), 30),
    glidePathStepPct: Math.min(Math.max(Number(merged.glidePathStepPct) || 0, 0), 10),
    glidePathTriggerYears: Math.min(Math.max(Number(merged.glidePathTriggerYears) || 10, 1), 30),
    maxSafePct: Math.min(Math.max(Number(merged.maxSafePct) || 60, 0), 100),
  };
}

function normalizeRetirementPlan(plan = {}, currentBalance = 0) {
  return calculateRetirementTarget({
    ...DEFAULT_RETIREMENT_PLAN,
    currentBalance: currentBalance || DEFAULT_RETIREMENT_PLAN.currentBalance,
    ...plan,
  });
}

function getPortfolioStorageKey(userId) {
  return `${PORTFOLIO_STORAGE_PREFIX}:${userId || 'demo'}`;
}

function getPortfolioBackupStorageKey(userId) {
  return `${PORTFOLIO_BACKUP_STORAGE_PREFIX}:${userId || 'demo'}`;
}

function normalizeHolding(item = {}) {
  return {
    ...item,
    cls: migrateAssetClass(item.cls),
    qty: Number(item.qty) || 0,
    price: Number(item.price) || 0,
    amt: Number(item.amt) || 0,
    costAmt: Number(item.costAmt) || 0,
    target: Number(item.target) || 0,
    updatedAt: item.updatedAt || null,
  };
}

function normalizeTransactions(items = []) {
  return Array.isArray(items) ? items.map((item, index) => normalizeTransaction(item, index)) : [];
}

function normalizeStrategyOverlay(overlay = null) {
  if (!overlay || typeof overlay !== "object") return null;
  return {
    source: overlay.source || "default",
    targets: overlay.targets || null,
    overlaySummary: overlay.overlaySummary || null,
    targetEquity: Number.isFinite(Number(overlay.targetEquity)) ? Number(overlay.targetEquity) : null,
    volScale: Number.isFinite(Number(overlay.volScale)) ? Number(overlay.volScale) : null,
    updatedAt: overlay.updatedAt || null,
  };
}

const CASH_TICKER = 'CASH';
const CASH_NAME = '예수금(현금)';

function reconcileCashHolding(items = [], evaluationAmount = 0, updatedAt = null) {
  const rows = Array.isArray(items) ? items.map((item) => normalizeHolding(item)) : [];
  const nonCashRows = rows.filter((item) => item.code !== CASH_TICKER);
  const existingCash = rows.find((item) => item.code === CASH_TICKER) || null;
  const nonCashTotal = nonCashRows.reduce((sum, item) => sum + (Number(item.amt) || 0), 0);
  const cashAmount =
    Number(evaluationAmount) > 0
      ? Math.max(0, Number(evaluationAmount) - nonCashTotal)
      : Math.max(0, Number(existingCash?.amt) || 0);

  return [
    ...nonCashRows,
    normalizeHolding({
      ...(existingCash || {}),
      etf: existingCash?.etf || CASH_NAME,
      code: CASH_TICKER,
      cls: existingCash?.cls || CASH_ASSET_CLASS,
      qty: 0,
      price: 0,
      amt: cashAmount,
      costAmt: Number(existingCash?.costAmt) || cashAmount,
      updatedAt: updatedAt || existingCash?.updatedAt || null,
    }),
  ];
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
    transactions: normalizeTransactions(portfolio?.transactions),
    strategyOverlay: normalizeStrategyOverlay(portfolio?.strategyOverlay),
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
  const allocationPolicy = normalizeAllocationPolicy(parsed?.allocationPolicy);
  const retirementPlan = normalizeRetirementPlan(
    parsed?.retirementPlan,
    Number(parsed?.retirementPlan?.currentBalance) || Number(parsed?.evaluationAmount) || total || DEMO_PORTFOLIO.total
  );

  return {
    ...DEMO_PORTFOLIO,
    ...parsed,
    total,
    principalTotal,
    evaluationAmount: Number(parsed?.evaluationAmount) || 0,
    evaluationUpdatedAt: parsed?.evaluationUpdatedAt || null,
    principalUpdatedAt: parsed?.principalUpdatedAt || null,
    retirementPlan,
    allocationPolicy,
    holdings,
    transactions: normalizeTransactions(parsed?.transactions || DEMO_PORTFOLIO.transactions),
    strategyOverlay: normalizeStrategyOverlay(parsed?.strategyOverlay),
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
  return compositionToWeights(strategy.composition);
}

function buildAdjustedTargets(strategy, rawTargets, retirementPlan, allocationPolicy) {
  if (!strategy) return {};
  const hasRawTargets =
    rawTargets &&
    Object.keys(rawTargets).some((key) => Number.isFinite(Number(rawTargets[key])) && Number(rawTargets[key]) > 0);
  const baseTargets = hasRawTargets ? rawTargets : buildDefaultTargets(strategy);
  return applyPolicyToTargetWeights(baseTargets, allocationPolicy, retirementPlan);
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
  const [portfolio, setPortfolio] = useState(() => readPortfolioLike(DEMO_PORTFOLIO));
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [restoreInfo, setRestoreInfo] = useState({ hasBackup: false, savedAt: null });
  const [syncStatus, setSyncStatus] = useState('auth_required');
  const [momentumTargets, setMomentumTargets] = useState({});

  // 정합성 수정: 모멘텀 API 실패 시 직전 유효 타깃으로 폴백
  const [lastGoodTargets, setLastGoodTargets] = useState({});
  // 정합성 수정: 현재 target의 출처를 추적 (UI에서 폴백 경고 표시용)
  const [targetSource, setTargetSource] = useState('default'); // 'api' | 'fallback_last' | 'fallback_default'
  const [degradedMode, setDegradedMode] = useState(false);
  const [strategyOverlay, setStrategyOverlay] = useState(() => normalizeStrategyOverlay(DEMO_PORTFOLIO.strategyOverlay));

  const persistConfigPatch = React.useCallback(async (patch = {}) => {
    if (!user) return;
    try {
      await supabase.from('config').upsert({
        user_id: user.id,
        ...patch,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Config Persist Warning:', error.message);
    }
  }, [user]);

  const resolveOverlayTargets = async (strategy, rawTargets, options = {}) => {
    if (!strategy || !rawTargets) {
      return { targets: rawTargets || {}, overlay: null };
    }

    try {
      const [signalRes, vixRes] = await Promise.all([
        fetch("/api/market-signals"),
        fetch("/api/vix").catch(() => null),
      ]);
      const signalData = signalRes?.ok ? await signalRes.json() : null;
      const vixData = vixRes?.ok ? await vixRes.json() : null;
      const adaptive = applyAdaptiveOverlay(rawTargets, strategy, {
        cape: signalData?.cape,
        creditSpread: signalData?.creditSpread,
        yieldSpread: signalData?.yieldCurve?.spread,
        vix: Number(vixData?.vix) || null,
      });
      const volAdjusted = applyVolTargetOverlay(
        adaptive.targets,
        Number(options.realizedVol ?? portfolio?.riskSnapshot?.vol) || null,
        12
      );
      return {
        targets: volAdjusted.targets,
        overlay: {
          source: "market_signals",
          targets: volAdjusted.targets,
          overlaySummary: adaptive.overlaySummary,
          targetEquity: adaptive.targetEquity,
          volScale: volAdjusted.volScale,
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.warn("Overlay Fetch Error:", error.message);
      return { targets: rawTargets, overlay: null };
    }
  };

  const fetchMomentumTargets = async (strategyId, options = {}) => {
    const s = STRATEGIES.find(it => it.id === strategyId);
    const retirementPlan = options.retirementPlan || portfolio.retirementPlan;
    const allocationPolicy = options.allocationPolicy || portfolio.allocationPolicy;
    const returnDetails = Boolean(options.returnDetails);
    const buildMomentumResult = (rawTargets, detail, source, overlayState = null) => {
      const overlayTargets = overlayState?.volTargets || overlayState?.targets || rawTargets;
      const adjustedTargets = buildAdjustedTargets(s, overlayTargets, retirementPlan, allocationPolicy);
      if (!returnDetails) return adjustedTargets;
      return {
        targets: adjustedTargets,
        rawTargets,
        detail: {
          ...(detail || {}),
          source,
          overlaySummary: overlayState?.overlaySummary || null,
          targetEquity: overlayState?.targetEquity ?? null,
          volScale: overlayState?.volScale ?? 1,
          adjustedTargets,
          policy: {
            baseCashPct: Number(allocationPolicy?.baseCashPct) || 0,
            glidePathStepPct: Number(allocationPolicy?.glidePathStepPct) || 0,
            glidePathTriggerYears: Number(allocationPolicy?.glidePathTriggerYears) || 0,
            maxSafePct: Number(allocationPolicy?.maxSafePct) || 0,
            yearsToRetirement:
              Number(retirementPlan?.retirementAge) > 0 && Number(retirementPlan?.currentAge) > 0
                ? Math.max(Number(retirementPlan.retirementAge) - Number(retirementPlan.currentAge), 0)
                : null,
          },
        },
        source,
      };
    };
    if (!s || s.type !== "momentum") {
      setMomentumTargets({});
      setDegradedMode(false);
      setTargetSource('default');
      return returnDetails ? { targets: {}, rawTargets: {}, detail: null, source: 'default' } : {};
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
        const decision = computeTargetDecision(strategyId, data.data, s.composition);
        const computedTargets = decision.targets;
        
        if (computedTargets) {
          const overlayResolved = await resolveOverlayTargets(s, computedTargets, options);
          const finalTargets = overlayResolved.targets || computedTargets;
          setMomentumTargets(finalTargets);
          setLastGoodTargets(finalTargets); // 직전 유효 타깃 보존
          setDegradedMode(false);
          setTargetSource('api');
          setStrategyOverlay(normalizeStrategyOverlay(overlayResolved.overlay));
          return buildMomentumResult(computedTargets, decision.detail, 'api', overlayResolved.overlay);
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
      return buildMomentumResult(lastGoodTargets, {
        strategyId,
        title: "직전 유효 모멘텀 비중 사용",
        summary: "현재 모멘텀 데이터 조회가 실패하여 직전에 성공했던 동적 비중을 사용했습니다.",
        formula: "adjusted_targets = applyPolicyToTargetWeights(last_good_momentum_targets, allocationPolicy, retirementPlan)",
        dataBasis: "직전 성공한 모멘텀 계산 결과",
        steps: ["현재 API 응답 실패", "직전 유효 타깃을 불러옴", "평시 현금/글라이드패스 정책을 다시 적용"],
        rows: [],
        rawTargets: lastGoodTargets,
      }, 'fallback_last');
    }

    // 직전 유효 타깃도 없는 경우: 전략 기본 비중으로 보수적 폴백
    const defaultTargets = buildDefaultTargets(s);
    console.warn("모멘텀 API 실패 + 직전 타깃 없음 → 전략 기본 비중으로 폴백");
    setMomentumTargets(defaultTargets);
    setDegradedMode(true);
    setTargetSource('fallback_default');
    return buildMomentumResult(defaultTargets, {
      strategyId,
      title: "기본 전략 비중 폴백",
      summary: "현재 모멘텀 데이터와 직전 유효 결과가 모두 없어 전략 정의의 기본 비중을 사용했습니다.",
      formula: "adjusted_targets = applyPolicyToTargetWeights(composition_weights, allocationPolicy, retirementPlan)",
      dataBasis: "전략 composition 기본값",
      steps: ["현재 API 응답 실패", "직전 유효 타깃 없음", "전략 기본 비중에 평시 현금/글라이드패스 정책 적용"],
      rows: [],
      rawTargets: defaultTargets,
    }, 'fallback_default');
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
      setSyncStatus('syncing');
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

      const storedPortfolio = readStoredPortfolio(user.id);
      const allocationPolicy = normalizeAllocationPolicy(
        configs?.allocation_policy || storedPortfolio?.allocationPolicy || portfolio.allocationPolicy
      );
      const retirementPlanForTargets = normalizeRetirementPlan(
        configs?.retirement_plan || storedPortfolio?.retirementPlan || portfolio.retirementPlan,
        Number(configs?.evaluation_amount) || Number(storedPortfolio?.retirementPlan?.currentBalance) || 0
      );
      const strategyId = configs?.strategy_id || "allseason";
      const currentStrat = STRATEGIES.find(s => s.id === strategyId);
      let resolvedOverlay = normalizeStrategyOverlay(configs?.strategy_overlay || storedPortfolio?.strategyOverlay || strategyOverlay);
      
      let dynamicTargets = {};
      if (currentStrat?.type === "momentum") {
        dynamicTargets = await fetchMomentumTargets(strategyId, {
          retirementPlan: retirementPlanForTargets,
          allocationPolicy,
        });
      } else if (currentStrat) {
        const overlayResolved = await resolveOverlayTargets(currentStrat, buildDefaultTargets(currentStrat));
        dynamicTargets = overlayResolved.targets || {};
        resolvedOverlay = normalizeStrategyOverlay(overlayResolved.overlay);
        setStrategyOverlay(resolvedOverlay);
      }

      const assetClassTargetMap =
        currentStrat?.type === "momentum" || Object.keys(dynamicTargets || {}).length > 0
          ? dynamicTargets
          : buildAdjustedTargets(currentStrat, null, retirementPlanForTargets, allocationPolicy);

      const { data: snapshots, error: sErr } = await supabase
        .from("snapshots")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (sErr) throw sErr;

      let transactions = [];
      try {
        const { data: transactionRows, error: tErr } = await supabase
          .from("holdings_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("trade_date", { ascending: false });
        if (!tErr && Array.isArray(transactionRows)) {
          transactions = transactionRows.map((row, index) => normalizeTransaction({
            id: row.id,
            trade_date: row.trade_date,
            ticker: row.ticker,
            name: row.name,
            asset_class: row.asset_class,
            side: row.side,
            quantity: row.quantity,
            price: row.price,
            fee: row.fee,
            memo: row.memo,
            created_at: row.created_at,
          }, index));
        }
      } catch (transactionError) {
        console.warn("Transaction Load Warning:", transactionError.message);
      }

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
      const principalTotal =
        configs?.principal_total != null ? Number(configs.principal_total) : holdingsPrincipalTotal;
      const retirementPlan = normalizeRetirementPlan(
        {
          ...retirementPlanForTargets,
          ...(configs?.retirement_plan || {}),
          ...(storedPortfolio?.retirementPlan || {}),
          currentBalance:
            Number(storedPortfolio?.retirementPlan?.currentBalance) ||
            Number(configs?.evaluation_amount) ||
            total,
        },
        Number(configs?.evaluation_amount) || total
      );

      const nextPortfolio = {
        ...DEMO_PORTFOLIO,
        strategy: strategyId,
        total: total,
        principalTotal,
        holdings: mappedHoldings,
        transactions,
        strategyOverlay: resolvedOverlay,
        history: (snapshots || []).map(s => ({
          date: s.date,
          total: s.total_amt,
          strategy: s.strategy_id,
          weights: s.weights
        })),
        evaluationAmount: Number(configs?.evaluation_amount) || 0,
        evaluationUpdatedAt: configs?.evaluation_updated_at || null,
        principalUpdatedAt: configs?.principal_updated_at || null,
        retirementPlan,
        allocationPolicy,
        notifyEmail: configs?.notify_email || null,
      };

      setPortfolio(nextPortfolio);
      writeStoredPortfolio(user.id, nextPortfolio);
      refreshRestoreInfo(user.id);

      setIsDemo(false);
      setSyncStatus('supabase');
    } catch (e) {
      console.error("Load Error:", e.message);
      const cachedPortfolio = readStoredPortfolio(user.id);
      if (cachedPortfolio) {
        setPortfolio(cachedPortfolio);
        setIsDemo(false);
      }
      refreshRestoreInfo(user.id);
      setSyncStatus('error');
    } finally {
      setIsFetching(false);
    }
  };

  const saveHoldings = async (items) => {
    const reconciledItems = reconcileCashHolding(items, portfolio.evaluationAmount, new Date().toISOString());
    const total = reconciledItems.reduce((sum, h) => sum + (Number(h.amt) || 0), 0);

    if (!user) {
      setSyncStatus('auth_required');
      throw new Error('Supabase 로그인 세션이 없어 저장할 수 없습니다. 계정 탭에서 다시 로그인해주세요.');
    }

    setIsSaving(true);
    try {
      setSyncStatus('syncing');
      const saveDate = new Date().toISOString().split("T")[0];
      
      // 기존 방식(전체 삭제 후 삽입)의 데이터 유실 리스크 해결: Upsert
      const existingRes = await supabase.from('holdings').select('id').eq('user_id', user.id);
      const existingDBIds = (existingRes.data || []).map(r => r.id);
      
      const incomingIds = reconciledItems.map(it => it.id).filter(id => id);
      const idsToDelete = existingDBIds.filter(id => !incomingIds.includes(id));
      
      if (idsToDelete.length > 0) {
        const { error } = await supabase.from('holdings').delete().in('id', idsToDelete);
        if (error) throw error;
      }
      
      const now = new Date().toISOString();
      const normalizedItems = reconciledItems
        .filter(it => it.code && (Number(it.qty) > 0 || Number(it.amt) > 0 || it.cls === '현금'))
        .map(it => {
          const payload = {
            user_id: user.id,
            ticker: it.code,
            name: it.etf || "",
            asset_class: migrateAssetClass(it.cls || ""),
            quantity: Number(it.qty) || 0,
            current_price: Number(it.price) || 0,
            cost_amt: Number(it.costAmt) || 0,
            amount: Number(it.amt) || 0,
            updated_at: it.updatedAt || now
          };
          if (it.id) payload.id = it.id;
          return payload;
        });

      const existingItems = normalizedItems.filter(it => it.id != null);
      const newItems = normalizedItems.map(({ id, ...rest }) => (id != null ? { id, ...rest } : rest)).filter(it => it.id == null);

      if (existingItems.length > 0) {
        const { error } = await supabase.from('holdings').upsert(existingItems, { onConflict: 'id' });
        if (error) throw error;
      }

      if (newItems.length > 0) {
        const insertPayload = newItems.map(({ id, ...rest }) => rest);
        const { error } = await supabase.from('holdings').insert(insertPayload);
        if (error) throw error;
      }

      const weights = {};
      reconciledItems.forEach(h => {
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
      setSyncStatus('error');
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const saveTransactions = async (items) => {
    const normalizedTransactions = normalizeTransactions(items);

    if (!user) {
      setPortfolio((prev) => {
        const nextPortfolio = { ...prev, transactions: normalizedTransactions };
        writeStoredPortfolio('demo', nextPortfolio);
        return nextPortfolio;
      });
      return normalizedTransactions;
    }

    setIsSaving(true);
    try {
      setSyncStatus('syncing');
      const existing = await supabase.from('holdings_transactions').select('id').eq('user_id', user.id);
      const existingIds = (existing.data || []).map((row) => row.id);
      const incomingIds = normalizedTransactions.map((item) => item.id).filter(isUuidLike);
      const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        const { error } = await supabase.from('holdings_transactions').delete().in('id', idsToDelete);
        if (error) throw error;
      }

      const payload = normalizedTransactions.map((item) => ({
        ...(isUuidLike(item.id) ? { id: item.id } : {}),
        user_id: user.id,
        trade_date: item.tradeDate,
        ticker: item.ticker,
        name: item.name,
        asset_class: migrateAssetClass(item.assetClass),
        side: item.side,
        quantity: item.quantity,
        price: item.price,
        fee: item.fee,
        memo: item.memo,
        created_at: item.createdAt || new Date().toISOString(),
      }));

      if (payload.length > 0) {
        const { error } = await supabase.from('holdings_transactions').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      }

      await loadPortfolio();
      setSyncStatus('supabase');
      return normalizedTransactions;
    } catch (e) {
      console.warn("Save Transactions Warning:", e.message);
      setPortfolio((prev) => {
        const nextPortfolio = { ...prev, transactions: normalizedTransactions };
        writeStoredPortfolio(user.id, nextPortfolio);
        return nextPortfolio;
      });
      return normalizedTransactions;
    } finally {
      setIsSaving(false);
    }
  };

  const savePrincipalTotal = async (value) => {
    const normalized = Math.max(0, Number(value) || 0);
    if (!user) {
      setSyncStatus('auth_required');
      throw new Error('Supabase 로그인 세션이 없어 원금을 저장할 수 없습니다. 계정 탭에서 다시 로그인해주세요.');
    }

    const updatedAt = new Date().toISOString();
    try {
      setSyncStatus('syncing');
      const { error } = await supabase
        .from('config')
        .upsert({ 
          user_id: user.id, 
          principal_total: normalized, 
          principal_updated_at: updatedAt 
        });
      if (error) throw error;

      setPortfolio(prev => {
        const nextPortfolio = {
          ...prev,
          principalTotal: normalized,
          principalUpdatedAt: updatedAt,
        };
        writeStoredPortfolio(user.id, nextPortfolio);
        refreshRestoreInfo(user.id);
        return nextPortfolio;
      });
      setSyncStatus('supabase');
    } catch (e) {
      console.error("Save Principal Error:", e.message);
      setSyncStatus('error');
      throw e;
    }
  };

  const saveEvaluationAmount = async (value) => {
    const evalAmt = Math.max(0, Number(value) || 0);
    if (!user) {
      setSyncStatus('auth_required');
      throw new Error('Supabase 로그인 세션이 없어 평가 금액을 저장할 수 없습니다.');
    }

    const updatedAt = new Date().toISOString();
    try {
      setSyncStatus('syncing');
      
      // 1. 평가 금액 및 시간 DB 저장
      const { error: configErr } = await supabase
        .from('config')
        .upsert({ 
          user_id: user.id, 
          evaluation_amount: evalAmt, 
          evaluation_updated_at: updatedAt 
        });
      if (configErr) throw configErr;

      // 1-1. 이력(History) 누적 기록
      await supabase
        .from('asset_history')
        .insert({
          user_id: user.id,
          evaluation_amount: evalAmt,
          recorded_at: updatedAt
        });

      // ?? ?? ?? ???? ???(??) ?? row ???
      const nextHoldings = reconcileCashHolding(portfolio.holdings, evalAmt, updatedAt);

      // ?? ?? ??
      await saveHoldings(nextHoldings);
      
      // 3. 자산 내역 저장
      await saveHoldings(nextHoldings);
      
      setPortfolio(prev => ({
        ...prev,
        evaluationAmount: evalAmt,
        evaluationUpdatedAt: updatedAt
      }));
      
    } catch (e) {
      console.error("Save Evaluation Error:", e.message);
      setSyncStatus('error');
      throw e;
    }
  };

  const refreshHoldingsPrices = async () => {
    if (!user || portfolio.holdings.length === 0) return;
    
    setIsFetching(true);
    setSyncStatus('syncing');
    
    try {
      const nextHoldings = [...portfolio.holdings];
      const updatedAt = new Date().toISOString();
      let updatedCount = 0;

      for (let i = 0; i < nextHoldings.length; i++) {
        const item = nextHoldings[i];
        // 현금성 자산이 아니고 티커가 있는 경우만 조회
        if (item.cls !== "현금" && item.code && item.code !== "CASH") {
          try {
            const isDomestic = /^[0-9]/.test(item.code);
            const response = await fetch(`/api/kis-price?ticker=${item.code}${isDomestic ? "" : "&type=overseas"}`);
            const data = await response.json();
            
            if (response.ok && data.price) {
              nextHoldings[i] = {
                ...item,
                price: data.price,
                amt: (Number(item.qty) || 0) * data.price,
                updatedAt: updatedAt
              };
              updatedCount++;
            }
            // API Rate Limit 고려하여 약간의 지연 추가 (필요시)
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err) {
            console.warn(`${item.etf} 시세 조회 실패:`, err);
          }
        }
      }

      if (updatedCount > 0) {
        const nextRows = reconcileCashHolding(nextHoldings, portfolio.evaluationAmount, updatedAt);
        await saveHoldings(nextRows);
      }
      
      setSyncStatus('supabase');
      return updatedCount;
    } catch (e) {
      console.error("Refresh Prices Error:", e.message);
      setSyncStatus('error');
      throw e;
    } finally {
      setIsFetching(false);
    }
  };

  const updateRetirementPlan = React.useCallback((patch) => {
    setPortfolio(prev => {
      const retirementPlan = normalizeRetirementPlan(
        {
          ...prev.retirementPlan,
          ...patch,
        },
        Number(prev.evaluationAmount) || Number(prev.total) || 0
      );
      const currentStrat = STRATEGIES.find(s => s.id === prev.strategy);
      const targetMap = buildAdjustedTargets(
        currentStrat,
        currentStrat?.type === "momentum" ? momentumTargets : strategyOverlay?.targets || null,
        retirementPlan,
        prev.allocationPolicy
      );
      const nextPortfolio = {
        ...prev,
        retirementPlan,
        holdings: remapHoldingsTargets(prev.holdings, targetMap),
      };
      writeStoredPortfolio(user?.id, nextPortfolio);
      void persistConfigPatch({
        retirement_plan: retirementPlan,
      });
      return nextPortfolio;
    });
  }, [momentumTargets, persistConfigPatch, strategyOverlay, user?.id]);

  const updateAllocationPolicy = React.useCallback((patch) => {
    setPortfolio(prev => {
      const allocationPolicy = normalizeAllocationPolicy({
        ...prev.allocationPolicy,
        ...patch,
        cashDeploymentState: {
          ...(prev.allocationPolicy?.cashDeploymentState || {}),
          ...(patch?.cashDeploymentState || {}),
        },
      });
      const currentStrat = STRATEGIES.find(s => s.id === prev.strategy);
      const targetMap = buildAdjustedTargets(
        currentStrat,
        currentStrat?.type === "momentum" ? momentumTargets : strategyOverlay?.targets || null,
        prev.retirementPlan,
        allocationPolicy
      );
      const nextPortfolio = {
        ...prev,
        allocationPolicy,
        holdings: remapHoldingsTargets(prev.holdings, targetMap),
      };
      writeStoredPortfolio(user?.id, nextPortfolio);
      void persistConfigPatch({
        allocation_policy: allocationPolicy,
      });
      return nextPortfolio;
    });
  }, [momentumTargets, persistConfigPatch, strategyOverlay, user?.id]);

  const updateCashDeploymentState = React.useCallback((cashDeploymentState) => {
    updateAllocationPolicy({ cashDeploymentState });
  }, [updateAllocationPolicy]);

  const saveNotifyEmail = React.useCallback(async (email) => {
    setPortfolio((prev) => ({ ...prev, notifyEmail: email }));
    void persistConfigPatch({ notify_email: email });
  }, [persistConfigPatch]);

  const restorePreviousPortfolio = React.useCallback(() => {
    if (!user) {
      setSyncStatus('auth_required');
      return false;
    }

    const latestStoredPortfolio = refreshRestoreInfo(user.id);
    if (!latestStoredPortfolio) return false;

    setPortfolio(latestStoredPortfolio);
    setIsDemo(false);
    return true;
  }, [refreshRestoreInfo, user]);

  const updateStrategy = async (strategyId) => {
    const newStrat = STRATEGIES.find(it => it.id === strategyId);

    if (!user) {
      let rawTargets = buildDefaultTargets(newStrat);
      let overlay = null;
      if (newStrat?.type === "momentum") {
        rawTargets = await fetchMomentumTargets(strategyId);
      } else {
        const overlayResolved = await resolveOverlayTargets(newStrat, rawTargets);
        rawTargets = overlayResolved.targets;
        overlay = overlayResolved.overlay;
      }
      const newTargetMap = buildAdjustedTargets(
        newStrat,
        rawTargets,
        portfolio.retirementPlan,
        portfolio.allocationPolicy
      );

      setPortfolio(p => ({
        ...p,
        strategy: strategyId,
        // DEMO_PORTFOLIO의 rebalPeriod를 새 전략에 맞게 갱신
        rebalPeriod: newStrat?.rebal || p.rebalPeriod,
        strategyOverlay: normalizeStrategyOverlay(overlay),
        // holdings의 target을 새 전략 기준으로 재매핑
        holdings: remapHoldingsTargets(p.holdings, newTargetMap)
      }));
      setStrategyOverlay(normalizeStrategyOverlay(overlay));
      return;
    }

    try {
      const configPatch = {
        strategy_id: strategyId,
      };
      if (newStrat?.type === "momentum") {
        await persistConfigPatch(configPatch);
        await fetchMomentumTargets(strategyId);
      } else {
        const overlayResolved = await resolveOverlayTargets(newStrat, buildDefaultTargets(newStrat));
        const normalizedOverlay = normalizeStrategyOverlay(overlayResolved.overlay);
        setStrategyOverlay(normalizedOverlay);
        await persistConfigPatch({
          ...configPatch,
          strategy_overlay: normalizedOverlay,
        });
      }
      await loadPortfolio();
    } catch (e) {
      console.error("Strategy Update Error:", e.message);
    }
  };

  const fetchAssetHistory = async () => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from("asset_history")
        .select("*")
        .eq("user_id", user.id)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Fetch History Error:", e.message);
      return [];
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      loadPortfolio();
      return;
    }

    setPortfolio(readPortfolioLike({
      ...DEMO_PORTFOLIO,
      holdings: [],
      transactions: [],
      total: 0,
      principalTotal: 0,
      history: [],
      retirementPlan: {
        ...DEFAULT_RETIREMENT_PLAN,
        currentBalance: 0,
      },
    }));
    setIsDemo(true);
    setRestoreInfo({ hasBackup: false, savedAt: null });
    setSyncStatus('auth_required');
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
      saveEvaluationAmount,
      saveTransactions,
      updateRetirementPlan,
      updateAllocationPolicy,
      updateCashDeploymentState,
      saveNotifyEmail,
      restorePreviousPortfolio,
      restoreInfo,
      syncStatus,
      updateStrategy,
      refreshHoldingsPrices,
      fetchMomentumTargets, // 미리보기용 노출
      degradedMode,
      targetSource,
      fetchAssetHistory,
      transactions: portfolio.transactions || [],
      strategyOverlay,
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export const usePortfolio = () => useContext(PortfolioContext);
