import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calculatePearsonCorr } from '../utils/calculators';
import { buildMetricMeta } from '../services/marketData.js';

const MarketContext = createContext();

const safeParseJSON = (key, defaultVal) => {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : defaultVal;
  } catch (e) {
    console.error(`Error parsing localStorage key "${key}":`, e);
    return defaultVal;
  }
};

const pickSignalValue = (nextValue, fallbackValue) => (nextValue != null ? nextValue : fallbackValue);

export function MarketProvider({ children }) {
  const savedVix = safeParseJSON('vix_data', { vix: null, source: 'Init', updatedAt: null });

  const [vix, setVix] = useState(savedVix.vix);
  const [vixSource, setVixSource] = useState(savedVix.source);
  const [vixUpdatedAt, setVixUpdatedAt] = useState(savedVix.updatedAt);
  const [vixLoading, setVixLoading] = useState(false);
  const [vixError, setVixError] = useState(null);
  const [vixMeta, setVixMeta] = useState(null);
  const [krEtfs, setKrEtfs] = useState([]);
  const [tickerMap, setTickerMap] = useState({});
  const [masterError, setMasterError] = useState(null);

  const savedCorr = safeParseJSON('corr_data', { avg: 0, matrix: {}, updatedAt: null });
  const [avgCorrelation, setAvgCorrelation] = useState(savedCorr.avg || 0);
  const [corrUpdatedAt, setCorrUpdatedAt] = useState(savedCorr.updatedAt);
  const [corrLoading, setCorrLoading] = useState(false);

  const savedSignals = safeParseJSON('market_signals', {});
  const [fearGreed, setFearGreed] = useState(savedSignals.fearGreed || null);
  const [yieldSpread, setYieldSpread] = useState(savedSignals.yieldSpread || null);
  const [unemployment, setUnemployment] = useState(savedSignals.unemployment || null);
  const [creditSpread, setCreditSpread] = useState(savedSignals.creditSpread || null);
  const [capeRatio, setCapeRatio] = useState(savedSignals.cape || null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState(null);
  const [signalMeta, setSignalMeta] = useState(null);

  const fetchVix = async () => {
    setVixLoading(true);
    setVixError(null);
    try {
      const res = await fetch('/api/vix');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && typeof data.vix === 'number') {
          const newData = {
            vix: data.vix,
            source: data.source || 'Unknown',
            updatedAt: data.updatedAt,
          };
          setVix(newData.vix);
          setVixSource(newData.source);
          setVixUpdatedAt(newData.updatedAt);
          setVixMeta(buildMetricMeta({
            source: newData.source,
            updatedAt: newData.updatedAt,
            responseTimeMs: 0,
            missingRatio: 0,
          }));
          localStorage.setItem('vix_data', JSON.stringify(newData));
          setVixLoading(false);
          return;
        }
        setVixError(data.error || 'VIX 데이터 형식이 올바르지 않습니다.');
      } else {
        try {
          const errData = await res.json();
          setVixError(errData.error || `VIX 조회 실패 (Status: ${res.status})`);
        } catch (e) {
          setVixError(`VIX 서버 오류 (Status: ${res.status})`);
        }
      }
    } catch (e) {
      console.warn('VIX 조회 실패:', e.message);
      setVixError(e.message);
    }
    setVixLoading(false);
  };

  const fetchMarketSignals = async () => {
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const res = await fetch('/api/market-signals');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.warning || `?? ??? ?? ?? (Status: ${res.status})`);

      const cachedSignals = safeParseJSON('market_signals', {});
      const fetchedSignals = {
        fearGreed: data.fearGreed?.score != null ? data.fearGreed : null,
        yieldSpread: data.yieldCurve?.spread != null ? data.yieldCurve : null,
        unemployment: data.unemployment?.rate != null ? data.unemployment : null,
        creditSpread: data.creditSpread?.spread != null ? data.creditSpread : null,
        cape: data.cape?.value != null ? data.cape : null,
        compositeScore: data.compositeScore,
        fetchedAt: data.fetchedAt,
      };

      const newSignals = {
        fearGreed: pickSignalValue(fetchedSignals.fearGreed, fearGreed || cachedSignals.fearGreed || null),
        yieldSpread: pickSignalValue(fetchedSignals.yieldSpread, yieldSpread || cachedSignals.yieldSpread || null),
        unemployment: pickSignalValue(fetchedSignals.unemployment, unemployment || cachedSignals.unemployment || null),
        creditSpread: pickSignalValue(fetchedSignals.creditSpread, creditSpread || cachedSignals.creditSpread || null),
        cape: pickSignalValue(fetchedSignals.cape, capeRatio || cachedSignals.cape || null),
        compositeScore: data.compositeScore ?? cachedSignals.compositeScore ?? null,
        fetchedAt: data.fetchedAt || cachedSignals.fetchedAt || new Date().toISOString(),
      };

      setFearGreed(newSignals.fearGreed);
      setYieldSpread(newSignals.yieldSpread);
      setUnemployment(newSignals.unemployment);
      setCreditSpread(newSignals.creditSpread);
      setCapeRatio(newSignals.cape);
      const missingCount = [newSignals.fearGreed, newSignals.yieldSpread, newSignals.unemployment, newSignals.creditSpread, newSignals.cape]
        .filter((item) => !item)
        .length;
      setSignalMeta(buildMetricMeta({
        source: data.degraded ? 'Composite+Fallback' : 'Composite',
        updatedAt: newSignals.fetchedAt,
        responseTimeMs: 0,
        missingRatio: missingCount / 5,
        calcMode: 'estimated',
      }));
      localStorage.setItem('market_signals', JSON.stringify(newSignals));
      if (data.warning) setSignalsError(data.warning);
    } catch (e) {
      console.warn('?? ??? ?? ??:', e.message);
      setSignalsError(e.message);
    } finally {
      setSignalsLoading(false);
    }
  };

  const loadTickerMaster = async () => {
    setMasterError(null);
    try {
      const { data, error } = await supabase
        .from('stock_master')
        .select('ticker, name, asset_class')
        .order('name', { ascending: true });

      if (error) throw error;

      if (data) {
        const formattedData = data.map((item) => ({
          ticker: item.ticker,
          name: item.name,
          assetClass: item.asset_class,
        }));
        setKrEtfs(formattedData);
        const map = {};
        formattedData.forEach((item) => {
          map[item.name] = item;
        });
        setTickerMap(map);
      }
    } catch (err) {
      console.error('Master Data Load Error:', err.message);
      setMasterError(err.message);
    }
  };

  const refreshCorrelation = async (holdings) => {
    if (!holdings || holdings.length < 2) {
      setAvgCorrelation(0);
      return;
    }
    setCorrLoading(true);
    try {
      const requests = holdings.map(async (holding) => {
        const isOverseas = ['미국 주식', '실물자산'].includes(holding.cls);
        const res = await fetch(`/api/kis-history?ticker=${holding.code}&type=${isOverseas ? 'overseas' : 'domestic'}`);
        const data = await res.json();
        if (data.prices && data.prices.length > 10) {
          const returns = [];
          for (let i = 1; i < data.prices.length; i += 1) {
            returns.push((data.prices[i] - data.prices[i - 1]) / data.prices[i - 1]);
          }
          return { etf: holding.etf, returns };
        }
        return null;
      });

      const results = (await Promise.all(requests)).filter((item) => item !== null);
      if (results.length < 2) throw new Error('계산 가능한 종목 데이터가 부족합니다.');

      let totalCorr = 0;
      let count = 0;
      const matrix = {};

      for (let i = 0; i < results.length; i += 1) {
        for (let j = i + 1; j < results.length; j += 1) {
          const rho = calculatePearsonCorr(results[i].returns, results[j].returns);
          totalCorr += rho;
          count += 1;
          matrix[`${results[i].etf}-${results[j].etf}`] = rho;
        }
      }

      const avg = count > 0 ? totalCorr / count : 0;
      const newCorrObj = { avg, matrix, updatedAt: new Date().toISOString() };

      setAvgCorrelation(avg);
      setCorrUpdatedAt(newCorrObj.updatedAt);
      localStorage.setItem('corr_data', JSON.stringify(newCorrObj));
    } catch (e) {
      console.error('Correlation error:', e.message);
    } finally {
      setCorrLoading(false);
    }
  };

  useEffect(() => {
    fetchVix();
    loadTickerMaster();
    fetchMarketSignals();
  }, []);

  return (
    <MarketContext.Provider
      value={{
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
        creditSpread,
        capeRatio,
        signalsLoading,
        signalsError,
        fetchMarketSignals,
        vixMeta,
        signalMeta,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);
