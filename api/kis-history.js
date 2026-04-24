import { getCachedTokenFromDB, saveTokenToDB } from "./_lib/token-storage.js";

// api/kis-history.js (Vercel Serverless Function)
const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real"
  ? "https://openapi.koreainvestment.com:9443"
  : "https://openapivts.koreainvestment.com:29443";

const PERIOD_TARGET_COUNTS = {
  "1Y": 253,
  "3Y": 757,
  ALL: 1261,
};
const MAX_HISTORY_COUNT = 1261;
const KIS_PAGE_SPAN_DAYS = 140;

let cachedToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

function pickQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function getHistoryTargetCount(period = "1Y", count = null) {
  const requestedCount = Number.parseInt(pickQueryValue(count), 10);
  if (Number.isFinite(requestedCount) && requestedCount > 0) {
    return Math.min(requestedCount, MAX_HISTORY_COUNT);
  }

  const key = String(pickQueryValue(period) || "1Y").trim().toUpperCase();
  return PERIOD_TARGET_COUNTS[key] || PERIOD_TARGET_COUNTS["1Y"];
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseYmd(value) {
  const text = String(value || "").replace(/[^0-9]/g, "");
  if (text.length !== 8) return null;
  const yyyy = Number(text.slice(0, 4));
  const mm = Number(text.slice(4, 6));
  const dd = Number(text.slice(6, 8));
  if (!yyyy || !mm || !dd) return null;
  return new Date(yyyy, mm - 1, dd);
}

function readRowDate(row) {
  return (
    row.stck_bsop_date ||
    row.xymd ||
    row.date ||
    row.tradingDate ||
    row.bas_dt ||
    row.trd_dd ||
    null
  );
}

function readRowPrice(row, isOverseas) {
  const candidateKeys = isOverseas
    ? ["last", "clos", "close", "ovrs_nmix_prpr", "stck_clpr"]
    : ["stck_clpr", "close", "clos", "last"];

  for (const key of candidateKeys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function normalizePriceRows(rows = [], isOverseas = false) {
  return rows
    .map((row, index) => ({
      date: readRowDate(row),
      price: readRowPrice(row, isOverseas),
      index,
    }))
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => {
      const aDate = parseYmd(a.date);
      const bDate = parseYmd(b.date);
      if (aDate && bDate) return aDate - bDate;
      return a.index - b.index;
    });
}

function mergePriceRows(existing, incoming) {
  const map = new Map();
  [...existing, ...incoming].forEach((item, index) => {
    const key = item.date ? String(item.date) : `idx-${index}-${item.price}`;
    map.set(key, item);
  });

  return Array.from(map.values()).sort((a, b) => {
    const aDate = parseYmd(a.date);
    const bDate = parseYmd(b.date);
    if (aDate && bDate) return aDate - bDate;
    return 0;
  });
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const dbResult = await getCachedTokenFromDB('kis');
      if (dbResult) {
        cachedToken = dbResult.token;
        tokenExpiry = dbResult.expiry;
        return cachedToken;
      }

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
        await saveTokenToDB('kis', data.access_token, data.expires_in);
        return cachedToken;
      }
      throw new Error(data.msg1 || data.error_description || "Failed to get KIS access token");
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

async function fetchYahooHistory(ticker, isOverseas, targetCount) {
  const symbol = isOverseas
    ? String(ticker).toUpperCase()
    : `${String(ticker).padStart(6, "0")}.KS`;

  const range = targetCount > 760 ? "5y" : targetCount > 260 ? "3y" : "1y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];
  const rows = closes
    .map((close, index) => ({
      date: timestamps[index]
        ? new Date(timestamps[index] * 1000).toISOString().slice(0, 10).replace(/-/g, "")
        : null,
      price: Number(close),
    }))
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .slice(-targetCount);
  if (rows.length < 2) throw new Error("Yahoo history empty");

  return {
    prices: rows.map((item) => item.price),
    dates: rows.map((item) => item.date),
    requestedCount: targetCount,
    dataPoints: rows.length,
    pageCount: 1,
    source: "Yahoo",
  };
}

async function fetchKisHistoryPage(ticker, isOverseas, excd, startYmd, endYmd) {
  const token = await getAccessToken();
  let url;
  let tr_id;

  if (isOverseas) {
    const params = new URLSearchParams({
      AUTH: "",
      EXCD: excd.toUpperCase(),
      SYMB: String(ticker).toUpperCase(),
      GUBN: "0",
      BYMD: endYmd,
      MODP: "1",
    });
    url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-daily-chartprice?${params.toString()}`;
    tr_id = "HHDFS76410100";
  } else {
    const iscd = String(ticker).padStart(6, "0");
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: iscd,
      FID_INPUT_DATE_1: startYmd,
      FID_INPUT_DATE_2: endYmd,
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0",
    });
    url = `${API_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params.toString()}`;
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
  const rows = Array.isArray(body.output2)
    ? body.output2
    : Array.isArray(body.output)
      ? body.output
      : [];

  if (rows.length > 0) return normalizePriceRows(rows, isOverseas);

  throw new Error(body.msg1 || "Price fetch failed");
}

async function fetchKisHistory(ticker, isOverseas, excd = "NAS", targetCount = PERIOD_TARGET_COUNTS["1Y"]) {
  let collected = [];
  let endDate = new Date();
  let pageCount = 0;
  const maxPages = Math.min(12, Math.max(1, Math.ceil(targetCount / 80) + 2));

  while (collected.length < targetCount && pageCount < maxPages) {
    const endYmd = formatYmd(endDate);
    const startYmd = formatYmd(addDays(endDate, -KIS_PAGE_SPAN_DAYS));
    const beforeCount = collected.length;
    const pageRows = await fetchKisHistoryPage(ticker, isOverseas, excd, startYmd, endYmd);

    pageCount += 1;
    collected = mergePriceRows(collected, pageRows);

    const oldest = collected[0]?.date;
    const oldestDate = parseYmd(oldest);
    if (!oldestDate || collected.length === beforeCount) break;
    endDate = addDays(oldestDate, -1);
  }

  const rows = collected.slice(-targetCount);
  if (rows.length < 2) throw new Error("KIS history empty");

  return {
    prices: rows.map((item) => item.price),
    dates: rows.map((item) => item.date),
    requestedCount: targetCount,
    dataPoints: rows.length,
    pageCount,
    source: "KIS",
  };
}

export default async function handler(req, res) {
  const { ticker, type, excd = "NAS", period = "1Y", count = null } = req.query;
  if (!ticker) return res.status(400).json({ error: "ticker is required" });

  const isOverseas = type === "overseas";
  const targetCount = getHistoryTargetCount(period, count);

  try {
    const result = await fetchKisHistory(ticker, isOverseas, excd, targetCount);
    return res.status(200).json({ ticker, ...result });
  } catch (kisError) {
    try {
      const result = await fetchYahooHistory(ticker, isOverseas, targetCount);
      return res.status(200).json({ ticker, ...result });
    } catch (yahooError) {
      return res.status(500).json({
        error: kisError.message,
        fallbackError: yahooError.message,
      });
    }
  }
}
