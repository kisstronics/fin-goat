# Fin Goat

Indian personal wealth + market intelligence app: stock screening, alerts, and a unified household net-worth tracker.

Mobile chrome matches the claw-bot / between pattern (phone-first column, hamburger menu, account sheet). Desktop keeps a centered app shell with the same flows.

## Stack

- **Client:** React 19 + TypeScript + Vite
- **Server:** NestJS + TypeScript
- **Database:** PostgreSQL (`fingoat`) via `DATABASE_URL`
- **Cron:** `@nestjs/schedule` (screeners every 10m, price jitter hourly, daily digest 8am)

## Quick start

```bash
cd fin-goat
cp .env.example .env          # set DATABASE_URL
cp client/.env.example client/.env   # optional VITE_API_URL
npm install
npm run dev
```

On first boot the server creates tables and seeds demo users, tickers, and holdings.

### Client env

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL (no trailing slash). Empty = same-origin / Vite proxy in local dev. |

Example: `VITE_API_URL=https://api.example.com`

### Vercel (client)

- Root directory: `client` (or deploy from `client/`)
- Build: `npm run build` · Output: `dist`
- `vercel.json` rewrites SPA routes (`/login`, `/about`, …) to `index.html`
- Set **`VITE_API_URL`** in Vercel env to your public API base URL (required in production; empty only works with the local Vite proxy)

- App: http://localhost:5174  
- API: http://localhost:3003  

Demo logins:

- `Demo Investor` / `demo@fingoat.app` — user portfolio
- `Fin Goat Admin` / `admin@fingoat.app` — admin console

### Google Sign-in

OAuth credentials live in Postgres table `app_settings` (not only env):

| key | purpose |
|---|---|
| `google_client_id` | Google OAuth client ID |
| `google_client_secret` | Google OAuth client secret |
| `google_callback_url` | e.g. `http://localhost:3003/auth/google/callback` |
| `google_enabled` | `true` / `false` |
| `allow_dev_login` | `true` / `false` |

Configure in **Admin → Sign-in**, or seed via `GOOGLE_*` env vars on first boot.

### Telegram notifications

Bot token and webhook live in `app_settings` (Admin → **Telegram**):

| key | purpose |
|---|---|
| `telegram_bot_token` | BotFather token |
| `telegram_webhook_url` | Public `POST /telegram/webhook` URL |
| `telegram_webhook_secret` | Optional shared secret header |
| `telegram_enabled` | `true` / `false` |

**User linking flow**

1. Save Telegram phone (with country code) in **Settings**
2. Open the bot and send `hi`
3. Share / type the same phone when asked — Fin Goat stores `chat_id`
4. Screener alerts are sent to that chat when Telegram notifications are on

Seed via `TELEGRAM_*` env vars on first boot, or edit anytime in the admin panel.

### Email notifications (SMTP)

SMTP lives in `app_settings` (Admin → **Email**). Templates are editable in Admin → **Email Templates**.

| key | purpose |
|---|---|
| `smtp_host` / `smtp_port` / `smtp_secure` | SMTP server |
| `smtp_user` / `smtp_pass` | Auth (pass never returned raw) |
| `smtp_from_name` / `smtp_from_email` | From header |
| `smtp_enabled` | `true` / `false` |

Templates (`screener_digest`, `nse_announcement`, `expense_reminder`, `test_email`) support `{{userName}}`, `{{title}}`, `{{body}}`, `{{symbol}}`, `{{appName}}`.

Seed via `SMTP_*` env vars on first boot, or configure in the admin panel. Use **Send test email** to verify delivery.

### Market data

- **Admin → Tickers → Sync all tickers** loads the full NSE equity master list (`EQUITY_L.csv`, ~2k–2.7k symbols) and starts Yahoo price refresh in the background
- **Refresh prices now** updates LTP for tickers already in the DB
- **Backfill 1Y history (batch)** stores ~1 year of daily OHLCV in `price_history` for ~25 tickers per run (also via cron every 20m). Opening a stock page loads 1Y on demand if missing
- Stock detail at `/market/:SYMBOL` (Overview, Sentiment, Forecasts, Financials, Peers, Holdings, Events, News)
- Hourly cron pulls LTP + SMA50/SMA200 + 52W range from Yahoo Finance chart API (`*.NS`, free / delayed)
- If the NSE CSV fetch fails, sync falls back to a curated liquid universe (~100 names)

## MVP (this repo)

### User

- **Dashboard** — net worth, allocation, returns, action center
- **My Portfolio** — stocks, MFs, EPFO, FD, gold, real estate, cash lending, loans (create/edit/delete)
- **Recurring** — regular income & expenses, net-worth projection by future month/year
- **Screeners** — paginated, sortable, filterable stock matches
  - Golden Cross Over
  - Near 52 Week Low
  - Above 50% recovery from 52W low
- **Settings** — plans, email / Telegram notifications, phone

### Admin

- Users
- Stock ticker management (CRN + NSE/BSE params; full NSE equity sync)
- Plans
- Features (feature flags)
- Sign-in (Google OAuth)
- Email (SMTP) + Email Templates
- Telegram
- Cron run history + on/off controls (master + per job)

## Product notes

See `perplexity_plan.md` for the fuller product vision (family portfolios, tax, custom screeners, UPI billing, compliance).

Screeners are analytical tools — not buy/sell recommendations.

## Requirements snapshot

- Admin Pages
  - Users
  - Stock Ticker management (all key stock parameters / CRN; full NSE sync)
  - Plans
  - Features
    - Golden Cross Over
    - Near 52 Week Low
    - Above 50% low from 52W High
  - Email (SMTP) + Email Templates
  - Cron (master + per-job on/off, run history)
- User
  - Settings (Plans, Email, Telegram, phone)
  - My Portfolio
  - Screeners
  - Personal Investment Tracker (real estate, gold, MFs, EPFO, FD, cash lending)
  - Dashboard (all investments in one glance)
