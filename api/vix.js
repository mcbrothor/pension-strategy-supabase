/**
 * Serverless Proxy: /api/vix 
 * VIX 지수 조회 (KIS & Yahoo Fallback)
 */

const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real" 
  ? "https://openapi.koreainvestment.com:9443" 
  : "https://openapivts.koreainvestment.com:29443";

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = globalThis.__VIX_CACHE__ || (globalThis.__VIX_CACHE__ = {});

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
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
  // CORS 처리
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const now = Date.now();
  const hit = cache.vix && cache.vix.expiresAt > now ? cache.vix : null;
  if (hit) {
    return res.status(200).json({ ok: true, ...hit });
  }

  let result = null;
  let kisError = null;
  let yahooError = null;

  // 1. KIS API (Priority)
  try {
    const token = await getAccessToken();
    // VIX는 지수이므로 HDFS00000300 (해외지수 현재가) 사용 시도
    // 만약 이것도 안된다면 HHDFS00000300 (해외주식 현재가)로 폴백
    const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-price?AUTH=""&EXCD=NYS&SYMB=VIX`;
    const priceRes = await fetch(url, {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": process.env.KIS_APP_KEY,
        "appsecret": process.env.KIS_APP_SECRET,
        "tr_id": "HDFS00000300" // 해외 지수 현재가용 (H 한 개 제거됨)
      }
    });

    const body = await priceRes.json();
    if (body.output && body.output.last) {
      result = { vix: Number(body.output.last), source: "KIS" };
    } else {
      // 인덱스용 TR이 실패한 경우 주식용 TR로 한 번 더 시도 (VIX가 주식 종목처럼 취급되는 환경 대비)
      const subRes = await fetch(url, {
        headers: {
          "authorization": `Bearer ${token}`,
          "appkey": process.env.KIS_APP_KEY,
          "appsecret": process.env.KIS_APP_SECRET,
          "tr_id": "HHDFS00000300" 
        }
      });
      const subBody = await subRes.json();
      if (subBody.output && subBody.output.last) {
        result = { vix: Number(subBody.output.last), source: "KIS(StockTR)" };
      } else {
        kisError = body.msg1 || subBody.msg1 || "KIS Data Empty";
      }
    }
  } catch (e) {
    kisError = e.message;
  }

  // 2. Yahoo Finance Fallback
  if (!result) {
    try {
      const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX';
      const yRes = await fetch(yahooUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
        }
      });
      if (yRes.ok) {
        const d = await yRes.json();
        const val = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof val === "number" && val > 0) {
          result = { vix: val, source: "Yahoo" };
        } else {
          yahooError = "Yahoo format invalid";
        }
      } else {
        yahooError = `Yahoo HTTP ${yRes.status}`;
      }
    } catch (e) {
      yahooError = e.message;
    }
  }

  if (result) {
    const updatedAt = new Date(now).toISOString();
    cache.vix = { ...result, expiresAt: now + CACHE_TTL_MS, updatedAt };
    return res.status(200).json({ ok: true, ...cache.vix });
  }

  // 여전히 실패한 경우 상세 정보와 함께 500 반환
  return res.status(500).json({ 
    ok: false, 
    error: `전체 소스 조회 실패. KIS: ${kisError}, Yahoo: ${yahooError}` 
  });
}
