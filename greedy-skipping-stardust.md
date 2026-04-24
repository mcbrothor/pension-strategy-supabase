# 연금 운용 프로그램 — 시니어 임원 관점 검토

## Context

본 검토는 "새 연금 운용사 대표가 이 프로그램을 실전 운용 도구로 채택할 것인가"라는 관점에서 수행한다. 목표 KPI는 **연 단위로 S&P500을 안정적으로 상회**하는 것. 제약은 무료 API, Vercel/Supabase 무료 플랜, 개인 사용.

기존 `PROGRAM_EVALUATION.md`는 "개인이 MTS 보조 도구로 쓰는 수준"이라는 **보수적 천장**을 전제했다. 본 문서는 그 천장을 한 단계 올려 **"무료 제약 하에서 실제로 S&P500을 이길 수 있는 알파 생성 도구"**로 재정의할 때의 맥시멈과 갭을 분석한다.

---

## 1. 경영진 관점 현 수준 한 줄 평

> **"리스크 관리용 대시보드로는 80점, 알파 생성 도구로는 30점."**

- 라이프사이클 커버리지(입력 → 시그널 → 리밸런싱 → 보고)는 구조적으로 갖춰져 있음
- 그러나 **S&P500을 이기는 메커니즘 자체가 설계에 부재**함
  - 9개 프리셋 전략은 모두 **60/40~영구 포트폴리오 계열 (equity 25~60%)** — 장기 우상향장에서 SPY에 2~4%p/년 구조적 열위
  - 모멘텀 필터(10개월 SMA)는 **lag 3~5개월**, drawdown 일부 회피는 가능하나 반등 초기 진입을 놓침
  - VIX/Fear&Greed/yield curve는 **리밸런싱 분할 횟수**만 조정할 뿐, **목표 비중은 불변** → 레짐 전환 시 알파 기여도 거의 0

**결론**: "S&P500을 매년 안정적으로 상회"는 현재 설계로 **달성 불가능**. 무료 제약 하에서도 **설계 재정의 시 달성 가능성이 존재**하는 영역이 있음.

---

## 2. 무료 제약 하 진짜 "맥시멈" (Ceiling) 재정의

### 2-1. 데이터 천장

| 항목 | 현 사용 | 무료 가용 맥시멈 | 여유분 |
|---|---|---|---|
| 가격 | KIS + Yahoo (일별) | + Stooq (일별·세계지수), Tiingo free (일별 5yr), Alpha Vantage free (25call/day) | 중 |
| 매크로 | FRED (실업·금리차) | + FRED 전체 (800K 시리즈: PMI, CPI, 회사채 스프레드, 신용스프레드, M2) | **대** |
| 센티먼트 | CNN F&G | + AAII 개인투자자 심리, NAAIM 활성매니저, Put/Call ratio (CBOE), COT 포지셔닝 | **대** |
| 밸류에이션 | 없음 | Shiller CAPE (free), S&P earnings yield vs 10Y, Fed Model | **대** |
| 뉴스/이벤트 | 없음 | 연준 FOMC 일정 (FRED), ECB, BOJ (RSS free) | 중 |
| 한국 시장 | KIS domestic | + 한국은행 ECOS API (free), KRX 시장별 외국인 수급 | 중 |

**판단: 매크로·센티먼트·밸류에이션은 현재 프로그램이 가용 데이터의 20% 미만만 사용 중.** 이 영역 확장이 가장 큰 레버리지.

### 2-2. 수익률 천장 (무료 제약·개인 계좌 가정)

학계 연구 + 무료 데이터로 재현 가능한 **실증된 전략**을 조합할 경우 기대 상한선:

| 전략 축 | 기대 연 알파 | 구현 난이도 | 현재 구현 |
|---|---|---|---|
| Time-series momentum (12M, multi-asset) | +1~2%p | 낮음 | ❌ (10M SMA만) |
| Cross-sectional momentum (ETF 섹터 rotation) | +1~2%p | 중간 | ❌ |
| Trend + Mean-reversion 혼합 (GARCH 없이 VIX 기반 regime) | +0.5~1%p | 중간 | ⚠️ 부분 |
| Valuation timing (CAPE percentile → equity band shift) | +0.5~1%p | 낮음 | ❌ |
| Risk parity / vol-targeting (equity sleeve 내부) | **+0~1%p (변동성 감소 ×2)** | 중간 | ❌ |
| Tax-loss harvesting (연금 계좌 특성상 적용 제한) | +0.1~0.3%p | 낮음 | ❌ |

