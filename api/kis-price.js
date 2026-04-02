// api/kis-price.js (Vercel Serverless Function)
const API_BASE_URL = process.env.KIS_ACCOUNT_TYPE === "real" 
  ? "https://openapi.koreainvestment.com:9443" 
  : "https://openapivts.koreainvestment.com:29443";

// 서버리스 인스턴스 전역에 토큰 캐싱 (메모리 내)
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    console.log("Using cached KIS token");
    return cachedToken;
  }

  console.log("Requesting new KIS token...");
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
    // 유효시간(초)에서 1분 정도 여유를 두고 만료 시간 계산
    tokenExpiry = now + (data.expires_in - 60) * 1000;
    return cachedToken;
  }
  
  console.error("Token error response:", data);
  throw new Error(data.msg1 || "Failed to get KIS access token");
}

export default async function handler(req, res) {
  // 1. 티커 및 타입 확인
  const { ticker, type } = req.query; // type: "overseas" or "domestic" (default)
  if (!ticker) return res.status(400).json({ error: "종목코드(ticker)가 필요합니다." });

  // 2. KIS API 보안 헤더 및 파라미터 준비
  try {
    const token = await getAccessToken();

    if (type === "overseas") {
      // --- 해외 지수/주식 조회 (예: VIX) ---
      // VIX는 보통 CBOE(BAQ/BAA 등) 거래소 소속이지만, KIS에서는 종목 성격에 따라 다를 수 있음
      // 여기서는 범용적인 해외 주식/지수 조회 TR_ID를 사용
      const symb = String(ticker).toUpperCase();
      const excd = req.query.excd || "NYS"; // 기본값 NYS (S&P/VIX 등 지수용)
      
      const url = `${API_BASE_URL}/uapi/overseas-stock/v1/quotations/inquire-price?AUTH=""&EXCD=${excd}&SYMB=${symb}`;
      
      const priceRes = await fetch(url, {
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
          "appkey": process.env.KIS_APP_KEY,
          "appsecret": process.env.KIS_APP_SECRET,
          "tr_id": "HHDFS00000300" // 해외 주식 현재가 조회 TR_ID
        }
      });

      const body = await priceRes.json();
      if (body.output) {
        return res.status(200).json({
          ticker: symb,
          price: Number(body.output.last), // 현재가
          name: body.output.name,
          currency: body.output.curr,
          msg: body.msg1
        });
      }
      return res.status(500).json({ error: body.msg1 || "해외 시세 조회 실패" });

    } else {
      // --- 국내 주식/ETF 조회 (기존 로직) ---
      const iscd = String(ticker).padStart(6, "0");
      const url = `${API_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${iscd}`;
      
      const priceRes = await fetch(url, {
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
          "appkey": process.env.KIS_APP_KEY,
          "appsecret": process.env.KIS_APP_SECRET,
          "tr_id": "FHKST01010100"
        }
      });

      const body = await priceRes.json();
      if (body.output) {
        return res.status(200).json({ 
          ticker: iscd, 
          price: Number(body.output.stck_prpr),
          name: body.output.hts_kor_isnm,
          msg: body.msg1
        });
      }
      return res.status(500).json({ error: body.msg1 || "국내 시세 조회 실패" });
    }

  } catch (e) {
    console.error("KIS Proxy Function Error:", e.message);
    res.status(500).json({ error: e.message });
  }
}
