// api/kis-history.js (Vercel Serverless Function)
const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real"
  ? "https://openapi.koreainvestment.com:9443"
  : "https://openapivts.koreainvestment.com:29443";

let cachedToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

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
          appsecret: process.env.KIS_APP_SECRET,
        }),
      });

      const data = await res.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenExpiry = now + (data.expires_in - 60) * 1000;
        return cachedToken;
      }
      throw new Error(data.msg1 || data.error_description || "Failed to get KIS access token");
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

async function fetchYahooHistory(ticker, isOverseas) {
  const symbol = isOverseas
    ? String(ticker).toUpperCase()
    : `${String(ticker).padStart(6, "0")}.KS`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const closes = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];
  const prices = closes.filter(v => Number.isFinite(v)).slice(-60).map(Number);
  if (prices.length < 2) throw new Error("Yahoo history empty");

  return prices;
}

async function fetchKisHistory(ticker, isOverseas, excd = "NAS") {
  const token = await getAccessToken();

  let url;
  let tr_id;

  if (isOverseas) {
    url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-daily-chartprice?AUTH=""&EXCD=${excd.toUpperCase()}&SYMB=${String(ticker).toUpperCase()}&GUBN=0&BYMD=""&MODP=1`;
    tr_id = "HHDFS76410100";
  } else {
    const iscd = String(ticker).padStart(6, "0");
    url = `${API_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${iscd}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`;
    tr_id = "FHKST03010100";
  }

  const priceRes = await fetch(url, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
      tr_id,
    },
  });

  const body = await priceRes.json();

  if (body.output2) {
    return body.output2.slice(0, 60).map(d => Number(isOverseas ? d.last : d.stck_clpr)).reverse();
  }

  if (body.output && Array.isArray(body.output)) {
    return body.output.slice(0, 60).map(d => Number(isOverseas ? d.last : d.stck_clpr)).reverse();
  }

  throw new Error(body.msg1 || "Price fetch failed");
}

export default async function handler(req, res) {
  const { ticker, type, excd = "NAS" } = req.query;
  if (!ticker) return res.status(400).json({ error: "ticker is required" });

  const isOverseas = type === "overseas";

  try {
    const prices = await fetchKisHistory(ticker, isOverseas, excd);
    return res.status(200).json({ ticker, prices, source: "KIS" });
  } catch (kisError) {
    try {
      const prices = await fetchYahooHistory(ticker, isOverseas);
      return res.status(200).json({ ticker, prices, source: "Yahoo" });
    } catch (yahooError) {
      return res.status(500).json({
        error: kisError.message,
        fallbackError: yahooError.message,
      });
    }
  }
}