**현실적 상한: S&P500 대비 장기 연 +1~3%p, 변동성 −30%.** 단, "매년 안정적 상회"는 학술적으로도 불가능(1~2년 drawdown은 불가피) — **3년 rolling 기준 상회**로 KPI 재정의 권장.

### 2-3. 운영 천장

- **Supabase free (500MB DB, 2GB bandwidth)**: 종목 20개 × 일별 5년 = 36K rows = 충분
- **Vercel free (100GB/mo, 10s timeout)**: 서버리스 cron 불가 → Supabase Scheduled Functions (free tier pg_cron) 사용하면 **일 1회 장 마감 후 배치** 가능
- **KIS 100 req/min**: 개인 20종목 일 1회 갱신은 여유
- **제약 맥시멈 활용도**: 현재 ~30%

---

## 3. 갭 분석 (현재 ↔ 천장)

### 🔴 Critical (S&P500 대비 알파 창출의 핵심 갭)

| # | 갭 | 현재 | 천장 | 영향 |
|---|---|---|---|---|
| C1 | **밸류에이션 기반 전략 전환 부재** | 9개 프리셋 고정 | CAPE percentile에 따라 equity 40~80% 동적 조정 | 장기 연 +0.5~1%p |
| C2 | **Cross-sectional momentum 없음** | 자산군 단위 SMA only | 11개 섹터 ETF 중 top 3 relative momentum | 장기 연 +1~2%p |
| C3 | **Volatility targeting 부재** | 고정 비중 | 실현 변동성 12% 타겟팅 (equity sleeve) | Sharpe +0.2~0.3 |
| C4 | **레짐 오버레이가 분할 횟수만 조정** | splitCount만 변화, target 불변 | VIX/yield/credit spread 종합 점수로 equity band ±20% 이동 | 하락장 MDD −30% |
| C5 | **백테스트의 overfitting 안전장치 취약** | Walk-forward IS/OOS=0.5 통과 기준 permissive | Deflated Sharpe, Combinatorial CV | 실전 이탈 예방 |

### 🟡 Important (정확도·신뢰성 — 기존 평가문서 수준)

| # | 갭 |
|---|---|
| I1 | 트랜잭션 레벨 손익 추적 부재 (스냅샷만) → 실제 성과 검증 불가 |
| I2 | 원가 기준 평가손익률 미표시 |
| I3 | 한국 연금 세제 (연금저축 연 600만 원 공제한도, 중도인출 페널티, 55세 연금수령개시) 미반영 |
| I4 | 데이터 출처·시각·폴백 상태 UI 노출 부족 |
| I5 | 단위 테스트 전무 (리밸런싱·리스크·손익 계산) |

### 🟢 Nice-to-have

| # | 갭 |
|---|---|
| N1 | Age-based glide path |
| N2 | 분할 매수 1회당 금액 만원 단위 정렬 |
| N3 | Excel 리포트 |
| N4 | 스케줄 이메일 |

### 🔵 알려진 런타임 버그 (운영 blocker)

- `api/vix.js`의 `./utils/kis-auth.js` 참조 누락 → **배포 시 serverless crash 위험**
- `src/App.jsx:78` `annualExpRet` 초기화 전 참조 → 초기 로드 crash 가능
- React.ErrorBoundary 부재 → 한 패널 오류가 전체 freeze

---

## 4. 천장 vs 현재 — 라이프사이클별 %

| 단계 | 현재 달성도 | 무료 천장 | 갭 폭 |
|---|---|---|---|
| (a) 시장 데이터 수집 | 60% | 90% | ▲▲ |
| (b) 레짐/매크로 | 35% | 85% | ▲▲▲ |
| (c) 자산 유니버스/스크리닝 | 20% | 70% | ▲▲▲ |
| (d) 포트폴리오 구성 | 50% | 85% | ▲▲ |
| (e) 리스크 관리 | 55% | 80% | ▲▲ |
| (f) 리밸런싱 | 65% | 85% | ▲ |
| (g) 주문 준비 (수동) | 55% | 75% | ▲ |
| (h) 사후 추적/손익 기여도 | **15%** | 75% | ▲▲▲▲ |
| (i) 리포팅 | 55% | 80% | ▲▲ |
| (j) 한국 연금 세제 | 25% | 70% | ▲▲▲ |

**가중 종합**: 현 **~45%** → 무료 천장 **~80%**. **약 35%p 개선 여지**.

---

## 5. 맥시멈 달성 로드맵 (임원 의사결정용)

