create table if not exists public.decision_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.decision_logs
  add column if not exists user_id uuid,
  add column if not exists strategy_id text,
  add column if not exists account_type text,
  add column if not exists action_summary jsonb not null default '[]'::jsonb,
  add column if not exists decision_reasons jsonb not null default '[]'::jsonb,
  add column if not exists vix_level numeric,
  add column if not exists created_at timestamptz not null default now();

update public.decision_logs
set strategy_id = coalesce(strategy_id, 'unknown')
where strategy_id is null;

alter table public.decision_logs
  alter column strategy_id set not null;

create index if not exists decision_logs_user_created_idx
  on public.decision_logs (user_id, created_at desc);
