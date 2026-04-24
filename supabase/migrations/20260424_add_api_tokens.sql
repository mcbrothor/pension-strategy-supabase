-- KIS 등 외부 API 토큰을 서버리스 함수 간 공유 캐시로 저장합니다.
-- 콜드 스타트마다 신규 발급하지 않고, 만료 전까지 기존 토큰을 재사용합니다.

create table if not exists public.api_tokens (
  service_name text primary key,
  token        text        not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

-- RLS 활성화
alter table public.api_tokens enable row level security;

-- 서버리스 함수(anon key)에서 읽기·쓰기 허용
-- 이 테이블은 브라우저에서 직접 접근하지 않으며, KIS 토큰 공유 캐시 용도로만 사용됩니다.
create policy "anon can read api_tokens" on public.api_tokens
  for select using (true);

create policy "anon can upsert api_tokens" on public.api_tokens
  for insert with check (true);

create policy "anon can update api_tokens" on public.api_tokens
  for update using (true) with check (true);