임원 관점에서 "회사를 차려 이 프로그램으로 운용하겠다"면 아래 순서로 투자해야 함:

### Wave 1 — 운영 기반 (2주, 실사용 blocker 해소)
- B1 런타임 버그 3종 수정 (kis-auth, annualExpRet, ErrorBoundary)
- 리밸런싱·리스크·손익 계산 단위 테스트 (20개 내외)
- 데이터 출처/시각 UI 배지

### Wave 2 — 성과 검증 인프라 (3주, 알파 측정 전제)
- 트랜잭션 레벨 holdings_transactions 테이블 신설 (date, ticker, side, qty, price, fee)
- 원가 기준 실현/미실현 손익 계산 엔진
- S&P500·60/40 벤치마크 대비 rolling 1y/3y 초과수익 차트
- **이게 없으면 이후 알파 개선의 효과를 측정 불가**

### Wave 3 — 알파 생성 엔진 (4~6주, S&P500 상회 시도)
- C1 CAPE 기반 equity band 동적 조정 (Shiller 무료 API)
- C4 매크로 복합 점수 (VIX + yield + HY spread via FRED) → target weight 이동
- C3 변동성 타겟팅 (equity sleeve 내부, 12% annualized)
- C2 섹터 ETF relative momentum (선택: sleeve 20~30% 할당)
- Deflated Sharpe 기반 robustness 검증

### Wave 4 — 한국 연금 특화 (2주)
- 연금저축 연 납입한도·세액공제 추적
- IRP 위험자산 70% 경고 고도화 (현재 비중 + 주문 후 예상 비중)
- 55세 연금수령 개시 시뮬레이션

### Wave 5 — UX 연마 (2주)
- 만원 단위 주문 정렬, 분할 매수 근거 강화
- PDF에 성과 기여도·벤치마크 비교
- CSV/Excel 내보내기

**총 투자**: ~13~15주 1인 개발. **산출**: 연 +1~3%p 알파 기대 (벤치마크 대비), 변동성 −30%.

---

## 6. 임원 권고

1. **KPI 재정의 필수**: "매년 S&P500 상회"는 구조적으로 불가능. **"3년 rolling CAGR에서 S&P500 상회 + 변동성 70% 이하"**로 변경 권장.
2. **현재 프로그램은 리스크 관리 대시보드로는 채택 가능, 알파 엔진으로는 재설계 필요**. Wave 3가 핵심.
3. **Wave 2(성과 검증)를 Wave 3보다 먼저** — 측정할 수 없으면 개선할 수 없음. 현재는 실제 S&P500을 이기고 있는지 **검증 자체가 불가능**한 상태.
4. 무료 제약은 **알파 상한을 제한하지 않음** — FRED·Shiller·공공 데이터만으로 학계 문헌의 70% 이상 재현 가능. 병목은 데이터가 아니라 **설계**.
5. 임원 관점에서 가장 큰 리스크는 **백테스트 성과와 실전 괴리**. Deflated Sharpe + Walk-forward 강화 없이는 Wave 3 배포 금지.

---

## 검증 방법 (Wave별)

- Wave 1: `npm run build` 성공, 단위 테스트 통과, 각 패널 수동 클릭 시 crash 없음
- Wave 2: 과거 3개월 MTS 거래내역을 수동 입력 → 앱이 산출한 기간 수익률이 증권사 MTS 화면 수치와 ±0.1%p 이내 일치
- Wave 3: 2010~2024 백테스트에서 SPY 대비 rolling 3y 초과수익 > 0이 구간의 70% 이상, Deflated Sharpe > 0.5
- Wave 4: 납입한도 초과 시 UI 경고 재현 테스트
- Wave 5: PDF 리포트 생성 후 시각적 검수

---

## 참고 파일

- `pension-strategy/PROGRAM_EVALUATION.md` — 기존 보수적 평가 (개인 보조 도구 관점)
- `pension-strategy/src/services/momentumEngine.js` — 모멘텀 로직 (개선 C2 대상)
- `pension-strategy/src/services/rebalanceEngine.js:26-49` — splitCount 로직 (개선 C4 대상)
- `pension-strategy/src/services/riskEngine.js` — 리스크 엔진 (C3 vol targeting 추가 지점)
- `pension-strategy/src/services/walkForwardEngine.js` — robustness 검증 강화 대상
- `pension-strategy/api/momentum.js` — 매크로 데이터 확장 지점 (C1, C4)
- `pension-strategy/src/constants/index.js` — 9개 프리셋 정의 (동적 전환 대상)
