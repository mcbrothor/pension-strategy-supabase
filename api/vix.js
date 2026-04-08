const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real" 
  ? "https://openapi.koreainvestment.com:9443" 
  : "https://openapivts.koreainvestment.com:29443";

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = globalThis.__VIX_CACHE__ || (globalThis.__VIX_CACHE__ = {});

// 내부 토큰 관리 (utils/kis-auth.js가 없을 경우를 대비한 내장형)
let cachedToken = null;
let tokenExpiry = 0;

async function getInternalToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

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
  throw new Error(data.msg1 || "Failed to get KIS token");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  const now = Date.now();
  if (cache.vix && cache.vix.expiresAt > now) {
    return res.status(200).json({ ok: true, ...cache.vix });
  }

  let result = null;
  let errors = [];

  // 1. KIS API (Priority)
  try {
    const token = await getInternalToken();
    
    // VIX는 KIS에서 '지수'로 분류됨. 전용 엔드포인트 시도.
    // TR_ID: HDFS00000300 (해외지수 현재가)
    const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-price?AUTH=""&EXCD=NYS&SYMB=VIX`;
    
    const fetchVix = async (trId) => {
      const r = await fetch(url, {
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
          "appkey": process.env.KIS_APP_KEY,
          "appsecret": process.env.KIS_APP_SECRET,
          "tr_id": trId
        },
        signal: AbortSignal.timeout(5000)
      });
      return await r.json();
    };

    // 지수 TR 시도
    let body = await fetchVix("HDFS00000300");
    if (body.output && body.output.last) {
      result = { vix: Number(body.output.last), source: "KIS" };
    } else {
      // 주식 TR 시도 (일부 환경에서 종목처럼 조회되는 경우 대비)
      body = await fetchVix("HHDFS00000300");
      if (body.output && body.output.last) {
        result = { vix: Number(body.output.last), source: "KIS(Fallback)" };
      } else {
        errors.push(`KIS failure: ${body.msg1 || "No output"}`);
      }
    }
  } catch (e) {
    errors.push(`KIS exception: ${e.message}`);
  }

  // 2. Yahoo Finance Fallback
  if (!result) {
    try {
      const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d';
      const yRes = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1" },
        signal: AbortSignal.timeout(5000)
      });
      
      if (yRes.ok) {
        const d = await yRes.json();
        const meta = d?.chart?.result?.[0]?.meta;
        const val = meta?.regularMarketPrice || meta?.previousClose;
        if (val) {
          result = { vix: val, source: "Yahoo" };
        } else {
          errors.push("Yahoo data empty");
        }
      } else {
        errors.push(`Yahoo HTTP ${yRes.status}`);
      }
    } catch (e) {
      errors.push(`Yahoo exception: ${e.message}`);
    }
  }

  if (result) {
    result.updatedAt = new Date().toISOString();
    cache.vix = { ...result, expiresAt: now + CACHE_TTL_MS };
    return res.status(200).json({ ok: true, ...cache.vix });
  }

  // 모든 시도 실패 시
  return res.status(500).json({ 
    ok: false, 
    error: "VIX 조회 실패",
    details: errors.join(" | ")
  });
}
