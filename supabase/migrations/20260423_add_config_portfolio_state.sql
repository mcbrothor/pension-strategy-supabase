alter table public.config
  add column if not exists allocation_policy jsonb,
  add column if not exists retirement_plan jsonb,
  add column if not exists strategy_overlay jsonb,
  add column if not exists updated_at timestamptz;
