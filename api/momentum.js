/**
 * Serverless Endpoint: /api/momentum
 *
 * 목적:
 * - 지표(Canary), 공격(Attack), 방어(Defensive), 고정(Fixed) 역할을 기반으로
 *   자산군별 동적 비중을 산출합니다.
 */

const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real" 
  ? "https://openapi.koreainvestment.com:9443" 
  : "https://openapivts.koreainvestment.com:29443";

let cachedToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

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
  if (tokenPromise) return tokenPromise;
  
  tokenPromise = (async () => {
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
    } finally {
      tokenPromise = null;
    }
    return null;
  })();
  return tokenPromise;
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

const YAHOO_TICKER_MAP = {
  "미국주식": "SPY",
  "선진국주식": "EFA",
  "미국중기채권": "IEF",
  "미국장기채권": "TLT",
  "원자재": "DBC",
  "부동산리츠": "VNQ",
  "금": "GLD",
  "신흥국주식": "EEM",
  "현금MMF": "BIL",
};

async function fetchKISMonthlyCloses(tickerInfo, monthsNeeded) {
  const token = await getAccessToken();
  if (!token) throw new Error("KIS Token failure");
  const { ticker, excd } = tickerInfo;
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
  if (!data?.output2) throw new Error(data?.msg1 || "No output2");
  return data.output2.slice(0, monthsNeeded).map(d => Number(d.last)).reverse();
}

/**
 * Yahoo Finance Fallback — 월봉 (기존 전략용)
 */
async function fetchYahooMonthlyCloses(ticker, monthsNeeded) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&range=2y`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const d = await res.json();
    const result = d?.chart?.result?.[0];
    if (!result) return [];
    const adjCloses = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
    return adjCloses.filter(v => v != null).slice(-monthsNeeded);
  } catch (e) {
    console.error(`Yahoo monthly fetch error for ${ticker}:`, e.message);
    return [];
  }
}

/**
 * Yahoo Finance 일봉 200일 종가 조회 (LAA 200DMA용)
 * 왜 Yahoo인가: KIS 일봉 API는 100건/요청 제한이라 200일치 조회에 2회 필요. Yahoo는 1회로 충분.
 */
async function fetchYahooDailyCloses(ticker, days = 220) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    const d = await res.json();
    const result = d?.chart?.result?.[0];
    if (!result) return [];
    const closes = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
    return closes.filter(v => v != null).slice(-days);
  } catch (e) {
    console.error(`Yahoo daily fetch error for ${ticker}:`, e.message);
    return [];
  }
}

/**
 * FRED 미국 실업률(UNRATE) 조회 (LAA 듀얼 조건용)
 */
async function fetchFREDUnemployment() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=UNRATE&api_key=${apiKey}&file_type=json&sort_order=desc&limit=13`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const valid = (data.observations || []).filter(o => o.value !== ".").map(o => parseFloat(o.value));
    if (valid.length < 2) return null;
    const current = valid[0];
    const avg12m = valid.length >= 12
      ? valid.slice(0, 12).reduce((s, v) => s + v, 0) / 12
      : current;
    return { rate: current, avg12m, isBelow: current < avg12m };
  } catch (e) {
    console.error("FRED UNRATE fetch error:", e.message);
    return null;
  }
}

// --- Calculation replaced by momentumEngine.js on the client ---

const CACHE_TTL_MS = 30 * 60 * 1000;
const momentumCache = globalThis.__MOMENTUM_CACHE__ || (globalThis.__MOMENTUM_CACHE__ = {});

export default async function handler(req, res) {
  if (req?.method === "OPTIONS") { 
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204); 
    return res.end(); 
  }
  
  if (req?.method !== "POST") { 
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "POST required" }));
  }

  try {
    const body = await readJsonBody(req);
    const { strategyId, composition } = body;
    const asOf = body?.asOf ? String(body.asOf) : new Date().toISOString();
    const cacheKey = `strat:${strategyId}:month:${asOf.slice(0, 7)}`;

    if (!strategyId || !composition) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "strategyId and composition required" }));
    }

    const hit = momentumCache[cacheKey];
    if (hit && hit.expiresAt > Date.now()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(hit.value));
    }

    // 필요한 모든 자산군의 시세 수집 (Indicator인 미국주식, 현금MMF 포함)
    const neededCls = Array.from(new Set([
      ...composition.map(c => c.cls),
      "미국주식", "현금MMF"
    ]));

    const priceSeries = {};
    for (const cls of neededCls) {
      let closes = [];
      try {
        const kisInfo = KIS_TICKER_MAP[cls];
        if (kisInfo) closes = await fetchKISMonthlyCloses(kisInfo, 13);
      } catch (e) { 
        console.warn(`KIS fail for ${cls}:`, e.message); 
      }
      
      // KIS 실패 시 Yahoo Finance 폴백
      if (!closes || closes.length === 0) {
        const yahooTicker = YAHOO_TICKER_MAP[cls];
        if (yahooTicker) {
           closes = await fetchYahooMonthlyCloses(yahooTicker, 13);
        }
      }
      priceSeries[cls] = { monthlyCloses: closes };
    }

    let dailyCloses = null;
    let unempData = null;

    if (strategyId === "laa") {
      try {
        dailyCloses = await fetchYahooDailyCloses("SPY", 220);
        unempData = await fetchFREDUnemployment();
      } catch (e) {
        console.warn("LAA dual condition fetch error:", e.message);
      }
    }

    const dataPayload = { priceSeries, dailyCloses, unempData };
    const result = { ok: true, strategyId, data: dataPayload, mode: "role_based_momentum", updatedAt: new Date().toISOString() };

    momentumCache[cacheKey] = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}
