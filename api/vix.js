/**
 * Serverless Proxy: /api/vix
 *
 * 목적
 * - 무료 데이터 소스에서 VIX를 조회 (API 키 불필요)
 * - 10분 캐시로 호출/실패 리스크 완화
 *
 * 기대 응답(JSON)
 * - { ok: true, vix: number, updatedAt: string }
 * - { ok: false, error: { message: string } }
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = globalThis.__VIX_CACHE__ || (globalThis.__VIX_CACHE__ = {});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req?.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    const now = Date.now();
    const hit = cache.vix && cache.vix.expiresAt > now ? cache.vix : null;
    if (hit) {
      res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, vix: hit.value, updatedAt: hit.updatedAt }));
      return;
    }

    // 무료 소스: Stooq (CSV)
    // 예: https://stooq.com/q/d/l/?s=vix&i=d  (Date,Open,High,Low,Close,Volume)
    const csv = await fetch("https://stooq.com/q/d/l/?s=^vix&i=d").then((r) => r.text());
    const lines = String(csv).trim().split("\n");
    lines.shift(); // header 제거
    const last = lines[lines.length - 1] || "";
    const parts = last.split(",");
    const close = parts.length >= 5 ? Number(parts[4]) : NaN;
    const vix = close;
    if (!Number.isFinite(vix)) throw new Error("Failed to parse VIX");

    const updatedAt = new Date(now).toISOString();
    cache.vix = { value: vix, expiresAt: now + CACHE_TTL_MS, updatedAt };

    res.writeHead(200, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, vix, updatedAt }));
  } catch (err) {
    res.writeHead(500, { ...corsHeaders(), "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: { message: err?.message ? err.message : String(err) },
      })
    );
  }
};

