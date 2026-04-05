import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MarketContext = createContext();

export function MarketProvider({ children }) {
  // 초기값: localStorage에서 불러오거나 없으면 null 사용
  const savedVix = JSON.parse(localStorage.getItem('vix_data') || '{"vix": null, "source": "Init", "updatedAt": null}');
  
  const [vix, setVix] = useState(savedVix.vix);
  const [vixSource, setVixSource] = useState(savedVix.source);
  const [vixUpdatedAt, setVixUpdatedAt] = useState(savedVix.updatedAt);
  const [vixLoading, setVixLoading] = useState(false);
  const [vixError, setVixError] = useState(null);
  const [krEtfs, setKrEtfs] = useState([]);
  const [tickerMap, setTickerMap] = useState({});
  const [masterError, setMasterError] = useState(null);

  const fetchVix = async () => {
    setVixLoading(true);
    setVixError(null);
    try {
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
        } else {
          setVixError(data.error || "VIX 데이터 형식이 올바르지 않습니다.");
        }
      } else {
        setVixError(`VIX 조회 실패 (Status: ${res.status})`);
      }
    } catch (e) {
      console.warn("VIX 조회 실패:", e.message);
      setVixError(e.message);
    }
    setVixLoading(false);
  };

  const loadTickerMaster = async () => {
    setMasterError(null);
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
      setMasterError(err.message);
    }
  };

  useEffect(() => {
    fetchVix();
    loadTickerMaster();
  }, []);

  return (
    <MarketContext.Provider value={{ 
      vix, vixSource, vixUpdatedAt, vixLoading, vixError, 
      fetchVix, krEtfs, tickerMap, masterError 
    }}>
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);
