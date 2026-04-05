/**
 * Serverless Endpoint: /api/momentum
 *
 * 목적:
 * - KIS(한국투자증권) API를 주 데이터 소스로 사용하여 모멘텀 전략의 동적 비중을 산출합니다.
 * - KIS API 호출 실패 시 Stooq API를 폴백(Fallback)으로 사용하여 안정성을 확보합니다.
 */

const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real" 
  ? "https://openapi.koreainvestment.com:9443" 
  : "https://openapivts.koreainvestment.com:29443";

let cachedToken = null;
let tokenExpiry = 0;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += String(chunk)));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } 
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;
  try {
    const res = await fetch(`${API_BASE_URL}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET
      })
    });
    const data = await res.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = now + (data.expires_in - 60) * 1000;
      return cachedToken;
    }
  } catch (e) {
    console.error("KIS Token Error:", e);
  }
  return null;
}

const KIS_TICKER_MAP = {
  "미국주식": { ticker: "SPY", excd: "NYS" },
  "선진국주식": { ticker: "EFA", excd: "NYS" },
  "미국중기채권": { ticker: "IEF", excd: "NAS" },
  "미국장기채권": { ticker: "TLT", excd: "NAS" },
  "원자재": { ticker: "DBC", excd: "NYS" },
  "부동산리츠": { ticker: "VNQ", excd: "NYS" },
  "금": { ticker: "GLD", excd: "NYS" },
  "신흥국주식": { ticker: "EEM", excd: "NYS" },
  "현금MMF": { ticker: "BIL", excd: "NYS" },
};

const STOOQ_MAP = {
  "미국주식": "SPY.US",
  "선진국주식": "EFA.US",
  "미국중기채권": "IEF.US",
  "미국장기채권": "TLT.US",
  "원자재": "DBC.US",
  "부동산리츠": "VNQ.US",
  "금": "GLD.US",
  "신흥국주식": "EEM.US",
  "현금MMF": "BIL.US",
};

async function fetchKISMonthlyCloses(tickerInfo, monthsNeeded) {
  const token = await getAccessToken();
  if (!token) throw new Error("KIS Token failure");

  const { ticker, excd } = tickerInfo;
  // HHDFS76410100 (해외주식 기간별 시세) - GUBN=2 (월간)
  const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-daily-chartprice?AUTH=""&EXCD=${excd}&SYMB=${ticker}&GUBN=2&BYMD=""&MODP=1`;
  
  const res = await fetch(url, {
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      "appkey": process.env.KIS_APP_KEY,
      "appsecret": process.env.KIS_APP_SECRET,
      "tr_id": "HHDFS76410100"
    }
  });

  const data = await res.json();
  if (!data?.output2) {
    throw new Error(data?.msg1 || "No output2 from KIS");
  }
  return data.output2.slice(0, monthsNeeded).map(d => Number(d.last)).reverse();
}

