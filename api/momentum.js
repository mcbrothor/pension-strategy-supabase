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

/**
 * LAA 전략 타겟 산출 — 2단계 듀얼 조건 확장
 * 
 * 원래 LAA 조건 (Keller & Keuning, 2016):
 *   조건1: 미국주식 현재가 > 200일 이동평균
 *   조건2: 미국 실업률 < 12개월 평균 실업률
 *   → 둘 다 충족 → 공격자산 25%
 *   → 하나라도 미충족 → 방어자산 25%
 * 
 * 폴백: 200DMA 또는 실업률 조회 실패 시 기존 12M 모멘텀으로 자동 폴백
 */
async function computeLAATargets(priceSeries, composition) {
  const targets = {};
  const fixed = composition.filter(c => c.role === "fixed");
  const attack = composition.find(c => c.role === "attack");
  const defensive = composition.find(c => c.role === "defensive");
  
  // 고정 비중 적용 (합계 75%)
  fixed.forEach(c => targets[c.cls] = c.w || 0);

  const momentumWeight = 25;
  const indicatorCls = "미국주식";

  // --- 듀얼 조건 시도 ---
  let dualConditionResult = null; // true(공격), false(방어), null(폴백)
  let conditionSource = "fallback"; // 어떤 조건으로 판단했나

  try {
    // 조건1: 200DMA — Yahoo Finance 일봉으로 현재가 vs 200일 평균 비교
    const dailyCloses = await fetchYahooDailyCloses("SPY", 220);
    
    // 조건2: 실업률 — FRED UNRATE
    const unempData = await fetchFREDUnemployment();

    if (dailyCloses.length >= 200 && unempData) {
      // 둘 다 성공: 듀얼 조건 판단
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      const sma200 = dailyCloses.slice(-200).reduce((s, v) => s + v, 0) / 200;
      const isAbove200DMA = currentPrice > sma200;
      const isUnempBelow = unempData.isBelow;

      dualConditionResult = isAbove200DMA && isUnempBelow;
      conditionSource = "dual";
      console.log(`LAA Dual: Price=${currentPrice.toFixed(2)}, SMA200=${sma200.toFixed(2)}, Above=${isAbove200DMA}, Unemp=${unempData.rate}%, Avg12M=${unempData.avg12m.toFixed(2)}%, Below=${isUnempBelow} → ${dualConditionResult ? "ATTACK" : "DEFENSIVE"}`);
    } else if (dailyCloses.length >= 200) {
      // 200DMA만 성공: 200DMA 단독 판단
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      const sma200 = dailyCloses.slice(-200).reduce((s, v) => s + v, 0) / 200;
      dualConditionResult = currentPrice > sma200;
      conditionSource = "200dma_only";
      console.log(`LAA 200DMA only: ${currentPrice.toFixed(2)} vs ${sma200.toFixed(2)} → ${dualConditionResult ? "ATTACK" : "DEFENSIVE"}`);
    }
  } catch (e) {
    console.warn("LAA dual condition fetch error, falling back to 12M momentum:", e.message);
  }

  // 폴백: 듀얼 조건 실패 시 기존 12M 모멘텀
  if (dualConditionResult === null) {
    const ret = retPctFromCloses(priceSeries[indicatorCls]?.monthlyCloses || [], 12);
    dualConditionResult = ret != null && ret >= 0;
    conditionSource = "12m_momentum";
    console.log(`LAA fallback to 12M momentum: ret=${ret?.toFixed(2)}% → ${dualConditionResult ? "ATTACK" : "DEFENSIVE"}`);
  }

  // 결과 적용
  if (dualConditionResult) {
    if (attack) targets[attack.cls] = (targets[attack.cls] || 0) + momentumWeight;
  } else {
    const safeCls = defensive?.cls || "현금MMF";
    targets[safeCls] = (targets[safeCls] || 0) + momentumWeight;
  }

  // 타겟 결과에 조건 출처 추가 (UI에서 표시용)
  targets._conditionSource = conditionSource;
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

    let targets = null;
    if (strategyId === "gtaa5") targets = computeGTAA5Targets(priceSeries, composition);
    else if (strategyId === "dual_momentum") targets = computeDualMomentumTargets(priceSeries, composition);
    else if (strategyId === "laa") targets = await computeLAATargets(priceSeries, composition);
    else if (strategyId === "daa") targets = computeDAATargets(priceSeries, composition);

    if (!targets) throw new Error("Calculation failed");

    const result = { ok: true, strategyId, targets, mode: "role_based_momentum", updatedAt: new Date().toISOString() };
    momentumCache[cacheKey] = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}
