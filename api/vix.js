const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real"
  ? "https://openapi.koreainvestment.com:9443"
  : "https://openapivts.koreainvestment.com:29443";

const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_GRACE_MS = 24 * 60 * 60 * 1000;
const cache = globalThis.__VIX_CACHE__ || (globalThis.__VIX_CACHE__ = {});

let cachedToken = null;
let tokenExpiry = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, retries = 2, retryDelayMs = 400) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (i < retries) {
          await sleep(retryDelayMs * (i + 1));
          continue;
        }
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await sleep(retryDelayMs * (i + 1));
        continue;
      }
    }
  }
  throw lastErr || new Error("fetch failed");
}

async function getInternalToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const res = await fetchWithRetry(`${API_BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
    signal: AbortSignal.timeout(7000),
  }, 1, 300);

  const data = await res.json();
  if (!data.access_token) throw new Error(data.msg1 || data.error_description || "Failed to get KIS token");

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function fetchFromKis() {
  const token = await getInternalToken();
  const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-price?AUTH=""&EXCD=NYS&SYMB=VIX`;

  const fetchByTr = async (trId) => {
    const res = await fetchWithRetry(url, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
        tr_id: trId,
      },
      signal: AbortSignal.timeout(7000),
    }, 1, 300);

    const body = await res.json();
    const price = Number(body?.output?.last);
    return Number.isFinite(price) && price > 0 ? price : null;
  };

  const p1 = await fetchByTr("HDFS00000300");
  if (p1) return { vix: p1, source: "KIS" };

  const p2 = await fetchByTr("HHDFS00000300");
  if (p2) return { vix: p2, source: "KIS(Fallback)" };

  throw new Error("KIS returned empty price");
}

async function fetchFromYahoo() {
  const endpoints = [
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d",
    "https://query2.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d",
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithRetry(endpoint, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(7000),
      }, 1, 400);

      const d = await res.json();
      const result = d?.chart?.result?.[0];
      const meta = result?.meta;
      const val = Number(meta?.regularMarketPrice || meta?.previousClose);
      if (Number.isFinite(val) && val > 0) return { vix: val, source: "Yahoo" };

      const closeArr = result?.indicators?.quote?.[0]?.close || [];
      const last = Number([...closeArr].reverse().find((x) => Number.isFinite(x)));
      if (Number.isFinite(last) && last > 0) return { vix: last, source: "Yahoo" };
    } catch {
      // try next endpoint
    }
  }

  throw new Error("Yahoo returned empty price");
}

async function fetchFromCboe() {
  const url = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";
  const res = await fetchWithRetry(url, { signal: AbortSignal.timeout(8000) }, 1, 400);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CBOE csv empty");

  const last = lines[lines.length - 1].split(",");
  const close = Number(last[last.length - 1]);
  if (!Number.isFinite(close) || close <= 0) throw new Error("CBOE close parse failed");

  return { vix: close, source: "CBOE(DailyClose)" };
}

async function fetchFromStooq() {
  const url = "https://stooq.com/q/l/?s=%5Evix&i=d";
  const res = await fetchWithRetry(url, { signal: AbortSignal.timeout(8000) }, 1, 400);
  const text = (await res.text()).trim();
  const row = text.split(/\r?\n/).at(-1);
  const cols = row?.split(",") || [];
  const close = Number(cols[6]);
  if (!Number.isFinite(close) || close <= 0) throw new Error("Stooq close parse failed");
  return { vix: close, source: "Stooq" };
}

function buildCachedResponse() {
  if (!cache.vix) return null;
  const age = Date.now() - new Date(cache.vix.updatedAt).getTime();
  if (!Number.isFinite(age) || age > STALE_GRACE_MS) return null;

  return {
    ok: true,
    ...cache.vix,
    source: `${cache.vix.source || "Cache"}(Stale)`,
    stale: true,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  const now = Date.now();
  if (cache.vix && cache.vix.expiresAt > now) {
    return res.status(200).json({ ok: true, ...cache.vix, stale: false });
  }

  const errors = [];
  const sources = [
    ["KIS", fetchFromKis],
    ["Yahoo", fetchFromYahoo],
    ["CBOE", fetchFromCboe],
    ["Stooq", fetchFromStooq],
  ];

  for (const [label, fn] of sources) {
    try {
      const result = await fn();
      const payload = {
        ...result,
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      cache.vix = payload;
      return res.status(200).json({ ok: true, ...payload, stale: false });
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  }

  const stale = buildCachedResponse();
  if (stale) {
    return res.status(200).json(stale);
  }

  return res.status(500).json({
    ok: false,
    error: "VIX 조회 실패",
    details: errors.join(" | "),
  });
}
