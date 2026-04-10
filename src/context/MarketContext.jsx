import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calculatePearsonCorr } from '../utils/calculators';

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

export function MarketProvider({ children }) {
  const savedVix = safeParseJSON('vix_data', { vix: null, source: 'Init', updatedAt: null });

  const [vix, setVix] = useState(savedVix.vix);
  const [vixSource, setVixSource] = useState(savedVix.source);
  const [vixUpdatedAt, setVixUpdatedAt] = useState(savedVix.updatedAt);
  const [vixLoading, setVixLoading] = useState(false);
  const [vixError, setVixError] = useState(null);
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
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState(null);

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
      if (!res.ok) throw new Error(`시장 시그널 조회 실패 (Status: ${res.status})`);
      const data = await res.json();

      const newSignals = {
        fearGreed: data.fearGreed?.score != null ? data.fearGreed : null,
        yieldSpread: data.yieldCurve?.spread != null ? data.yieldCurve : null,
        unemployment: data.unemployment?.rate != null ? data.unemployment : null,
        compositeScore: data.compositeScore,
        fetchedAt: data.fetchedAt,
      };

      setFearGreed(newSignals.fearGreed);
      setYieldSpread(newSignals.yieldSpread);
      setUnemployment(newSignals.unemployment);
      localStorage.setItem('market_signals', JSON.stringify(newSignals));
    } catch (e) {
      console.warn('시장 시그널 조회 실패:', e.message);
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
        const isOverseas = ['미국주식', '해외채권', '원자재', '금'].includes(holding.cls);
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
        signalsLoading,
        signalsError,
        fetchMarketSignals,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);
