create table if not exists public.holdings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trade_date date not null,
  ticker text not null,
  name text,
  asset_class text not null,
  side text not null,
  quantity numeric not null default 0,
  price numeric not null default 0,
  fee numeric not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists holdings_transactions_user_date_idx
  on public.holdings_transactions (user_id, trade_date desc);
