/**
 * Serverless Endpoint: /api/market-signals
 *
 * 복합 시장 시그널 3종을 한 번에 조회합니다:
 * 1. Fear & Greed Index (CNN Business — 무료, API Key 불필요)
 * 2. 수익률 곡선 기울기 (FRED T10Y2Y — FRED_API_KEY 필요)
 * 3. 미국 실업률 (FRED UNRATE — FRED_API_KEY 필요)
 *
 * 왜 하나의 엔드포인트로 묶었나:
 *   - 클라이언트에서 3번 호출하면 Cold Start 비용이 3배 → 하나로 합쳐 1회 호출
 *   - 하나가 실패해도 나머지는 정상 반환 (부분 성공 허용)
 */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// =============================================================================
// 1. Fear & Greed Index (CNN)
// =============================================================================

async function fetchFearAndGreed() {
  try {
    // CNN의 공개 JSON 엔드포인트 — API Key 불필요
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent": "PensionPilot/1.0",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) throw new Error(`CNN API ${res.status}`);
    const data = await res.json();

    // CNN 응답 구조: { fear_and_greed: { score, rating, ... } }
    const fg = data?.fear_and_greed;
    if (!fg || fg.score == null) throw new Error("F&G score not found");

    const score = Math.round(fg.score * 10) / 10;

    // 등급 분류
    let label;
    if (score <= 24) label = "extreme_fear";
    else if (score <= 44) label = "fear";
    else if (score <= 55) label = "neutral";
    else if (score <= 74) label = "greed";
    else label = "extreme_greed";

    // 한글 라벨
    const labelKo = {
      extreme_fear: "극단적 공포",
      fear: "공포",
      neutral: "중립",
      greed: "탐욕",
      extreme_greed: "극단적 탐욕",
    }[label];

    return {
      score,
      label,
      labelKo,
      updatedAt: new Date().toISOString(),
      source: "CNN",
      error: null,
    };
  } catch (e) {
    console.error("Fear & Greed fetch error:", e.message);
    return { score: null, label: null, labelKo: null, error: e.message, source: "CNN" };
  }
}

// =============================================================================
// 2. 수익률 곡선 기울기 (FRED T10Y2Y: 10년-2년 국채 스프레드)
// =============================================================================

async function fetchYieldSpread(apiKey) {
  if (!apiKey) return { spread: null, status: null, error: "FRED_API_KEY not configured", source: "FRED" };

  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", "T10Y2Y");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "5"); // 최근 5건 (주말/공휴일 결측 대비)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`FRED API ${res.status}`);
    const data = await res.json();

    // 결측값(".") 제외하고 가장 최근 유효값 사용
    const valid = (data.observations || []).find(o => o.value !== ".");
    if (!valid) throw new Error("No valid T10Y2Y data");

    const spread = parseFloat(valid.value);

    // 상태 분류
    let status;
    if (spread < -0.1) status = "inverted";      // 역전 → 경기침체 경고
    else if (spread < 0.5) status = "flat";       // 평탄화
    else if (spread < 1.5) status = "normal";     // 정상
    else status = "steep";                         // 가파름 → 회복기

    const statusKo = {
      inverted: "역전 ⚠️",
      flat: "평탄화",
      normal: "정상",
      steep: "가파름",
    }[status];

    return {
      spread: Math.round(spread * 100) / 100,
      date: valid.date,
      status,
      statusKo,
      updatedAt: new Date().toISOString(),
      source: "FRED",
      error: null,
    };
  } catch (e) {
    console.error("Yield spread fetch error:", e.message);
    return { spread: null, status: null, error: e.message, source: "FRED" };
  }
}

// =============================================================================
// 3. 미국 실업률 (FRED UNRATE) — LAA 엔진용
// =============================================================================

async function fetchUnemploymentRate(apiKey) {
  if (!apiKey) return { rate: null, avg12m: null, error: "FRED_API_KEY not configured", source: "FRED" };

  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", "UNRATE");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "13"); // 최근 13개월 (12M 평균 + 현재)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`FRED API ${res.status}`);
    const data = await res.json();

    const valid = (data.observations || []).filter(o => o.value !== ".").map(o => ({
      date: o.date,
      value: parseFloat(o.value),
    }));

    if (valid.length === 0) throw new Error("No valid UNRATE data");

    const current = valid[0].value;
    // 12개월 평균 (현재 포함)
    const avg12m = valid.length >= 12
      ? Math.round(valid.slice(0, 12).reduce((s, v) => s + v.value, 0) / 12 * 100) / 100
      : current;

    // LAA 조건: 실업률 < 12M 평균이면 경기 호조
    const isBelow12mAvg = current < avg12m;

    return {
      rate: current,
      avg12m,
      date: valid[0].date,
      isBelow12mAvg,
      updatedAt: new Date().toISOString(),
      source: "FRED",
      error: null,
    };
  } catch (e) {
    console.error("Unemployment rate fetch error:", e.message);
    return { rate: null, avg12m: null, error: e.message, source: "FRED" };
  }
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).set(corsHeaders()).end();
  }

  const fredKey = process.env.FRED_API_KEY;

  try {
    // 3개를 병렬 조회 (하나가 실패해도 나머지는 정상 반환)
    // 개별 fetch 시그널 타임아웃 외에도 Promise.all 전체에 대한 타임아웃 고려 시도
    const [fearGreed, yieldCurve, unemployment] = await Promise.all([
      fetchFearAndGreed(),
      fetchYieldSpread(fredKey),
      fetchUnemploymentRate(fredKey),
    ]);

    // 복합 점수 계산 (0~8)
    let compositeScore = 0;
    if (fearGreed.score !== null) {
      if (fearGreed.score <= 20) compositeScore += 3;
      else if (fearGreed.score <= 40) compositeScore += 2;
      else if (fearGreed.score >= 75) compositeScore += 0;
      else compositeScore += 1;
    }
    if (yieldCurve.spread !== null) {
      if (yieldCurve.spread < 0) compositeScore += 2;
      else if (yieldCurve.spread < 0.5) compositeScore += 1;
    }

    return res.status(200).set(corsHeaders()).json({
      fearGreed,
      yieldCurve,
      unemployment,
      compositeScore,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Global Market Signals Error:", e.message);
    return res.status(500).set(corsHeaders()).json({
      error: e.message,
      fetchedAt: new Date().toISOString(),
    });
  }
}
