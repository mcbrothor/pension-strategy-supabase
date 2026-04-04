import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MarketContext = createContext();

export function MarketProvider({ children }) {
  const [vix, setVix] = useState(null);
  const [vixLoading, setVixLoading] = useState(false);
  const [krEtfs, setKrEtfs] = useState([]);
  const [tickerMap, setTickerMap] = useState({});

  const fetchVix = async () => {
    setVixLoading(true);
    try {
      // 1. 전용 VIX 엔드포인트 시도 (/api/vix)
      const res = await fetch("/api/vix");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && typeof data.vix === "number") {
          setVix(data.vix);
          setVixLoading(false);
          return;
        }
      }
      
      // 2. 실패 시 야후 파이낸스 백업 시도
      const yahooUrl = encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX');
      const directRes = await fetch(`https://api.allorigins.win/get?url=${yahooUrl}`);
      if (directRes.ok) {
        const wrapper = await directRes.json();
        const d = JSON.parse(wrapper.contents);
        const val = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof val === "number" && val > 0) setVix(val);
      }
    } catch (e) {
      console.warn("VIX 조회 실패 (종합):", e.message);
      // 최종 실패 시 기본값이라도 설정 (과거 데이터)
      if (!vix) setVix(23.4);
    }
    setVixLoading(false);
  };

  const loadTickerMaster = async () => {
    try {
      const { data, error } = await supabase
        .from("stock_master")
        .select("ticker, name, asset_class")
        .order("name", { ascending: true });
      
      if (error) throw error;
      
      if (data) {
        const formattedData = data.map(d => ({
          ticker: d.ticker,
          name: d.name,
          assetClass: d.asset_class
        }));
        setKrEtfs(formattedData);
        const map = {};
        formattedData.forEach(e => { map[e.name] = e; });
        setTickerMap(map);
      }
    } catch (err) {
      console.error("Master Data Load Error:", err.message);
    }
  };

  useEffect(() => {
    fetchVix();
    loadTickerMaster();
  }, []);

  return (
    <MarketContext.Provider value={{ vix, vixLoading, fetchVix, krEtfs, tickerMap }}>
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);