async function fetchStooqMonthlyCloses(stooqTicker, monthsNeeded) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqTicker)}&i=m`;
  try {
    const text = await fetch(url).then(r => r.text());
    const lines = String(text).trim().split("\n");
    lines.shift(); // header
    const closes = [];
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 5) continue;
      const close = Number(parts[4]);
      if (Number.isFinite(close)) closes.push(close);
    }
    return closes.slice(-monthsNeeded);
  } catch (e) {
    console.error("Stooq Fetch Error:", e);
    return [];
  }
}

// --- Momentum Helpers ---
function retPctFromCloses(closes, monthsBack) {
  const n = closes.length;
  const idx0 = n - monthsBack - 1;
  const idx1 = n - 1;
  if (idx0 < 0 || idx1 < 0) return null;
  const c0 = Number(closes[idx0]);
  const c1 = Number(closes[idx1]);
  if (!Number.isFinite(c0) || !Number.isFinite(c1) || c0 === 0) return null;
  return ((c1 / c0) - 1) * 100;
}

function ma(closes, window) {
  const n = closes.length;
  if (n < window) return null;
  let s = 0;
  for (let i = n - window; i < n; i++) s += Number(closes[i]);
  return s / window;
}

// --- Strategy Computations ---
function computeGTAA5Targets(priceSeries) {
  const assetSet = [
    { cls: "미국주식", w: 20 },
    { cls: "선진국주식", w: 20 },
    { cls: "미국중기채권", w: 20 },
    { cls: "원자재", w: 20 },
    { cls: "부동산리츠", w: 20 },
  ];
  const cashCls = "현금MMF";
  const selected = [];
  for (const a of assetSet) {
    const series = priceSeries?.[a.cls]?.monthlyCloses;
    if (!series || series.length < 11) continue;
    const last = series[series.length - 1];
    const avg10 = ma(series, 10);
    if (last >= avg10) selected.push(a);
  }
  const baseSelected = selected.reduce((s, x) => s + x.w, 0);
  const targets = {};
  for (const a of assetSet) targets[a.cls] = selected.some(s => s.cls === a.cls) ? a.w : 0;
  targets[cashCls] = Math.max(0, 100 - baseSelected);
  return targets;
}

function computeDualMomentumTargets(priceSeries) {
  const us = retPctFromCloses(priceSeries?.["미국주식"]?.monthlyCloses, 12);
  const dev = retPctFromCloses(priceSeries?.["선진국주식"]?.monthlyCloses, 12);
  const cash = retPctFromCloses(priceSeries?.["현금MMF"]?.monthlyCloses, 12);
  const longBond = retPctFromCloses(priceSeries?.["미국장기채권"]?.monthlyCloses, 12);
  if ([us, dev, cash, longBond].some(v => v == null)) return null;
  if (us <= cash) return { "미국장기채권": 100 };
  return us >= dev ? { "미국주식": 100 } : { "선진국주식": 100 };
}

function computeLAATargets(priceSeries) {
  const spRet12m = retPctFromCloses(priceSeries?.["미국주식"]?.monthlyCloses, 12);
  if (spRet12m == null) return null;
  if (spRet12m < 0) return { "국내주식": 25, "금": 25, "미국중기채권": 25, "현금MMF": 25 };
  return { "국내주식": 25, "금": 25, "미국중기채권": 25, "미국주식": 25 };
}

function computeDAATargets(priceSeries) {
  const score = (closes) => {
    const r1 = retPctFromCloses(closes, 1), r3 = retPctFromCloses(closes, 3), r6 = retPctFromCloses(closes, 6), r12 = retPctFromCloses(closes, 12);
    if ([r1, r3, r6, r12].some(v => v == null)) return null;
    return 12 * r1 + 4 * r3 + 2 * r6 + 1 * r12;
  };
  const emerg = score(priceSeries?.["신흥국주식"]?.monthlyCloses || []);
  const long = score(priceSeries?.["미국장기채권"]?.monthlyCloses || []);
  if (emerg == null || long == null) return null;
  if (emerg > 0 && long > 0) return { "미국주식": 70, "금": 30 };
  if (emerg > 0 || long > 0) return { "미국주식": 35, "금": 15, "현금MMF": 50 };
  return { "현금MMF": 100 };
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const momentumCache = globalThis.__MOMENTUM_CACHE__ || (globalThis.__MOMENTUM_CACHE__ = {});

module.exports = async function handler(req, res) {
  if (req?.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  if (req?.method !== "POST") {
    res.writeHead(405, { ...corsHeaders(), "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "POST required" }));
  }

  try {
    const body = await readJsonBody(req);
    const strategyId = body?.strategyId || "";
    const asOf = body?.asOf ? String(body.asOf) : new Date().toISOString();
    const cacheKey = `strategy:${strategyId}|asOf:${asOf.slice(0, 7)}`;

    if (!strategyId) {
      res.writeHead(400, { ...corsHeaders(), "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "strategyId required" }));
    }

    const hit = momentumCache[cacheKey];
    if (hit && hit.expiresAt > Date.now()) {
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
      return res.end(JSON.stringify(hit.value));
    }

    const momentumStrategies = ["gtaa5", "dual_momentum", "laa", "daa"];
    const priceSeries = {};
    if (momentumStrategies.includes(strategyId)) {
      let needed = [];
      let msNeeded = 13;
      if (strategyId === "gtaa5") { needed = ["미국주식", "선진국주식", "미국중기채권", "원자재", "부동산리츠", "현금MMF"]; msNeeded = 11; }
      else if (strategyId === "dual_momentum") { needed = ["미국주식", "선진국주식", "미국장기채권", "현금MMF"]; }
      else if (strategyId === "laa") { needed = ["미국주식"]; }
      else if (strategyId === "daa") { needed = ["신흥국주식", "미국장기채권"]; }

      for (const cls of needed) {
        let closes = [];
        try {
          const kisInfo = KIS_TICKER_MAP[cls];
          if (kisInfo) closes = await fetchKISMonthlyCloses(kisInfo, msNeeded);
        } catch (e) {
          console.warn(`KIS Fetch Error for ${cls}, falling back to Stooq:`, e.message);
        }
        if (!closes || closes.length === 0) {
          const stooqTicker = STOOQ_MAP[cls];
          if (stooqTicker) closes = await fetchStooqMonthlyCloses(stooqTicker, msNeeded);
        }
        priceSeries[cls] = { monthlyCloses: closes };
      }
    }

    let targets = null;
    let mode = "kis_dynamic_momentum";
    if (strategyId === "gtaa5") targets = computeGTAA5Targets(priceSeries);
    else if (strategyId === "dual_momentum") targets = computeDualMomentumTargets(priceSeries);
    else if (strategyId === "laa") targets = computeLAATargets(priceSeries);
    else if (strategyId === "daa") targets = computeDAATargets(priceSeries);

    if (!targets) {
      res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "Calculation failed" }));
    }

    const result = { ok: true, strategyId, targets, mode, updatedAt: new Date().toISOString() };
    momentumCache[cacheKey] = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify(result));

  } catch (e) {
    console.error("Momentum Error:", e.message);
    res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
};
