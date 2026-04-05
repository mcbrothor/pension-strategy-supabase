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

async function fetchStooqMonthlyCloses(stooqTicker, monthsNeeded) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqTicker)}&i=m`;
  try {
    const text = await fetch(url).then(r => r.text());
    const lines = String(text).trim().split("\n");
    lines.shift();
    const closes = [];
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 5) continue;
      const close = Number(parts[4]);
      if (Number.isFinite(close)) closes.push(close);
    }
    return closes.slice(-monthsNeeded);
  } catch (e) { return []; }
}

function retPctFromCloses(closes, monthsBack) {
  const n = closes.length;
  const i0 = n - monthsBack - 1, i1 = n - 1;
  if (i0 < 0 || i1 < 0) return null;
  const c0 = Number(closes[i0]), c1 = Number(closes[i1]);
  if (!c0 || isNaN(c1)) return null;
  return ((c1 / c0) - 1) * 100;
}

function ma(closes, window) {
  const n = closes.length;
  if (n < window) return null;
  let s = 0;
  for (let i = n - window; i < n; i++) s += Number(closes[i]);
  return s / window;
}

// --- Role-based Computations ---

function computeGTAA5Targets(priceSeries, composition) {
  const targets = {};
  const dynamics = composition.filter(c => c.role === "dynamic");
  let allocated = 0;

  for (const c of dynamics) {
    const closes = priceSeries[c.cls]?.monthlyCloses || [];
    if (closes.length < 11) { targets[c.cls] = 0; continue; }
    const last = closes[closes.length - 1];
    const m10 = ma(closes, 10);
    if (last >= m10) {
      targets[c.cls] = c.w || 20;
      allocated += targets[c.cls];
    } else {
      targets[c.cls] = 0;
    }
  }

  const cashCls = composition.find(c => c.cls === "현금MMF")?.cls || "현금MMF";
  targets[cashCls] = (targets[cashCls] || 0) + Math.max(0, 100 - allocated);
  return targets;
}

function computeDualMomentumTargets(priceSeries, composition) {
  const indicator = composition.find(c => c.role === "indicator");
  const relTargets = composition.filter(c => c.role === "relative_target");
  const defensive = composition.find(c => c.role === "defensive");
  const cashCls = "현금MMF";

  const usRet = retPctFromCloses(priceSeries[indicator?.cls]?.monthlyCloses || [], 12);
  const cashRet = retPctFromCloses(priceSeries[cashCls]?.monthlyCloses || [], 12);
  
  const targets = {};
  composition.forEach(c => targets[c.cls] = 0);

  // 절대 모멘텀: 현금보다 못하면 방어 자산
  if (usRet == null || cashRet == null || usRet <= cashRet) {
    if (defensive) targets[defensive.cls] = 100;
    else targets[cashCls] = 100;
    return targets;
  }

  // 상대 모멘텀: 지표 vs 상대 타겟들 중 최고 수익률
  let bestCls = indicator.cls;
  let bestRet = usRet;

  for (const rt of relTargets) {
    const r = retPctFromCloses(priceSeries[rt.cls]?.monthlyCloses || [], 12);
    if (r != null && r > bestRet) {
      bestRet = r;
      bestCls = rt.cls;
    }
  }

  targets[bestCls] = 100;
  return targets;
}

function computeLAATargets(priceSeries, composition) {
  const targets = {};
  const fixed = composition.filter(c => c.role === "fixed");
  const attack = composition.find(c => c.role === "attack");
  const defensive = composition.find(c => c.role === "defensive");
  
  // 고정 비중 적용 (합계 75%)
  fixed.forEach(c => targets[c.cls] = c.w || 0);

  // 모멘텀 체크 (미국주식 지표 사용)
  const indicatorCls = "미국주식"; 
  const ret = retPctFromCloses(priceSeries[indicatorCls]?.monthlyCloses || [], 12);

  const momentumWeight = 25;
  if (ret != null && ret >= 0) {
    if (attack) targets[attack.cls] = (targets[attack.cls] || 0) + momentumWeight;
  } else {
    const safeCls = defensive?.cls || "현금MMF";
    targets[safeCls] = (targets[safeCls] || 0) + momentumWeight;
  }
  return targets;
}

function computeDAATargets(priceSeries, composition) {
  const score = (closes) => {
    const r1 = retPctFromCloses(closes, 1), r3 = retPctFromCloses(closes, 3), r6 = retPctFromCloses(closes, 6), r12 = retPctFromCloses(closes, 12);
    if ([r1, r3, r6, r12].some(v => v == null)) return null;
    return 12 * r1 + 4 * r3 + 2 * r6 + 1 * r12;
  };

  const canaries = composition.filter(c => c.role === "canary");
  let posCount = 0;
  for (const c of canaries) {
    const s = score(priceSeries[c.cls]?.monthlyCloses || []);
    if (s != null && s > 0) posCount++;
  }

  const targets = {};
  composition.forEach(c => targets[c.cls] = 0);

  const attackGroup = composition.filter(c => c.role === "attack");
  const defensiveGroup = composition.filter(c => c.role === "defensive");

  let attackW = 0, defensiveW = 0;
  if (posCount === 2) attackW = 100;
  else if (posCount === 1) { attackW = 50; defensiveW = 50; }
  else { defensiveW = 100; }

  // 공격군 배분
  if (attackW > 0) {
    const totalRatio = attackGroup.reduce((sum, c) => sum + (c.w_ratio || 1), 0);
    attackGroup.forEach(c => {
      targets[c.cls] = Math.round((c.w_ratio || 1) / totalRatio * attackW * 10) / 10;
    });
  }

  // 방어군 배분 (보통 하나임)
  if (defensiveW > 0) {
    const totalRatio = defensiveGroup.reduce((sum, c) => sum + (c.w_ratio || 1), 0);
    defensiveGroup.forEach(c => {
      targets[c.cls] = (targets[c.cls] || 0) + Math.round((c.w_ratio || 1) / totalRatio * defensiveW * 10) / 10;
    });
  }

  return targets;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const momentumCache = globalThis.__MOMENTUM_CACHE__ || (globalThis.__MOMENTUM_CACHE__ = {});

module.exports = async function handler(req, res) {
  if (req?.method === "OPTIONS") { res.writeHead(204, corsHeaders()); return res.end(); }
  if (req?.method !== "POST") { 
    res.writeHead(405, { ...corsHeaders(), "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "POST required" }));
  }

  try {
    const body = await readJsonBody(req);
    const { strategyId, composition } = body;
    const asOf = body?.asOf ? String(body.asOf) : new Date().toISOString();
    const cacheKey = `strat:${strategyId}:month:${asOf.slice(0, 7)}`;

    if (!strategyId || !composition) {
      res.writeHead(400, { ...corsHeaders(), "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "strategyId and composition required" }));
    }

    const hit = momentumCache[cacheKey];
    if (hit && hit.expiresAt > Date.now()) {
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
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
      } catch (e) { console.warn(`KIS fail for ${cls}:`, e.message); }
      
      if (!closes || closes.length === 0) {
        const stooqTicker = STOOQ_MAP[cls];
        if (stooqTicker) closes = await fetchStooqMonthlyCloses(stooqTicker, 13);
      }
      priceSeries[cls] = { monthlyCloses: closes };
    }

    let targets = null;
    if (strategyId === "gtaa5") targets = computeGTAA5Targets(priceSeries, composition);
    else if (strategyId === "dual_momentum") targets = computeDualMomentumTargets(priceSeries, composition);
    else if (strategyId === "laa") targets = computeLAATargets(priceSeries, composition);
    else if (strategyId === "daa") targets = computeDAATargets(priceSeries, composition);

    if (!targets) throw new Error("Calculation failed");

    const result = { ok: true, strategyId, targets, mode: "role_based_momentum", updatedAt: new Date().toISOString() };
    momentumCache[cacheKey] = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    
    res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
};
