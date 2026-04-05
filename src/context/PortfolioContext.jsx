import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext.jsx';
import { DEMO_PORTFOLIO, STRATEGIES } from '../constants/index.js';

const PortfolioContext = createContext();

export function PortfolioProvider({ children }) {
  const { user } = useAuth();
  const [portfolio, setPortfolio] = useState(DEMO_PORTFOLIO);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [momentumTargets, setMomentumTargets] = useState({});

  const fetchMomentumTargets = async (strategyId) => {
    const s = STRATEGIES.find(it => it.id === strategyId);
    if (!s || s.type !== "momentum") {
      setMomentumTargets({});
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
      if (data.ok && data.targets) {
        setMomentumTargets(data.targets);
        return data.targets;
      }
    } catch (e) {
      console.error("Momentum Fetch Error:", e);
    }
    return {};
  };

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
          etf: it.name,
          code: it.ticker,
          cls: it.asset_class,
          target: target,
          qty: Number(it.quantity) || 0,
          price: Number(it.current_price) || 0,
          amt: Number(it.amount) || 0,
          costAmt: Number(it.cost_amt) || 0,
          cur: 0 
        };
      });

      const total = mappedHoldings.reduce((sum, h) => sum + h.amt, 0);

      setPortfolio({
        ...DEMO_PORTFOLIO,
        strategy: strategyId,
        total: total,
        holdings: mappedHoldings,
        history: (snapshots || []).map(s => ({
          date: s.date,
          total: s.total_amt,
          strategy: s.strategy_id,
          weights: s.weights
        }))
      });

      setIsDemo(false);
    } catch (e) {
      console.error("Load Error:", e.message);
    } finally {
      setIsFetching(false);
    }
  };

  const saveHoldings = async (items) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const saveDate = new Date().toISOString().split("T")[0];
      await supabase.from('holdings').delete().eq('user_id', user.id);
      
      // 필터: 티커가 있고 (수량이 0보다 크거나 평가금액이 0보다 큰 경우)
      // 현금MMF의 경우 수량이 0일 수 있으므로 평가금액 기준을 추가함.
      const insertItems = items
        .filter(it => it.code && (Number(it.qty) > 0 || Number(it.amt) > 0))
        .map(it => ({
          user_id: user.id,
          ticker: it.code,
          name: it.etf || "",
          asset_class: it.cls || "",
          quantity: Number(it.qty) || 0,
          current_price: Number(it.price) || 0,
          cost_amt: Number(it.costAmt) || 0,
          amount: Number(it.amt) || 0,
          updated_at: new Date().toISOString()
        }));

      if (insertItems.length > 0) {
        await supabase.from('holdings').insert(insertItems);
      }

      const total = items.reduce((sum, h) => sum + (Number(h.amt) || 0), 0);
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

      await supabase.from('snapshots').insert({
        user_id: user.id,
        date: saveDate,
        strategy_id: portfolio.strategy,
        total_amt: total,
        weights: weights
      });

      await loadPortfolio();
    } catch (e) {
      console.error("Save Error:", e.message);
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const updateStrategy = async (strategyId) => {
    if (!user) {
      setPortfolio(p => ({ ...p, strategy: strategyId }));
      return;
    }
    try {
      await supabase.from('config').upsert({
        user_id: user.id,
        strategy_id: strategyId,
        updated_at: new Date().toISOString()
      });
      const s = STRATEGIES.find(it => it.id === strategyId);
      if (s?.type === "momentum") await fetchMomentumTargets(strategyId);
      await loadPortfolio();
    } catch (e) {
      console.error("Strategy Update Error:", e.message);
    }
  };

  useEffect(() => {
    if (user) loadPortfolio();
    else {
      setPortfolio(DEMO_PORTFOLIO);
      setIsDemo(true);
    }
  }, [user]);

  return (
    <PortfolioContext.Provider value={{ 
      portfolio, 
      setPortfolio,
      isFetching, 
      isSaving, 
      isDemo, 
      loadPortfolio, 
      saveHoldings, 
      updateStrategy 
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export const usePortfolio = () => useContext(PortfolioContext);
