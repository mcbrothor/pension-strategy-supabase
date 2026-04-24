alter table public.holdings_transactions enable row level security;

drop policy if exists holdings_transactions_select_own on public.holdings_transactions;
create policy holdings_transactions_select_own
  on public.holdings_transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists holdings_transactions_insert_own on public.holdings_transactions;
create policy holdings_transactions_insert_own
  on public.holdings_transactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists holdings_transactions_update_own on public.holdings_transactions;
create policy holdings_transactions_update_own
  on public.holdings_transactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists holdings_transactions_delete_own on public.holdings_transactions;
create policy holdings_transactions_delete_own
  on public.holdings_transactions
  for delete
  to authenticated
  using (auth.uid() = user_id);
