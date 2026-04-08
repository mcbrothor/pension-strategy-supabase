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
          appsecret: process.env.KIS_APP_SECRET
        })
      });
      
      const data = await res.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenExpiry = now + (data.expires_in - 60) * 1000;
        console.log("KIS Token Refreshed (History). Next expiry:", new Date(tokenExpiry).toLocaleString());
        return cachedToken;
      } else {
        console.error("KIS Token Error (History):", data.error_description || data.msg1 || "Unknown error");
        throw new Error(data.msg1 || "Failed to get KIS access token");
      }
    } catch (e) {
      console.error("KIS Token Exception (History):", e.message);
      throw e;
    } finally {
      tokenPromise = null;
    }
  })();
  return tokenPromise;
}

export default async function handler(req, res) {
  const { ticker, type, excd = "NAS" } = req.query; // type: "overseas" or "domestic"
  if (!ticker) return res.status(400).json({ error: "ticker is required" });

  try {
    const token = await getAccessToken();
    const isOverseas = type === "overseas";
    
    let url, tr_id;
    if (isOverseas) {
      // 해외주식 기간별 시세 (HHDFS76410100)
      url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-daily-chartprice?AUTH=""&EXCD=${excd.toUpperCase()}&SYMB=${ticker.toUpperCase()}&GUBN=0&BYMD=""&MODP=1`;
      tr_id = "HHDFS76410100";
    } else {
      // 국내주식 기간별 시세 (FHKST03010100)
      const iscd = ticker.padStart(6, "0");
      url = `${API_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${iscd}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`;
      tr_id = "FHKST03010100";
    }

    const priceRes = await fetch(url, {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": process.env.KIS_APP_KEY,
        "appsecret": process.env.KIS_APP_SECRET,
        "tr_id": tr_id
      }
    });

    const body = await priceRes.json();

    if (body.output2) {
      // 최근 60영업일 종가 추출 (output2[0]이 가장 최근)
      const prices = body.output2.slice(0, 60).map(d => Number(isOverseas ? d.last : d.stck_clpr));
      return res.status(200).json({ ticker, prices: prices.reverse() }); // 시간순 정렬
    } else if (body.output && Array.isArray(body.output)) {
      // 일부 TR은 output 하나만 나올 수도 있음
      const prices = body.output.slice(0, 60).map(d => Number(isOverseas ? d.last : d.stck_clpr));
      return res.status(200).json({ ticker, prices: prices.reverse() });
    }

    return res.status(500).json({ error: body.msg1 || "시세 조회 실패", detail: body });

  } catch (e) {
    console.error("KIS History API Error:", e.message);
    res.status(500).json({ error: e.message });
  }
}
