alter table public.decision_logs enable row level security;

drop policy if exists decision_logs_select_own on public.decision_logs;
create policy decision_logs_select_own
  on public.decision_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists decision_logs_insert_own on public.decision_logs;
create policy decision_logs_insert_own
  on public.decision_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists decision_logs_update_own on public.decision_logs;
create policy decision_logs_update_own
  on public.decision_logs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists decision_logs_delete_own on public.decision_logs;
create policy decision_logs_delete_own
  on public.decision_logs
  for delete
  to authenticated
  using (auth.uid() = user_id);
