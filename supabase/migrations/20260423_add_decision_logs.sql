create table if not exists public.decision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  strategy_id text not null,
  account_type text,
  action_summary jsonb not null default '[]'::jsonb,
  decision_reasons jsonb not null default '[]'::jsonb,
  vix_level numeric,
  created_at timestamptz not null default now()
);

create index if not exists decision_logs_user_created_idx
  on public.decision_logs (user_id, created_at desc);
