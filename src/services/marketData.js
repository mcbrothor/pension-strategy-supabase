/**
 * 시장 데이터 서비스 레이어
 * 
 * 왜 분리했나: MarketContext에 로직이 뒤섞여 있으면
 * - 테스트 불가 (React 의존)
 * - 재사용 불가 (서비스 간 호출 불가)
 * - 교체 불가 (데이터 소스 변경 시 Context 전체 수정)
 * 
 * MetricMeta 인터페이스를 통해 데이터의 출처·신선도·신뢰등급을 추적합니다.
 */

// =============================================================================
// Types (JSDoc — 2단계에서 TypeScript 전환 시 interface로 변환)
// =============================================================================

/**
 * @typedef {'KIS' | 'Yahoo' | 'Cache' | 'Estimated'} DataSource
 * @typedef {'realtime' | 'delayed' | 'cached'} Freshness
 * @typedef {'A' | 'B' | 'C'} ConfidenceGrade
 * @typedef {'realized' | 'estimated'} CalcMode
 * 
 * @typedef {Object} MetricMeta
 * @property {DataSource} source - 데이터 출처
 * @property {string} updatedAt - ISO 8601 갱신 시각
 * @property {Freshness} freshness - 신선도 (realtime: 5분 이내, delayed: 1시간 이내, cached: 그 이상)
 * @property {ConfidenceGrade} confidenceGrade - 신뢰 등급
 * @property {CalcMode} calcMode - 계산 방식
 */

// =============================================================================
// 신뢰도 평가 엔진
// =============================================================================

/**
 * 데이터 신뢰도 등급 산출
 * - 응답시간: 빠를수록 좋음
 * - 결측치: 없을수록 좋음
 * - 최신성: 최근일수록 좋음
 * 
 * @param {Object} params
 * @param {number} params.responseTimeMs - API 응답 시간 (밀리초)
 * @param {number} params.missingRatio - 결측치 비율 (0~1)
 * @param {number} params.ageMinutes - 데이터 갱신 후 경과 시간 (분)
 * @returns {ConfidenceGrade}
 */
export function calculateConfidenceGrade({ responseTimeMs = 0, missingRatio = 0, ageMinutes = 0 }) {
  let score = 100;
  
  // 응답 시간 감점 (3초 초과부터 감점)
  if (responseTimeMs > 3000) score -= 20;
  else if (responseTimeMs > 1000) score -= 5;
  
  // 결측치 감점
  score -= missingRatio * 50;
  
  // 최신성 감점 (10분 이내 A, 1시간 이내 B, 그 이상 C)
  if (ageMinutes > 60) score -= 30;
  else if (ageMinutes > 10) score -= 10;
  
  if (score >= 80) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

/**
 * 갱신 시각으로부터 freshness를 판단
 * @param {string|null} updatedAt - ISO 8601 문자열
 * @returns {Freshness}
 */
export function determineFreshness(updatedAt) {
  if (!updatedAt) return 'cached';
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageMinutes = ageMs / 60000;
  if (ageMinutes <= 5) return 'realtime';
  if (ageMinutes <= 60) return 'delayed';
  return 'cached';
}

/**
 * MetricMeta 객체 생성 헬퍼
 * @param {Object} params
 * @returns {MetricMeta}
 */
export function buildMetricMeta({ source, updatedAt, responseTimeMs = 0, missingRatio = 0, calcMode = 'realized' }) {
  const ageMinutes = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 60000 : 999;
  
  return {
    source,
    updatedAt: updatedAt || new Date().toISOString(),
    freshness: determineFreshness(updatedAt),
    confidenceGrade: calculateConfidenceGrade({ responseTimeMs, missingRatio, ageMinutes }),
    calcMode,
  };
}

// =============================================================================
// VIX 조회
// =============================================================================

/**
 * VIX 지수 조회 (서버리스 API 경유)
 * @returns {Promise<{ vix: number|null, meta: MetricMeta, error: string|null }>}
 */
export async function fetchVixData() {
  const startTime = Date.now();
  
  try {
    const res = await fetch("/api/vix");
    const responseTimeMs = Date.now() - startTime;
    
    if (res.ok) {
      const data = await res.json();
      if (data.ok && typeof data.vix === "number") {
        return {
          vix: data.vix,
          meta: buildMetricMeta({
            source: data.source || 'Unknown',
            updatedAt: data.updatedAt,
            responseTimeMs,
            missingRatio: 0,
          }),
          error: null,
        };
      }
      return { vix: null, meta: null, error: data.error || "VIX 데이터 형식이 올바르지 않습니다." };
    }
    
    // 서버 에러
    try {
      const errData = await res.json();
      return { vix: null, meta: null, error: errData.error || `VIX 조회 실패 (Status: ${res.status})` };
    } catch {
      return { vix: null, meta: null, error: `VIX 서버 오류 (Status: ${res.status})` };
    }
  } catch (e) {
    return { vix: null, meta: null, error: e.message };
  }
}

// =============================================================================
// 모멘텀 데이터 조회
// =============================================================================

/**
 * 모멘텀 API 호출 (서버리스 API 경유)
 * @param {string} strategyId
 * @param {Array} composition
 * @returns {Promise<{ ok: boolean, targets: Object, meta: MetricMeta|null, error: string|null }>}
 */
export async function fetchMomentumData(strategyId, composition) {
  const startTime = Date.now();
  
  try {
    const res = await fetch("/api/momentum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId, composition }),
    });
    const responseTimeMs = Date.now() - startTime;
    const data = await res.json();
    
    if (data.ok && data.targets) {
      return {
        ok: true,
        targets: data.targets,
        meta: buildMetricMeta({
          source: data.dataSource || 'KIS',
          updatedAt: data.updatedAt,
          responseTimeMs,
          missingRatio: 0,
        }),
        error: null,
      };
    }
    
    return { ok: false, targets: null, meta: null, error: data.error || "모멘텀 계산 실패" };
  } catch (e) {
    return { ok: false, targets: null, meta: null, error: e.message };
  }
}

// =============================================================================
// 신뢰도 배지 텍스트 생성
// =============================================================================

/**
 * 배지에 표시할 신선도 레이블
 * @param {Freshness} freshness
 * @returns {string}
 */
export function getFreshnessLabel(freshness) {
  const map = { realtime: '실시간', delayed: '지연', cached: '캐시' };
  return map[freshness] || '알 수 없음';
}

/**
 * 신뢰 등급에 따른 색상 테마
 * @param {ConfidenceGrade} grade
 * @returns {{ color: string, bg: string }}
 */
export function getGradeTheme(grade) {
  const themes = {
    A: { color: '#27500a', bg: '#eaf3de' },
    B: { color: '#633806', bg: '#faeeda' },
    C: { color: '#791f1f', bg: '#fcebeb' },
  };
  return themes[grade] || themes.C;
}
