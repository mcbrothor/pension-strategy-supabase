# Schema Changes

## Summary
- Current app storage is centered on Supabase tables for holdings, snapshots, config, asset history, transactions, decisions, market metadata, and API tokens.
- `holdings_transactions` is now a first-class table and is required for transaction-based realized/unrealized PnL reporting.

## Required Tables

### `holdings`
- Purpose: current portfolio holdings snapshot per user.
- Used by: `src/context/PortfolioContext.jsx`
- Expected columns:
  - `id`
  - `user_id`
  - `ticker`
  - `name`
  - `asset_class`
  - `quantity`
  - `current_price`
  - `cost_amt`
  - `amount`
  - `updated_at`

### `snapshots`
- Purpose: daily portfolio total and weight history.
- Used by: `src/context/PortfolioContext.jsx`
- Expected columns:
  - `id`
  - `user_id`
  - `date`
  - `strategy_id`
  - `total_amt`
  - `weights`

### `config`
- Purpose: per-user app configuration and retirement/allocation policy state.
- Used by: `src/context/PortfolioContext.jsx`
- Expected columns:
  - `user_id`
  - `strategy_id`
  - `evaluation_amount`
  - `evaluation_updated_at`
  - `principal_total`
  - `principal_updated_at`
  - `retirement_plan`
  - `allocation_policy`
  - `strategy_overlay`

### `asset_history`
- Purpose: stored price and amount history for holdings or portfolio analytics.
- Used by: `src/context/PortfolioContext.jsx`
- Expected columns:
  - `id`
  - `user_id`
  - `ticker`
  - `date`
  - `price`
  - `amount`

### `holdings_transactions`
- Purpose: transaction ledger for realized PnL, fees, and transaction-aware performance.
- Used by: `src/context/PortfolioContext.jsx`, `src/services/transactionEngine.js`
- Minimum columns:
  - `id`
  - `user_id`
  - `trade_date`
  - `ticker`
  - `name`
  - `asset_class`
  - `side`
  - `quantity`
  - `price`
  - `fee`
  - `memo`
  - `created_at`

### `decision_logs`
- Purpose: store order-plan decisions and execution notes.
- Used by: `src/components/panels/OrderPlanPanel.jsx`
- Expected columns:
  - `id`
  - `user_id`
  - `strategy_id`
  - `account_type`
  - `action_summary`
  - `decision_reasons`
  - `vix_level`
  - `created_at`

### `stock_master`
- Purpose: metadata lookup for market instruments.
- Used by: `src/context/MarketContext.jsx`
- Expected columns:
  - `ticker`
  - `name`
  - `asset_class`
  - `market`

### `api_tokens`
- Purpose: store encrypted external API credentials.
- Used by: `api/_lib/token-storage.js`
- Expected columns:
  - `provider`
  - `access_token`
  - `refresh_token`
  - `expires_at`
  - `updated_at`

## Suggested SQL

```sql
create table if not exists holdings_transactions (
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
  on holdings_transactions (user_id, trade_date desc);
```

## Notes
- `strategy_overlay` is persisted in app state and should also be persisted in `config` for consistent fixed-strategy reload behavior.
- Migration files added in `supabase/migrations/`:
  - `20260423_add_holdings_transactions.sql`
  - `20260423_add_decision_logs.sql`
  - `20260423_add_config_portfolio_state.sql`
- If Row Level Security is enabled, all tables above need user-scoped policies keyed by `auth.uid() = user_id` where applicable.
- Existing local-storage fallback remains supported when Supabase is unavailable, but reporting accuracy is best when all transaction rows are synced.
