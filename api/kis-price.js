import * as cheerio from 'cheerio';

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
          appsecret: process.env.KIS_APP_SECRET
        })
      });
      const data = await res.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenExpiry = now + (data.expires_in - 60) * 1000;
        console.log("KIS Token Refreshed. Next expiry:", new Date(tokenExpiry).toLocaleString());
        return cachedToken;
      } else {
        console.error("KIS Token Error:", data.error_description || "Unknown error");
      }
    } catch (e) {
      console.error("KIS Token Exception:", e.message);
    } finally {
      tokenPromise = null;
    }
    return null;
  })();
  return tokenPromise;
}


/**
 * Yahoo Finance Fallback
 */
async function fetchYahooPrice(ticker, isDomestic) {
  const symbol = isDomestic ? `${ticker}.KS` : ticker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const d = await res.json();
    const val = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (val) return { price: val, source: "Yahoo" };
  } catch (e) {}
  return null;
}

/**
 * 3rd Fallback: Web Crawling Yahoo Finance 
 */
async function fetchCrawledPrice(ticker, isDomestic) {
  const symbol = isDomestic ? `${ticker}.KS` : ticker;
  try {
    const url = `https://finance.yahoo.com/quote/${symbol}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const priceStr = $(`fin-streamer[data-field="regularMarketPrice"][data-symbol="${symbol}"]`).text() || 
                     $(`fin-streamer[data-field="regularMarketPrice"]`).first().text();
                     
    if (priceStr) {
      const price = parseFloat(priceStr.replace(/,/g, ''));
      if (!isNaN(price)) return { price, source: "Crawled" };
    }
  } catch (e) {
    console.error("Crawling Error:", e.message);
  }
  return null;
}

export default async function handler(req, res) {
  const { ticker, type } = req.query; // type: "overseas" or "domestic" (default)
  if (!ticker) return res.status(400).json({ error: "종목코드(ticker)가 필요합니다." });

  let result = null;
  const isDomestic = (type !== "overseas");

  // 1. KIS API 시도
  try {
    const token = await getAccessToken();
    if (token) {
      if (!isDomestic) {
        // --- 해외 ---
        const excd = req.query.excd || "NYS";
        const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-price?AUTH=""&EXCD=${excd}&SYMB=${ticker}`;
        const pRes = await fetch(url, {
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`,
            "appkey": process.env.KIS_APP_KEY,
            "appsecret": process.env.KIS_APP_SECRET,
            "tr_id": "HHDFS00000300"
          }
        });
        const body = await pRes.json();
        if (body.output?.last) {
          result = { price: Number(body.output.last), name: body.output.name, source: "KIS" };
        }
      } else {
        // --- 국내 ---
        const iscd = String(ticker).padStart(6, "0");
        const url = `${API_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${iscd}`;
        const pRes = await fetch(url, {
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`,
            "appkey": process.env.KIS_APP_KEY,
            "appsecret": process.env.KIS_APP_SECRET,
            "tr_id": "FHKST01010100"
          }
        });
        const body = await pRes.json();
        if (body.output?.stck_prpr) {
          result = { price: Number(body.output.stck_prpr), name: body.output.hts_kor_isnm, source: "KIS" };
        } else {
          console.warn(`KIS Domestic Search No Result [${ticker}]:`, body.msg1 || body.msg_cd);
        }
      }
    } else {
      console.error("KIS Access Token is NULL - Check environment variables.");
    }
  } catch (e) {
    console.error("KIS Proxy Exception:", e.message);
  }

  // 2. KIS 실패 시 Yahoo Fallback
  if (!result) {
    const yPrice = await fetchYahooPrice(ticker, isDomestic);
    if (yPrice) {
      result = yPrice;
    }
  }

  // 3. Yahoo API 실패 시 웹 크롤링 폴백
  if (!result) {
    const cPrice = await fetchCrawledPrice(ticker, isDomestic);
    if (cPrice) {
      result = cPrice;
    }
  }

  if (result) {
    return res.status(200).json({ ticker, ...result });
  }

  return res.status(500).json({ error: "시세 조회를 실패했습니다. (KIS, Yahoo API, Crawling 모두 실패)" });
}
