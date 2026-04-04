import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MarketContext = createContext();

export function MarketProvider({ children }) {
  const [vix, setVix] = useState(23.4);
  const [vixLoading, setVixLoading] = useState(false);
  const [krEtfs, setKrEtfs] = useState([]);
  const [tickerMap, setTickerMap] = useState({});

  const fetchVix = async () => {
    setVixLoading(true);
    try {
      const res = await fetch("/api/kis-price?ticker=VIX&type=overseas&excd=NYS");
      if (res.ok) {
        const text = await res.text();
        if (!text.trim().startsWith("//") && !text.trim().startsWith("<")) {
          const data = JSON.parse(text);
          if (typeof data.price === "number" && data.price > 0) {
            setVix(data.price);
            setVixLoading(false);
            return;
          }
        }
      }
      
      const yahooUrl = encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX');
      const directRes = await fetch(`https://api.allorigins.win/get?url=${yahooUrl}`);
      if (directRes.ok) {
        const wrapper = await directRes.json();
        const d = JSON.parse(wrapper.contents);
        const val = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof val === "number" && val > 0) setVix(val);
      }
    } catch (e) {
      console.warn("VIX 조회 오류:", e.message);
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
