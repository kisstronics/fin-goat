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

### Market data

- **Admin → Tickers → Sync all tickers** loads the NSE liquid universe and prices them
- **Refresh prices now** updates LTP for tickers already in the DB
- Hourly cron pulls LTP + SMA50/SMA200 + 52W range from Yahoo Finance chart API (`*.NS`, free / delayed)

## MVP (this repo)

### User

- **Dashboard** — net worth, allocation, returns, action center
- **My Portfolio** — stocks, MFs, EPFO, FD, gold, real estate, cash lending, loans
- **Screeners**
  - Golden Cross Over
  - Near 52 Week Low
  - Above 50% recovery from 52W low
- **Settings** — plans, email / Telegram notifications, phone

### Admin

- Users
- Stock ticker management (CRN + NSE/BSE params)
- Plans
- Features (feature flags)
- Cron run history

## Product notes

See `perplexity_plan.md` for the fuller product vision (family portfolios, tax, custom screeners, UPI billing, compliance).

Screeners are analytical tools — not buy/sell recommendations.

## Requirements snapshot

- Admin Pages
  - Users
  - Stock Ticker management (all key stock parameters / CRN)
  - Plans
  - Features
    - Golden Cross Over
    - Near 52 Week Low
    - Above 50% low from 52W High
- User
  - Settings (Plans, Email, Telegram, phone)
  - My Portfolio
  - Screeners
  - Personal Investment Tracker (real estate, gold, MFs, EPFO, FD, cash lending)
  - Dashboard (all investments in one glance)
