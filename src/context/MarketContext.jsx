import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MarketContext = createContext();

export function MarketProvider({ children }) {
  // 초기값: localStorage에서 불러오거나 없으면 기본값 사용
  const savedVix = JSON.parse(localStorage.getItem('vix_data') || '{"vix": 23.4, "source": "Default", "updatedAt": null}');
  
  const [vix, setVix] = useState(savedVix.vix);
  const [vixSource, setVixSource] = useState(savedVix.source);
  const [vixUpdatedAt, setVixUpdatedAt] = useState(savedVix.updatedAt);
  const [vixLoading, setVixLoading] = useState(false);
  const [krEtfs, setKrEtfs] = useState([]);
  const [tickerMap, setTickerMap] = useState({});

  const fetchVix = async () => {
    setVixLoading(true);
    try {
      // 1. 전용 VIX 브리지 API 시도 (KIS 우선 순위 포함됨)
      const res = await fetch("/api/vix");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && typeof data.vix === "number") {
          const newData = {
            vix: data.vix,
            source: data.source || "Unknown",
            updatedAt: data.updatedAt
          };
          setVix(newData.vix);
          setVixSource(newData.source);
          setVixUpdatedAt(newData.updatedAt);
          localStorage.setItem('vix_data', JSON.stringify(newData));
          setVixLoading(false);
          return;
        }
      }
      
      // 2. 실패 시 야후 파이낸스 백업 시도 (프론트엔드 직접 호출)
      const yahooUrl = encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX');
      const directRes = await fetch(`https://api.allorigins.win/get?url=${yahooUrl}`);
      if (directRes.ok) {
        const wrapper = await directRes.json();
        const d = JSON.parse(wrapper.contents);
        const val = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof val === "number" && val > 0) {
          const newData = {
            vix: val,
            source: "Yahoo",
            updatedAt: new Date().toISOString()
          };
          setVix(newData.vix);
          setVixSource(newData.source);
          setVixUpdatedAt(newData.updatedAt);
          localStorage.setItem('vix_data', JSON.stringify(newData));
        }
      }
    } catch (e) {
      console.warn("VIX 조회 최종 실패:", e.message);
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
    <MarketContext.Provider value={{ vix, vixSource, vixUpdatedAt, vixLoading, fetchVix, krEtfs, tickerMap }}>
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);
