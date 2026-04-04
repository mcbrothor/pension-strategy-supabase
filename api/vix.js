/**
 * Serverless Proxy: /api/vix
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

module.exports = async function handler(req, res) {
  if (req?.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  const now = Date.now();
  const hit = cache.vix && cache.vix.expiresAt > now ? cache.vix : null;
  if (hit) {
    res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, ...hit }));
  }

  let result = null;

  // 1. KIS API (Priority)
  try {
    const token = await getAccessToken();
    const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-price?AUTH=""&EXCD=NYS&SYMB=VIX`;
    const priceRes = await fetch(url, {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": process.env.KIS_APP_KEY,
        "appsecret": process.env.KIS_APP_SECRET,
        "tr_id": "HHDFS00000300"
      }
    });
    const body = await priceRes.json();
    if (body.output && body.output.last) {
      result = { vix: Number(body.output.last), source: "KIS" };
    }
  } catch (e) {
    console.warn("KIS VIX Fetch Failed:", e.message);
  }

  // 2. Stooq Fallback
  if (!result) {
    try {
      const csv = await fetch("https://stooq.com/q/d/l/?s=^vix&i=d", {
        headers: { "User-Agent": "Mozilla/5.0" }
      }).then(r => r.text());
      const lines = csv.trim().split("\n");
      const last = lines[lines.length - 1] || "";
      const close = Number(last.split(",")[4]);
      if (Number.isFinite(close) && close > 0) {
        result = { vix: close, source: "Stooq" };
      }
    } catch (e) {
      console.warn("Stooq VIX Fetch Failed:", e.message);
    }
  }

  if (result) {
    const updatedAt = new Date(now).toISOString();
    cache.vix = { ...result, expiresAt: now + CACHE_TTL_MS, updatedAt };
    res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, ...cache.vix }));
  }

  res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "All data sources failed" }));
};

