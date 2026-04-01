/**
 * Serverless Endpoint Example: /api/momentum
 *
 * 목적
 * - 모멘텀 전략의 “이번 달 목표 비중”을 자동 계산해 웹앱에 제공
 * - 프론트에서 계산 데이터(시세/이평 등)를 직접 다루지 않음
 *
 * 현재 구현 상태(완성형 스캐폴딩)
 * - 가격 데이터 소스(KIS OpenAPI 등) 연동 포인트를 남기고,
 *   기본은 입력으로 들어온 `benchmark`를 그대로 반환(=정적 기준 폴백)
 *
 * 요청(JSON)
 * - strategyId: string
 * - asOf: string (ISO)
 * - benchmark: { [assetClass]: number }  // GAS에서 온 정적 기준(폴백용)
 * - assetHoldings: [{cls,amt,costAmt,...}] // 폴백/가드레일용
 *
 * 응답(JSON)
 * - { ok: true, strategyId, targets: { [assetClass]: number }, mode, updatedAt }
 */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  // Node serverless에서 raw body를 직접 읽는 경우를 대비
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += String(chunk)));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function fallbackTargets(reqBody) {
  return reqBody?.benchmark && typeof reqBody.benchmark === "object" ? reqBody.benchmark : {};
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30분 캐시(월말 배치 기준으로 충분히 완화)
const momentumCache = globalThis.__MOMENTUM_CACHE__ || (globalThis.__MOMENTUM_CACHE__ = {});

// (대체) 가격 소스: Stooq 월말 시세를 이용해 모멘텀을 계산
// - 실제 원화/국내 ETF 코드와 1:1 매칭이 아니며, 노출(자산군) 프록시로 계산합니다.
const STOOQ_TICKER_BY_CLS = {
  "미국주식": "SPY.US",
  "선진국주식": "EFA.US",
  "미국중기채권": "IEF.US",
  "미국장기채권": "TLT.US",
  "원자재": "DBC.US",
  "부동산리츠": "VNQ.US",
  "금": "GLD.US",
  "신흥국주식": "EEM.US",
  "현금MMF": "BIL.US",
};

async function fetchStooqMonthlyCloses(stooqTicker, monthsNeeded) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqTicker)}&i=m`;
  const text = await fetch(url).then(r => r.text());
  const lines = String(text).trim().split("\n");
  // header: Date,Open,High,Low,Close,Volume
  lines.shift();
  const closes = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 5) continue;
    const close = Number(parts[4]);
    if (!Number.isFinite(close)) continue;
    closes.push(close);
  }
  return closes.slice(-monthsNeeded);
}

function retPctFromCloses(closes, monthsBack) {
  // closes: [ ... older -> newer ]
  const n = closes.length;
  const idx0 = n - monthsBack - 1;
  const idx1 = n - 1;
  if (idx0 < 0 || idx1 < 0) return null;
  const c0 = Number(closes[idx0]);
  const c1 = Number(closes[idx1]);
  if (!Number.isFinite(c0) || !Number.isFinite(c1) || c0 === 0) return null;
  return ((c1 / c0) - 1) * 100;
}

function ma(closes, window) {
  const n = closes.length;
  if (n < window) return null;
  let s = 0;
  for (let i = n - window; i < n; i++) s += Number(closes[i]);
  return s / window;
}

function computeGTAA5Targets(priceSeries) {
  const assetSet = [
    { cls: "미국주식", w: 20 },
    { cls: "선진국주식", w: 20 },
    { cls: "미국중기채권", w: 20 },
    { cls: "원자재", w: 20 },
    { cls: "부동산리츠", w: 20 },
  ];
  const cashCls = "현금MMF";

  // 10개월 이동평균 조건
  const selected = [];
  for (const a of assetSet) {
    const series = priceSeries?.[a.cls]?.monthlyCloses;
    const closes = Array.isArray(series) ? series.map(Number) : null;
    if (!closes || closes.length < 11) continue;
    const last = closes[closes.length - 1];
    const m10 = ma(closes, 10);
    if (m10 != null && Number.isFinite(last) && Number.isFinite(m10) && last >= m10) {
      selected.push(a);
    }
  }

  const baseSelected = selected.reduce((s, x) => s + x.w, 0);
  const cash = Math.max(0, 100 - baseSelected);

  const targets = {};
  for (const a of assetSet) targets[a.cls] = selected.some(s => s.cls === a.cls) ? a.w : 0;
  targets[cashCls] = cash;
  return targets;
}

function computeDualMomentumTargets(priceSeries) {
  // 절대 모멘텀: 미국주식 vs KOFR(현금MMF)
  const us = retPctFromCloses(priceSeries?.["미국주식"]?.monthlyCloses, 12);
  const dev = retPctFromCloses(priceSeries?.["선진국주식"]?.monthlyCloses, 12);
  const cash = retPctFromCloses(priceSeries?.["현금MMF"]?.monthlyCloses, 12);
  const longBond = retPctFromCloses(priceSeries?.["미국장기채권"]?.monthlyCloses, 12);

  if ([us, dev, cash, longBond].some(v => v == null)) return null;

  // ① S&P500 12M 수익률 > KOFR? => 주식, 아니면 장기채 100%
  if (us <= cash) {
    return { "미국장기채권": 100 };
  }

  // ② 주식이면 미국 vs 선진국 12M 비교 → 높은 쪽 100%
  return us >= dev ? { "미국주식": 100 } : { "선진국주식": 100 };
}

function computeLAATargets(priceSeries) {
  // LAA의 핵심은 “고정분 75% + 모멘텀분 25%(월말)”
  // 원래는 200일 이평/실업률 조건이지만, 월말 시계열만 활용하는 근사로 대체:
  // - S&P500(미국주식) 12M 수익률이 음수면 모멘텀분을 현금MMF로 이동
  // - 그렇지 않으면 모멘텀분을 미국주식으로 유지
  const spRet12m = retPctFromCloses(priceSeries?.["미국주식"]?.monthlyCloses, 12);
  if (spRet12m == null) return null;

  if (spRet12m < 0) {
    return { "국내주식": 25, "금": 25, "미국중기채권": 25, "현금MMF": 25 };
  }
  return { "국내주식": 25, "금": 25, "미국중기채권": 25, "미국주식": 25 };
}

function computeDAATargets(priceSeries) {
  // DAA의 카나리아(신흥국/장기채) 모멘텀 점수로 공격/안전 비중을 0/50/100%로 결정
  function score(closes) {
    // score = 12×1M + 4×3M + 2×6M + 1×12M (월말 종가 근사)
    const r1 = retPctFromCloses(closes, 1);
    const r3 = retPctFromCloses(closes, 3);
    const r6 = retPctFromCloses(closes, 6);
    const r12 = retPctFromCloses(closes, 12);
    if ([r1, r3, r6, r12].some(v => v == null)) return null;
    return 12 * r1 + 4 * r3 + 2 * r6 + 1 * r12;
  }

  const emergCloses = priceSeries?.["신흥국주식"]?.monthlyCloses;
  const longCloses = priceSeries?.["미국장기채권"]?.monthlyCloses;
  const emerg = Array.isArray(emergCloses) ? score(emergCloses.map(Number)) : null;
  const long = Array.isArray(longCloses) ? score(longCloses.map(Number)) : null;
  if (emerg == null || long == null) return null;

  // 공격/안전 결과에 따라 “공격형 풀”을 단순 분할:
  // - 공격 100%: 미국주식 70% + 금 30%
  // - 공격 50%: 미국주식 35% + 금 15% + 현금MMF 50%
  // - 안전 100%: 현금MMF 100%
  if (emerg > 0 && long > 0) return { "미국주식": 70, "금": 30 };
  if (emerg > 0 || long > 0) return { "미국주식": 35, "금": 15, "현금MMF": 50 };
  return { "현금MMF": 100 };
}

module.exports = async function handler(req, res) {
  if (req?.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req?.method !== "POST") {
    res.writeHead(405, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { message: "POST required" } }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const strategyId = body?.strategyId || "";
    const priceSeries = body?.priceSeries || null;
    const asOf = body?.asOf ? String(body.asOf) : new Date().toISOString();
    const cacheKey = `strategy:${strategyId}|asOf:${asOf.slice(0,7)}`; // YYYY-MM 단위

    if (!strategyId) {
      res.writeHead(400, { ...corsHeaders(), "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { message: "strategyId required" } }));
      return;
    }

    const hit = momentumCache[cacheKey];
    const now = Date.now();
    if (hit && hit.expiresAt > now) {
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
      res.end(JSON.stringify(hit.value));
      return;
    }

    // 가격 시계열(priceSeries)이 들어오면 일부 전략은 실제 계산 수행
    let targets = null;
    let mode = "fallback_static_benchmark";
    let series = priceSeries && typeof priceSeries === "object" ? priceSeries : null;

    // priceSeries가 없으면 Stooq로 필요한 자산군 월말 종가를 가져와 계산 시도
    if (!series && (strategyId === "gtaa5" || strategyId === "dual_momentum" || strategyId === "laa" || strategyId === "daa")) {
      let needed = [];
      let msNeeded = 13;
      if (strategyId === "gtaa5") {
        needed = ["미국주식", "선진국주식", "미국중기채권", "원자재", "부동산리츠", "현금MMF"];
        msNeeded = 11; // MA10+1
      } else if (strategyId === "dual_momentum") {
        needed = ["미국주식", "선진국주식", "미국장기채권", "현금MMF"];
        msNeeded = 13; // 12M+1
      } else if (strategyId === "laa") {
        needed = ["미국주식"];
        msNeeded = 13;
      } else if (strategyId === "daa") {
        needed = ["신흥국주식", "미국장기채권"];
        msNeeded = 13;
      }
      const priceSeriesTmp = {};
      await Promise.all(needed.map(async (cls) => {
        const stooqTicker = STOOQ_TICKER_BY_CLS[cls];
        if (!stooqTicker) return;
        try {
          const closes = await fetchStooqMonthlyCloses(stooqTicker, msNeeded);
          priceSeriesTmp[cls] = { monthlyCloses: closes };
        } catch {
          // 일부 자산군 실패해도 전체 실패가 과도하므로 여기서는 무시
        }
      }));
      series = priceSeriesTmp;
    }

    if (series && typeof series === "object") {
      if (strategyId === "gtaa5") {
        const t = computeGTAA5Targets(series);
        if (t) {
          targets = t;
          mode = "computed_gtaa5";
        }
      } else if (strategyId === "dual_momentum") {
        const t = computeDualMomentumTargets(series);
        if (t) {
          targets = t;
          mode = "computed_dual_momentum";
        }
      } else if (strategyId === "laa") {
        const t = computeLAATargets(series);
        if (t) {
          targets = t;
          mode = "computed_laa";
        }
      } else if (strategyId === "daa") {
        const t = computeDAATargets(series);
        if (t) {
          targets = t;
          mode = "computed_daa";
        }
      }
    }

    if (!targets) targets = fallbackTargets(body);

    const updatedAt = new Date().toISOString();
    const payload = {
      ok: true,
      strategyId,
      targets,
      mode,
      updatedAt,
    };

    momentumCache[cacheKey] = { value: payload, expiresAt: now + CACHE_TTL_MS };
    res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { message: err?.message ? err.message : String(err) } }));
  }
};

