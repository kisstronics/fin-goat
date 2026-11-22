import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';
import { v4 as uuid } from 'uuid';
import { DEFAULT_EMAIL_TEMPLATES } from '../email/default-templates';
import {
  seedFeatures,
  seedHoldings,
  seedPlans,
  seedTickers,
  seedUsers,
  seedWatchlists,
} from './seed';
import type {
  AlertLog,
  AnnouncementAlertStock,
  AppSetting,
  CronJobKey,
  CronJobSetting,
  CronRun,
  CronSettings,
  EmailTemplate,
  EmailTemplateKey,
  FeatureFlag,
  GoogleAuthSettings,
  Holding,
  NseAnnouncement,
  Plan,
  PlanId,
  PriceBar,
  RecurringItem,
  ScreenerKey,
  ScreenerResult,
  SmtpSettings,
  TelegramSettings,
  Ticker,
  User,
  WatchlistItem,
} from './types';

const CRON_JOB_META: Record<
  CronJobKey,
  {
    name: string;
    schedule: string;
    expression: string;
    description: string;
    settingKey: string;
    expressionKey: string;
  }
> = {
  screener_10m: {
    name: 'Screener scan',
    schedule: 'Every 10 minutes',
    expression: '*/10 * * * *',
    description: 'Runs all enabled screeners and queues alerts.',
    settingKey: 'cron_screener_10m_enabled',
    expressionKey: 'cron_screener_10m_expr',
  },
  price_refresh: {
    name: 'Yahoo LTP refresh',
    schedule: 'Every hour',
    expression: '0 * * * *',
    description: 'Refreshes ticker prices, then re-runs screeners.',
    settingKey: 'cron_price_refresh_enabled',
    expressionKey: 'cron_price_refresh_expr',
  },
  history_backfill: {
    name: '1Y price history backfill',
    schedule: 'Every 20 minutes',
    expression: '*/20 * * * *',
    description:
      'Loads ~1 year of daily OHLCV into price_history in small batches (not all tickers at once).',
    settingKey: 'cron_history_backfill_enabled',
    expressionKey: 'cron_history_backfill_expr',
  },
  daily_digest: {
    name: 'Daily digest',
    schedule: 'Every day at 8:00',
    expression: '0 8 * * *',
    description: 'Sends screener digest alerts to opted-in users.',
    settingKey: 'cron_daily_digest_enabled',
    expressionKey: 'cron_daily_digest_expr',
  },
  expense_reminders: {
    name: 'Expense deduction reminders',
    schedule: 'Every day at 7:00',
    expression: '0 7 * * *',
    description:
      'Notifies users about expenses due today (by scheduled deduction date).',
    settingKey: 'cron_expense_reminders_enabled',
    expressionKey: 'cron_expense_reminders_expr',
  },
  nse_announcements: {
    name: 'NSE announcements',
    schedule: 'Every 15 minutes',
    expression: '*/15 * * * *',
    description:
      'Pulls day-old NSE corporate announcements, stores new filings, and alerts users who watch those stocks.',
    settingKey: 'cron_nse_announcements_enabled',
    expressionKey: 'cron_nse_announcements_expr',
  },
};

function describeCronExpression(expression: string, fallback: string) {
  const trimmed = expression.trim();
  const known: Record<string, string> = {
    '*/10 * * * *': 'Every 10 minutes',
    '*/5 * * * *': 'Every 5 minutes',
    '*/15 * * * *': 'Every 15 minutes',
    '*/30 * * * *': 'Every 30 minutes',
    '0 * * * *': 'Every hour',
    '0 */2 * * *': 'Every 2 hours',
    '0 8 * * *': 'Every day at 8:00',
    '0 7 * * *': 'Every day at 7:00',
    '0 9 * * *': 'Every day at 9:00',
    '0 18 * * *': 'Every day at 18:00',
  };
  return known[trimmed] || fallback || `Cron: ${trimmed}`;
}

@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StoreService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const connectionString = this.config.get<string>('DATABASE_URL')?.trim();
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Fin Goat persistence');
    }

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 8,
    });

    await this.pool.query('SELECT 1');
    await this.migrate();
    await this.seedIfEmpty();
    this.logger.log('PostgreSQL connected (database: fingoat)');
  }

  async onModuleDestroy() {
    if (this.pool) await this.pool.end();
  }

  private async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) {
    return this.pool.query<T>(text, params);
  }

  private async migrate() {
    await this.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await this.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price_inr NUMERIC NOT NULL DEFAULT 0,
        features JSONB NOT NULL DEFAULT '[]'::jsonb,
        limits JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        telegram_chat_id TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'free',
        notify_email BOOLEAN NOT NULL DEFAULT TRUE,
        notify_telegram BOOLEAN NOT NULL DEFAULT FALSE,
        provider TEXT NOT NULL DEFAULT 'dev',
        picture TEXT,
        google_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS feature_flags (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        plans JSONB NOT NULL DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS tickers (
        id UUID PRIMARY KEY,
        crn TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL DEFAULT 'NSE',
        name TEXT NOT NULL,
        sector TEXT NOT NULL DEFAULT 'Other',
        industry TEXT NOT NULL DEFAULT 'Other',
        isin TEXT,
        price NUMERIC NOT NULL DEFAULT 0,
        prev_close NUMERIC NOT NULL DEFAULT 0,
        sma50 NUMERIC NOT NULL DEFAULT 0,
        sma200 NUMERIC NOT NULL DEFAULT 0,
        high52w NUMERIC NOT NULL DEFAULT 0,
        low52w NUMERIC NOT NULL DEFAULT 0,
        volume BIGINT NOT NULL DEFAULT 0,
        market_cap_cr NUMERIC NOT NULL DEFAULT 0,
        pe NUMERIC,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (symbol, exchange)
      );

      CREATE TABLE IF NOT EXISTS holdings (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL,
        name TEXT NOT NULL,
        ticker_id UUID REFERENCES tickers(id) ON DELETE SET NULL,
        quantity NUMERIC,
        avg_cost NUMERIC,
        current_value NUMERIC NOT NULL DEFAULT 0,
        invested_value NUMERIC NOT NULL DEFAULT 0,
        notes TEXT,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS watchlists (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticker_id UUID NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, ticker_id)
      );

      CREATE TABLE IF NOT EXISTS screener_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker_id UUID NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
        screener TEXT NOT NULL,
        matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cron_runs (
        id UUID PRIMARY KEY,
        job TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'running',
        detail TEXT
      );

      CREATE TABLE IF NOT EXISTS recurring_items (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        amount NUMERIC NOT NULL DEFAULT 0,
        frequency TEXT NOT NULL DEFAULT 'monthly',
        day_of_month INT,
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS nse_announcements (
        id UUID PRIMARY KEY,
        seq_id TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        company_name TEXT NOT NULL DEFAULT '',
        isin TEXT,
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        attachment_url TEXT,
        attachment_size TEXT,
        announced_at TIMESTAMPTZ,
        sort_date TIMESTAMPTZ,
        industry TEXT,
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS announcement_alert_stocks (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticker_id UUID NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, ticker_id)
      );

      CREATE TABLE IF NOT EXISTS email_templates (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_history (
        ticker_id UUID NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
        trade_date DATE NOT NULL,
        open NUMERIC NOT NULL DEFAULT 0,
        high NUMERIC NOT NULL DEFAULT 0,
        low NUMERIC NOT NULL DEFAULT 0,
        close NUMERIC NOT NULL DEFAULT 0,
        volume BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (ticker_id, trade_date)
      );

      CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_screener_results_key ON screener_results(screener, matched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON cron_runs(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_items(user_id, kind);
      CREATE INDEX IF NOT EXISTS idx_nse_announcements_symbol
        ON nse_announcements(symbol, announced_at DESC);
      CREATE INDEX IF NOT EXISTS idx_nse_announcements_announced
        ON nse_announcements(announced_at DESC);
      CREATE INDEX IF NOT EXISTS idx_announcement_alert_user
        ON announcement_alert_stocks(user_id);
      CREATE INDEX IF NOT EXISTS idx_price_history_date
        ON price_history(trade_date DESC);
    `);

    await this.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'dev';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
    `);

    await this.ensureAppSettings();
    await this.ensureEmailTemplates();
  }

  private async ensureAppSettings() {
    const defaults: Record<string, string> = {
      google_client_id: this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || '',
      google_client_secret:
        this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim() || '',
      google_callback_url:
        this.config.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
        'http://localhost:3003/auth/google/callback',
      google_enabled: 'false',
      allow_dev_login: 'true',
      telegram_bot_token:
        this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() || '',
      telegram_webhook_url:
        this.config.get<string>('TELEGRAM_WEBHOOK_URL')?.trim() ||
        'http://localhost:3003/telegram/webhook',
      telegram_webhook_secret:
        this.config.get<string>('TELEGRAM_WEBHOOK_SECRET')?.trim() || '',
      telegram_bot_username: '',
      telegram_enabled: this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim()
        ? 'true'
        : 'false',
      smtp_host: this.config.get<string>('SMTP_HOST')?.trim() || '',
      smtp_port: this.config.get<string>('SMTP_PORT')?.trim() || '587',
      smtp_secure: this.config.get<string>('SMTP_SECURE')?.trim() || 'false',
      smtp_user: this.config.get<string>('SMTP_USER')?.trim() || '',
      smtp_pass: this.config.get<string>('SMTP_PASS')?.trim() || '',
      smtp_from_name:
        this.config.get<string>('SMTP_FROM_NAME')?.trim() || 'Fin Goat',
      smtp_from_email: this.config.get<string>('SMTP_FROM_EMAIL')?.trim() || '',
      smtp_enabled: this.config.get<string>('SMTP_HOST')?.trim()
        ? 'true'
        : 'false',
      cron_master_enabled: 'true',
      cron_screener_10m_enabled: 'true',
      cron_price_refresh_enabled: 'true',
      cron_history_backfill_enabled: 'true',
      cron_daily_digest_enabled: 'true',
      cron_screener_10m_expr: CRON_JOB_META.screener_10m.expression,
      cron_price_refresh_expr: CRON_JOB_META.price_refresh.expression,
      cron_history_backfill_expr: CRON_JOB_META.history_backfill.expression,
      cron_daily_digest_expr: CRON_JOB_META.daily_digest.expression,
      cron_expense_reminders_enabled: 'true',
      cron_expense_reminders_expr: CRON_JOB_META.expense_reminders.expression,
      cron_nse_announcements_enabled: 'true',
      cron_nse_announcements_expr: CRON_JOB_META.nse_announcements.expression,
    };

    for (const [key, value] of Object.entries(defaults)) {
      await this.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO NOTHING`,
        [key, value],
      );
    }

    // Auto-enable Google when credentials exist and flag was never flipped on.
    const clientId = await this.getSetting('google_client_id');
    const clientSecret = await this.getSetting('google_client_secret');
    const enabled = await this.getSetting('google_enabled');
    if (clientId && clientSecret && enabled !== 'true') {
      const fromEnv = Boolean(
        this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() &&
          this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim(),
      );
      if (fromEnv) {
        await this.setSetting('google_enabled', 'true');
      }
    }
  }

  private async ensureEmailTemplates() {
    for (const tpl of DEFAULT_EMAIL_TEMPLATES) {
      await this.query(
        `INSERT INTO email_templates
           (key, name, description, subject, body_html, body_text, enabled, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
         ON CONFLICT (key) DO NOTHING`,
        [
          tpl.key,
          tpl.name,
          tpl.description,
          tpl.subject,
          tpl.bodyHtml,
          tpl.bodyText,
        ],
      );
    }
  }

  private async seedIfEmpty() {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users',
    );
    if (Number(rows[0]?.count || 0) > 0) {
      this.logger.log('Seed skipped — users already present');
      return;
    }

    this.logger.log('Seeding fingoat database…');

    for (const plan of seedPlans()) {
      await this.query(
        `INSERT INTO plans (id, name, price_inr, features, limits)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          plan.id,
          plan.name,
          plan.priceInr,
          JSON.stringify(plan.features),
          JSON.stringify(plan.limits),
        ],
      );
    }

    for (const feature of seedFeatures()) {
      await this.query(
        `INSERT INTO feature_flags (key, name, enabled, plans)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (key) DO NOTHING`,
        [
          feature.key,
          feature.name,
          feature.enabled,
          JSON.stringify(feature.plans),
        ],
      );
    }

    for (const user of seedUsers()) {
      await this.query(
        `INSERT INTO users (
           id, email, name, phone, telegram_chat_id, role, plan_id,
           notify_email, notify_telegram, provider, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'dev',$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          user.id,
          user.email,
          user.name,
          user.phone || null,
          user.telegramChatId || null,
          user.role,
          user.planId,
          user.notifyEmail,
          user.notifyTelegram,
          user.createdAt,
        ],
      );
    }

    for (const ticker of seedTickers()) {
      await this.insertTicker(ticker);
    }

    for (const holding of seedHoldings()) {
      await this.insertHolding(holding);
    }

    for (const item of seedWatchlists()) {
      await this.query(
        `INSERT INTO watchlists (id, user_id, ticker_id, created_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, ticker_id) DO NOTHING`,
        [item.id, item.userId, item.tickerId, item.createdAt],
      );
    }

    this.logger.log('Seed complete');
  }

  private mapUser(row: QueryResultRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone || undefined,
      telegramChatId: row.telegram_chat_id || undefined,
      role: row.role,
      planId: row.plan_id,
      notifyEmail: row.notify_email,
      notifyTelegram: row.notify_telegram,
      provider: row.provider || 'dev',
      picture: row.picture || undefined,
      googleId: row.google_id || undefined,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapPlan(row: QueryResultRow): Plan {
    return {
      id: row.id,
      name: row.name,
      priceInr: Number(row.price_inr),
      features: row.features || [],
      limits: row.limits || { alertsPerDay: 0, holdings: 0, watchlists: 0 },
    };
  }

  private mapFeature(row: QueryResultRow): FeatureFlag {
    return {
      key: row.key,
      name: row.name,
      enabled: row.enabled,
      plans: row.plans || [],
    };
  }

  private mapTicker(row: QueryResultRow): Ticker {
    return {
      id: row.id,
      crn: row.crn,
      symbol: row.symbol,
      exchange: row.exchange,
      name: row.name,
      sector: row.sector,
      industry: row.industry,
      isin: row.isin || undefined,
      price: Number(row.price),
      prevClose: Number(row.prev_close),
      sma50: Number(row.sma50),
      sma200: Number(row.sma200),
      high52w: Number(row.high52w),
      low52w: Number(row.low52w),
      volume: Number(row.volume),
      marketCapCr: Number(row.market_cap_cr),
      pe: row.pe == null ? undefined : Number(row.pe),
      active: row.active,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapHolding(row: QueryResultRow): Holding {
    return {
      id: row.id,
      userId: row.user_id,
      assetType: row.asset_type,
      name: row.name,
      tickerId: row.ticker_id || undefined,
      quantity: row.quantity == null ? undefined : Number(row.quantity),
      avgCost: row.avg_cost == null ? undefined : Number(row.avg_cost),
      currentValue: Number(row.current_value),
      investedValue: Number(row.invested_value),
      notes: row.notes || undefined,
      meta: row.meta || undefined,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapWatchlist(row: QueryResultRow): WatchlistItem {
    return {
      id: row.id,
      userId: row.user_id,
      tickerId: row.ticker_id,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapScreenerResult(row: QueryResultRow): ScreenerResult {
    return {
      tickerId: row.ticker_id,
      screener: row.screener,
      matchedAt: new Date(row.matched_at).toISOString(),
      reason: row.reason,
    };
  }

  private mapAlert(row: QueryResultRow): AlertLog {
    return {
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      title: row.title,
      body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
      status: row.status,
    };
  }

  private mapCronRun(row: QueryResultRow): CronRun {
    return {
      id: row.id,
      job: row.job,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: row.finished_at
        ? new Date(row.finished_at).toISOString()
        : undefined,
      status: row.status,
      detail: row.detail || undefined,
    };
  }

  private mapRecurring(row: QueryResultRow): RecurringItem {
    return {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      name: row.name,
      category: row.category || 'general',
      amount: Number(row.amount),
      frequency: row.frequency || 'monthly',
      dayOfMonth: row.day_of_month == null ? undefined : Number(row.day_of_month),
      notes: row.notes || undefined,
      active: Boolean(row.active),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapNseAnnouncement(row: QueryResultRow): NseAnnouncement {
    return {
      id: row.id,
      seqId: row.seq_id,
      symbol: row.symbol,
      companyName: row.company_name || '',
      isin: row.isin || undefined,
      subject: row.subject || '',
      body: row.body || '',
      attachmentUrl: row.attachment_url || undefined,
      attachmentSize: row.attachment_size || undefined,
      announcedAt: row.announced_at
        ? new Date(row.announced_at).toISOString()
        : undefined,
      sortDate: row.sort_date
        ? new Date(row.sort_date).toISOString()
        : undefined,
      industry: row.industry || undefined,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapAnnouncementAlertStock(row: QueryResultRow): AnnouncementAlertStock {
    return {
      id: row.id,
      userId: row.user_id,
      tickerId: row.ticker_id,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private async insertTicker(ticker: Ticker) {
    await this.query(
      `INSERT INTO tickers (
         id, crn, symbol, exchange, name, sector, industry, isin,
         price, prev_close, sma50, sma200, high52w, low52w, volume,
         market_cap_cr, pe, active, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        ticker.id,
        ticker.crn,
        ticker.symbol,
        ticker.exchange,
        ticker.name,
        ticker.sector,
        ticker.industry,
        ticker.isin || null,
        ticker.price,
        ticker.prevClose,
        ticker.sma50,
        ticker.sma200,
        ticker.high52w,
        ticker.low52w,
        ticker.volume,
        ticker.marketCapCr,
        ticker.pe ?? null,
        ticker.active,
        ticker.updatedAt,
      ],
    );
  }

  private async insertHolding(holding: Holding) {
    await this.query(
      `INSERT INTO holdings (
         id, user_id, asset_type, name, ticker_id, quantity, avg_cost,
         current_value, invested_value, notes, meta, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       ON CONFLICT (id) DO NOTHING`,
      [
        holding.id,
        holding.userId,
        holding.assetType,
        holding.name,
        holding.tickerId || null,
        holding.quantity ?? null,
        holding.avgCost ?? null,
        holding.currentValue,
        holding.investedValue,
        holding.notes || null,
        JSON.stringify(holding.meta || {}),
        holding.updatedAt,
      ],
    );
  }

  // ——— Users ———

  async listUsers(): Promise<User[]> {
    const { rows } = await this.query(
      'SELECT * FROM users ORDER BY created_at ASC',
    );
    return rows.map((r) => this.mapUser(r));
  }

  async findUserById(id: string): Promise<User | null> {
    const { rows } = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async findUserByEmailOrName(q: string): Promise<User | null> {
    const { rows } = await this.query(
      `SELECT * FROM users
       WHERE lower(email) = $1 OR lower(name) = $1
       LIMIT 1`,
      [q],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async findUserByPhone(phone: string): Promise<User | null> {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    const { rows } = await this.query(
      `SELECT * FROM users
       WHERE phone IS NOT NULL AND phone <> ''
         AND regexp_replace(phone, '\\D', '', 'g') = $1
       LIMIT 1`,
      [digits],
    );
    if (rows[0]) return this.mapUser(rows[0]);

    // Soft match: last 8–10 digits (country-code variants).
    const { rows: all } = await this.query(
      `SELECT * FROM users WHERE phone IS NOT NULL AND phone <> ''`,
    );
    for (const row of all) {
      const stored = String(row.phone || '').replace(/\D/g, '');
      if (this.samePhone(stored, digits)) return this.mapUser(row);
    }
    return null;
  }

  async findUserByTelegramChatId(chatId: string): Promise<User | null> {
    const { rows } = await this.query(
      'SELECT * FROM users WHERE telegram_chat_id = $1 LIMIT 1',
      [chatId],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  /** Require both phone and chat_id — used for outbound Telegram delivery. */
  async findUserByPhoneAndChatId(
    phone: string,
    chatId?: string,
  ): Promise<User | null> {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;

    const byPhone = await this.findUserByPhone(digits);
    if (!byPhone?.phone || !byPhone.telegramChatId) return null;
    if (chatId && String(byPhone.telegramChatId) !== String(chatId)) {
      return null;
    }
    return byPhone;
  }

  private samePhone(left: string, right: string): boolean {
    if (left === right) return true;
    const [short, long] =
      left.length <= right.length ? [left, right] : [right, left];
    if (short.length < 8 || long.length - short.length > 3) return false;
    return long.endsWith(short);
  }

  async createUser(user: User): Promise<User> {
    await this.query(
      `INSERT INTO users (
         id, email, name, phone, telegram_chat_id, role, plan_id,
         notify_email, notify_telegram, provider, picture, google_id, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        user.id,
        user.email,
        user.name,
        user.phone || null,
        user.telegramChatId || null,
        user.role,
        user.planId,
        user.notifyEmail,
        user.notifyTelegram,
        user.provider || 'dev',
        user.picture || null,
        user.googleId || null,
        user.createdAt,
      ],
    );
    return user;
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    const { rows } = await this.query(
      'SELECT * FROM users WHERE google_id = $1 LIMIT 1',
      [googleId],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async upsertGoogleUser(profile: {
    id: string;
    emails?: { value: string }[];
    displayName?: string;
    photos?: { value: string }[];
  }): Promise<User> {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) throw new Error('Google profile has no email');
    const name = profile.displayName || email.split('@')[0];
    const picture = profile.photos?.[0]?.value;

    const byGoogle = await this.findUserByGoogleId(profile.id);
    if (byGoogle) {
      await this.query(
        `UPDATE users SET name=$2, picture=$3, provider='google', email=$4 WHERE id=$1`,
        [byGoogle.id, name, picture || null, email],
      );
      return (await this.findUserById(byGoogle.id))!;
    }

    const byEmail = await this.findUserByEmailOrName(email);
    if (byEmail) {
      await this.query(
        `UPDATE users SET google_id=$2, picture=$3, provider='google', name=$4 WHERE id=$1`,
        [byEmail.id, profile.id, picture || null, name],
      );
      return (await this.findUserById(byEmail.id))!;
    }

    const user: User = {
      id: uuid(),
      email,
      name,
      role: 'user',
      planId: 'free',
      notifyEmail: true,
      notifyTelegram: false,
      provider: 'google',
      picture,
      googleId: profile.id,
      createdAt: new Date().toISOString(),
    };
    return this.createUser(user);
  }

  // ——— App settings ———

  async getSetting(key: string): Promise<string> {
    const { rows } = await this.query<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = $1',
      [key],
    );
    return rows[0]?.value ?? '';
  }

  async setSetting(key: string, value: string): Promise<AppSetting> {
    await this.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value],
    );
    return {
      key,
      value,
      updatedAt: new Date().toISOString(),
    };
  }

  async listAppSettings(): Promise<AppSetting[]> {
    const { rows } = await this.query(
      'SELECT key, value, updated_at FROM app_settings ORDER BY key',
    );
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async getGoogleAuthSettings(): Promise<GoogleAuthSettings> {
    const [clientId, clientSecret, callbackUrl, enabled, allowDevLogin] =
      await Promise.all([
        this.getSetting('google_client_id'),
        this.getSetting('google_client_secret'),
        this.getSetting('google_callback_url'),
        this.getSetting('google_enabled'),
        this.getSetting('allow_dev_login'),
      ]);
    return {
      clientId,
      clientSecret,
      callbackUrl:
        callbackUrl || 'http://localhost:3003/auth/google/callback',
      enabled: enabled === 'true' && Boolean(clientId && clientSecret),
      allowDevLogin: allowDevLogin !== 'false',
    };
  }

  async updateGoogleAuthSettings(
    patch: Partial<{
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
      enabled: boolean;
      allowDevLogin: boolean;
    }>,
  ): Promise<GoogleAuthSettings> {
    if (patch.clientId !== undefined) {
      await this.setSetting('google_client_id', patch.clientId.trim());
    }
    if (patch.clientSecret !== undefined) {
      // Keep existing secret when UI sends blank (masked field).
      if (patch.clientSecret.trim()) {
        await this.setSetting('google_client_secret', patch.clientSecret.trim());
      }
    }
    if (patch.callbackUrl !== undefined) {
      await this.setSetting('google_callback_url', patch.callbackUrl.trim());
    }
    if (patch.enabled !== undefined) {
      await this.setSetting('google_enabled', patch.enabled ? 'true' : 'false');
    }
    if (patch.allowDevLogin !== undefined) {
      await this.setSetting(
        'allow_dev_login',
        patch.allowDevLogin ? 'true' : 'false',
      );
    }
    return this.getGoogleAuthSettings();
  }

  async getTelegramSettings(): Promise<TelegramSettings> {
    const [botToken, webhookUrl, webhookSecret, botUsername, enabled] =
      await Promise.all([
        this.getSetting('telegram_bot_token'),
        this.getSetting('telegram_webhook_url'),
        this.getSetting('telegram_webhook_secret'),
        this.getSetting('telegram_bot_username'),
        this.getSetting('telegram_enabled'),
      ]);
    return {
      botToken,
      webhookUrl,
      webhookSecret,
      botUsername,
      enabled: enabled === 'true' && Boolean(botToken),
    };
  }

  async updateTelegramSettings(
    patch: Partial<{
      botToken: string;
      webhookUrl: string;
      webhookSecret: string;
      enabled: boolean;
    }>,
  ): Promise<TelegramSettings> {
    if (patch.botToken !== undefined) {
      if (patch.botToken.trim()) {
        await this.setSetting('telegram_bot_token', patch.botToken.trim());
      }
    }
    if (patch.webhookUrl !== undefined) {
      await this.setSetting('telegram_webhook_url', patch.webhookUrl.trim());
    }
    if (patch.webhookSecret !== undefined) {
      if (patch.webhookSecret.trim()) {
        await this.setSetting(
          'telegram_webhook_secret',
          patch.webhookSecret.trim(),
        );
      }
    }
    if (patch.enabled !== undefined) {
      await this.setSetting(
        'telegram_enabled',
        patch.enabled ? 'true' : 'false',
      );
    }
    return this.getTelegramSettings();
  }

  async getSmtpSettings(): Promise<SmtpSettings> {
    const [host, port, secure, user, pass, fromName, fromEmail, enabled] =
      await Promise.all([
        this.getSetting('smtp_host'),
        this.getSetting('smtp_port'),
        this.getSetting('smtp_secure'),
        this.getSetting('smtp_user'),
        this.getSetting('smtp_pass'),
        this.getSetting('smtp_from_name'),
        this.getSetting('smtp_from_email'),
        this.getSetting('smtp_enabled'),
      ]);
    const parsedPort = Number(port);
    return {
      host,
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587,
      secure: secure === 'true',
      user,
      pass,
      fromName: fromName || 'Fin Goat',
      fromEmail,
      enabled: enabled === 'true' && Boolean(host && fromEmail),
    };
  }

  async updateSmtpSettings(
    patch: Partial<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      fromName: string;
      fromEmail: string;
      enabled: boolean;
    }>,
  ): Promise<SmtpSettings> {
    if (patch.host !== undefined) {
      await this.setSetting('smtp_host', patch.host.trim());
    }
    if (patch.port !== undefined) {
      const port = Number(patch.port);
      await this.setSetting(
        'smtp_port',
        String(Number.isFinite(port) && port > 0 ? port : 587),
      );
    }
    if (patch.secure !== undefined) {
      await this.setSetting('smtp_secure', patch.secure ? 'true' : 'false');
    }
    if (patch.user !== undefined) {
      await this.setSetting('smtp_user', patch.user.trim());
    }
    if (patch.pass !== undefined) {
      if (patch.pass.trim()) {
        await this.setSetting('smtp_pass', patch.pass.trim());
      }
    }
    if (patch.fromName !== undefined) {
      await this.setSetting('smtp_from_name', patch.fromName.trim());
    }
    if (patch.fromEmail !== undefined) {
      await this.setSetting('smtp_from_email', patch.fromEmail.trim());
    }
    if (patch.enabled !== undefined) {
      await this.setSetting('smtp_enabled', patch.enabled ? 'true' : 'false');
    }
    return this.getSmtpSettings();
  }

  private mapEmailTemplate(row: {
    key: string;
    name: string;
    description: string;
    subject: string;
    body_html: string;
    body_text: string;
    enabled: boolean;
    updated_at: Date | string;
  }): EmailTemplate {
    return {
      key: row.key as EmailTemplateKey,
      name: row.name,
      description: row.description || '',
      subject: row.subject,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      enabled: Boolean(row.enabled),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async listEmailTemplates(): Promise<EmailTemplate[]> {
    await this.ensureEmailTemplates();
    const { rows } = await this.query<{
      key: string;
      name: string;
      description: string;
      subject: string;
      body_html: string;
      body_text: string;
      enabled: boolean;
      updated_at: Date;
    }>(
      `SELECT key, name, description, subject, body_html, body_text, enabled, updated_at
       FROM email_templates
       ORDER BY name`,
    );
    return rows.map((r) => this.mapEmailTemplate(r));
  }

  async getEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplate | null> {
    await this.ensureEmailTemplates();
    const { rows } = await this.query<{
      key: string;
      name: string;
      description: string;
      subject: string;
      body_html: string;
      body_text: string;
      enabled: boolean;
      updated_at: Date;
    }>(
      `SELECT key, name, description, subject, body_html, body_text, enabled, updated_at
       FROM email_templates WHERE key = $1`,
      [key],
    );
    return rows[0] ? this.mapEmailTemplate(rows[0]) : null;
  }

  async updateEmailTemplate(
    key: EmailTemplateKey,
    patch: Partial<{
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      enabled: boolean;
    }>,
  ): Promise<EmailTemplate | null> {
    const existing = await this.getEmailTemplate(key);
    if (!existing) return null;
    const next: EmailTemplate = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description:
        patch.description !== undefined
          ? patch.description.trim()
          : existing.description,
      subject:
        patch.subject !== undefined ? patch.subject.trim() : existing.subject,
      bodyHtml:
        patch.bodyHtml !== undefined ? patch.bodyHtml : existing.bodyHtml,
      bodyText:
        patch.bodyText !== undefined ? patch.bodyText : existing.bodyText,
      enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
      updatedAt: new Date().toISOString(),
    };
    await this.query(
      `UPDATE email_templates SET
         name = $2,
         description = $3,
         subject = $4,
         body_html = $5,
         body_text = $6,
         enabled = $7,
         updated_at = NOW()
       WHERE key = $1`,
      [
        key,
        next.name,
        next.description,
        next.subject,
        next.bodyHtml,
        next.bodyText,
        next.enabled,
      ],
    );
    return this.getEmailTemplate(key);
  }

  async resetEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplate | null> {
    const defaults = DEFAULT_EMAIL_TEMPLATES.find((t) => t.key === key);
    if (!defaults) return null;
    await this.query(
      `INSERT INTO email_templates
         (key, name, description, subject, body_html, body_text, enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         subject = EXCLUDED.subject,
         body_html = EXCLUDED.body_html,
         body_text = EXCLUDED.body_text,
         enabled = TRUE,
         updated_at = NOW()`,
      [
        defaults.key,
        defaults.name,
        defaults.description,
        defaults.subject,
        defaults.bodyHtml,
        defaults.bodyText,
      ],
    );
    return this.getEmailTemplate(key);
  }

  async getCronSettings(): Promise<CronSettings> {
    const master = await this.getSetting('cron_master_enabled');
    const jobs: CronJobSetting[] = [];
    for (const key of Object.keys(CRON_JOB_META) as CronJobKey[]) {
      const meta = CRON_JOB_META[key];
      const raw = await this.getSetting(meta.settingKey);
      const exprRaw = (await this.getSetting(meta.expressionKey))?.trim();
      const expression = exprRaw || meta.expression;
      jobs.push({
        key,
        name: meta.name,
        expression,
        schedule: describeCronExpression(expression, meta.schedule),
        description: meta.description,
        // Missing key (legacy DB) → enabled
        enabled: raw !== 'false',
      });
    }
    return {
      masterEnabled: master !== 'false',
      jobs,
    };
  }

  async updateCronSettings(patch: {
    masterEnabled?: boolean;
    jobs?: Partial<Record<CronJobKey, boolean>>;
    expressions?: Partial<Record<CronJobKey, string>>;
  }): Promise<CronSettings> {
    if (patch.masterEnabled !== undefined) {
      await this.setSetting(
        'cron_master_enabled',
        patch.masterEnabled ? 'true' : 'false',
      );
    }
    if (patch.jobs) {
      for (const [key, enabled] of Object.entries(patch.jobs) as [
        CronJobKey,
        boolean | undefined,
      ][]) {
        if (enabled === undefined) continue;
        const meta = CRON_JOB_META[key];
        if (!meta) continue;
        await this.setSetting(meta.settingKey, enabled ? 'true' : 'false');
      }
    }
    if (patch.expressions) {
      for (const [key, expression] of Object.entries(patch.expressions) as [
        CronJobKey,
        string | undefined,
      ][]) {
        if (expression === undefined) continue;
        const meta = CRON_JOB_META[key];
        if (!meta) continue;
        const trimmed = expression.trim();
        if (!trimmed) continue;
        await this.setSetting(meta.expressionKey, trimmed);
      }
    }
    return this.getCronSettings();
  }

  async isCronJobEnabled(job: CronJobKey): Promise<boolean> {
    const settings = await this.getCronSettings();
    if (!settings.masterEnabled) return false;
    return settings.jobs.find((j) => j.key === job)?.enabled ?? true;
  }

  async updateUser(
    id: string,
    patch: Partial<
      Pick<
        User,
        | 'name'
        | 'phone'
        | 'telegramChatId'
        | 'notifyEmail'
        | 'notifyTelegram'
        | 'planId'
      >
    >,
  ): Promise<User | null> {
    const current = await this.findUserById(id);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      telegramChatId:
        patch.telegramChatId !== undefined
          ? patch.telegramChatId
          : current.telegramChatId,
    };
    await this.query(
      `UPDATE users SET
         name = $2,
         phone = $3,
         telegram_chat_id = $4,
         notify_email = $5,
         notify_telegram = $6,
         plan_id = $7
       WHERE id = $1`,
      [
        id,
        next.name,
        next.phone || null,
        next.telegramChatId || null,
        next.notifyEmail,
        next.notifyTelegram,
        next.planId,
      ],
    );
    return this.findUserById(id);
  }

  async listNotifyUsers(): Promise<User[]> {
    const { rows } = await this.query(
      `SELECT * FROM users WHERE notify_email = TRUE OR notify_telegram = TRUE`,
    );
    return rows.map((r) => this.mapUser(r));
  }

  async countUsers(): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users',
    );
    return Number(rows[0]?.count || 0);
  }

  // ——— Plans / features ———

  async listPlans(): Promise<Plan[]> {
    const { rows } = await this.query('SELECT * FROM plans ORDER BY price_inr');
    return rows.map((r) => this.mapPlan(r));
  }

  async findPlan(id: PlanId): Promise<Plan | null> {
    const { rows } = await this.query('SELECT * FROM plans WHERE id = $1', [id]);
    return rows[0] ? this.mapPlan(rows[0]) : null;
  }

  async updatePlan(id: PlanId, patch: Partial<Plan>): Promise<Plan | null> {
    const current = await this.findPlan(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    await this.query(
      `UPDATE plans SET name = $2, price_inr = $3, features = $4::jsonb, limits = $5::jsonb
       WHERE id = $1`,
      [
        id,
        next.name,
        next.priceInr,
        JSON.stringify(next.features),
        JSON.stringify(next.limits),
      ],
    );
    return this.findPlan(id);
  }

  async listFeatures(): Promise<FeatureFlag[]> {
    const { rows } = await this.query('SELECT * FROM feature_flags ORDER BY key');
    return rows.map((r) => this.mapFeature(r));
  }

  async findFeature(key: string): Promise<FeatureFlag | null> {
    const { rows } = await this.query(
      'SELECT * FROM feature_flags WHERE key = $1',
      [key],
    );
    return rows[0] ? this.mapFeature(rows[0]) : null;
  }

  async updateFeature(
    key: string,
    patch: Partial<FeatureFlag>,
  ): Promise<FeatureFlag | null> {
    const current = await this.findFeature(key);
    if (!current) return null;
    const next = { ...current, ...patch };
    await this.query(
      `UPDATE feature_flags SET name = $2, enabled = $3, plans = $4::jsonb WHERE key = $1`,
      [key, next.name, next.enabled, JSON.stringify(next.plans)],
    );
    return this.findFeature(key);
  }

  // ——— Tickers ———

  async listTickers(): Promise<Ticker[]> {
    const { rows } = await this.query(
      'SELECT * FROM tickers ORDER BY symbol ASC',
    );
    return rows.map((r) => this.mapTicker(r));
  }

  async findTicker(id: string): Promise<Ticker | null> {
    const { rows } = await this.query('SELECT * FROM tickers WHERE id = $1', [
      id,
    ]);
    return rows[0] ? this.mapTicker(rows[0]) : null;
  }

  async findTickerBySymbol(
    symbol: string,
    exchange: 'NSE' | 'BSE' = 'NSE',
  ): Promise<Ticker | null> {
    const { rows } = await this.query(
      `SELECT * FROM tickers WHERE upper(symbol) = $1 AND exchange = $2 LIMIT 1`,
      [symbol.toUpperCase(), exchange],
    );
    return rows[0] ? this.mapTicker(rows[0]) : null;
  }

  async countTickers(): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM tickers',
    );
    return Number(rows[0]?.count || 0);
  }

  async upsertTicker(
    body: Partial<Ticker> & { symbol: string; name: string },
  ): Promise<Ticker> {
    if (body.id) {
      const existing = await this.findTicker(body.id);
      if (!existing) throw new Error('Ticker not found');
      const next: Ticker = {
        ...existing,
        ...body,
        symbol: (body.symbol || existing.symbol).toUpperCase(),
        updatedAt: new Date().toISOString(),
      };
      await this.query(
        `UPDATE tickers SET
           crn=$2, symbol=$3, exchange=$4, name=$5, sector=$6, industry=$7, isin=$8,
           price=$9, prev_close=$10, sma50=$11, sma200=$12, high52w=$13, low52w=$14,
           volume=$15, market_cap_cr=$16, pe=$17, active=$18, updated_at=$19
         WHERE id=$1`,
        [
          next.id,
          next.crn,
          next.symbol,
          next.exchange,
          next.name,
          next.sector,
          next.industry,
          next.isin || null,
          next.price,
          next.prevClose,
          next.sma50,
          next.sma200,
          next.high52w,
          next.low52w,
          next.volume,
          next.marketCapCr,
          next.pe ?? null,
          next.active,
          next.updatedAt,
        ],
      );
      return (await this.findTicker(next.id))!;
    }

    const count = await this.countTickers();
    const ticker: Ticker = {
      id: uuid(),
      crn: body.crn || `FG-T-${String(count + 1).padStart(4, '0')}`,
      symbol: body.symbol.toUpperCase(),
      exchange: body.exchange || 'NSE',
      name: body.name,
      sector: body.sector || 'Other',
      industry: body.industry || 'Other',
      isin: body.isin,
      price: body.price ?? 0,
      prevClose: body.prevClose ?? body.price ?? 0,
      sma50: body.sma50 ?? 0,
      sma200: body.sma200 ?? 0,
      high52w: body.high52w ?? 0,
      low52w: body.low52w ?? 0,
      volume: body.volume ?? 0,
      marketCapCr: body.marketCapCr ?? 0,
      pe: body.pe,
      active: body.active ?? true,
      updatedAt: new Date().toISOString(),
    };
    await this.insertTicker(ticker);
    return ticker;
  }

  async updateTickerPrices(
    updates: { id: string; price: number; prevClose: number; sma50: number }[],
  ) {
    for (const u of updates) {
      await this.query(
        `UPDATE tickers SET price=$2, prev_close=$3, sma50=$4, updated_at=NOW() WHERE id=$1`,
        [u.id, u.price, u.prevClose, u.sma50],
      );
    }
  }

  async applyQuote(
    id: string,
    quote: {
      name?: string;
      price: number;
      prevClose: number;
      sma50: number;
      sma200: number;
      high52w: number;
      low52w: number;
      volume: number;
      marketCapCr: number;
      pe?: number;
    },
  ): Promise<Ticker | null> {
    await this.query(
      `UPDATE tickers SET
         name = COALESCE($2, name),
         price = $3,
         prev_close = $4,
         sma50 = $5,
         sma200 = $6,
         high52w = $7,
         low52w = $8,
         volume = $9,
         market_cap_cr = $10,
         pe = COALESCE($11, pe),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        quote.name || null,
        quote.price,
        quote.prevClose,
        quote.sma50,
        quote.sma200,
        quote.high52w,
        quote.low52w,
        quote.volume,
        quote.marketCapCr,
        quote.pe ?? null,
      ],
    );
    return this.findTicker(id);
  }

  async upsertPriceBars(bars: PriceBar[]): Promise<number> {
    if (!bars.length) return 0;
    const chunkSize = 100;
    let written = 0;
    for (let i = 0; i < bars.length; i += chunkSize) {
      const chunk = bars.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      chunk.forEach((bar, idx) => {
        const o = idx * 7;
        placeholders.push(
          `($${o + 1}, $${o + 2}::date, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`,
        );
        values.push(
          bar.tickerId,
          bar.date,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
        );
      });
      await this.query(
        `INSERT INTO price_history
           (ticker_id, trade_date, open, high, low, close, volume)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (ticker_id, trade_date) DO UPDATE SET
           open = EXCLUDED.open,
           high = EXCLUDED.high,
           low = EXCLUDED.low,
           close = EXCLUDED.close,
           volume = EXCLUDED.volume`,
        values,
      );
      written += chunk.length;
    }
    return written;
  }

  async listPriceBars(
    tickerId: string,
    opts?: { from?: string; to?: string; limit?: number },
  ): Promise<PriceBar[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 400, 1), 2000);
    const params: unknown[] = [tickerId];
    let where = 'ticker_id = $1';
    if (opts?.from) {
      params.push(opts.from);
      where += ` AND trade_date >= $${params.length}::date`;
    }
    if (opts?.to) {
      params.push(opts.to);
      where += ` AND trade_date <= $${params.length}::date`;
    }
    params.push(limit);
    const { rows } = await this.query<{
      ticker_id: string;
      trade_date: Date | string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>(
      `SELECT ticker_id, trade_date, open, high, low, close, volume
       FROM price_history
       WHERE ${where}
       ORDER BY trade_date DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows
      .map((r) => ({
        tickerId: r.ticker_id,
        date:
          typeof r.trade_date === 'string'
            ? r.trade_date.slice(0, 10)
            : r.trade_date.toISOString().slice(0, 10),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      }))
      .reverse();
  }

  async countPriceBars(tickerId: string): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM price_history WHERE ticker_id = $1`,
      [tickerId],
    );
    return Number(rows[0]?.count || 0);
  }

  /** Active tickers with fewer than minBars of history (oldest first by symbol). */
  async listTickersNeedingHistory(
    minBars = 200,
    limit = 25,
  ): Promise<Ticker[]> {
    const { rows } = await this.query(
      `SELECT t.*
       FROM tickers t
       LEFT JOIN (
         SELECT ticker_id, COUNT(*)::int AS bars
         FROM price_history
         GROUP BY ticker_id
       ) h ON h.ticker_id = t.id
       WHERE t.active = TRUE
         AND COALESCE(h.bars, 0) < $1
       ORDER BY COALESCE(h.bars, 0) ASC, t.symbol ASC
       LIMIT $2`,
      [minBars, limit],
    );
    return rows.map((r) => this.mapTicker(r));
  }

  async countHistoryCoverage(minBars = 200) {
    const { rows } = await this.query<{
      total: string;
      complete: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (
           WHERE COALESCE(h.bars, 0) >= $1
         )::text AS complete
       FROM tickers t
       LEFT JOIN (
         SELECT ticker_id, COUNT(*)::int AS bars
         FROM price_history
         GROUP BY ticker_id
       ) h ON h.ticker_id = t.id
       WHERE t.active = TRUE`,
      [minBars],
    );
    return {
      total: Number(rows[0]?.total || 0),
      complete: Number(rows[0]?.complete || 0),
      minBars,
    };
  }

  async listPeerTickers(
    sector: string,
    excludeId: string,
    limit = 8,
  ): Promise<Ticker[]> {
    const { rows } = await this.query(
      `SELECT * FROM tickers
       WHERE active = TRUE
         AND sector = $1
         AND id <> $2
       ORDER BY market_cap_cr DESC NULLS LAST, symbol ASC
       LIMIT $3`,
      [sector || 'Other', excludeId, limit],
    );
    return rows.map((r) => this.mapTicker(r));
  }

  // ——— Holdings ———

  async listHoldings(userId: string): Promise<Holding[]> {
    const { rows } = await this.query(
      `SELECT * FROM holdings WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map((r) => this.mapHolding(r));
  }

  async findHolding(userId: string, id: string): Promise<Holding | null> {
    const { rows } = await this.query(
      `SELECT * FROM holdings WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ? this.mapHolding(rows[0]) : null;
  }

  async createHolding(holding: Holding): Promise<Holding> {
    await this.insertHolding(holding);
    return holding;
  }

  async updateHolding(
    userId: string,
    id: string,
    patch: Partial<Omit<Holding, 'id' | 'userId'>>,
  ): Promise<Holding | null> {
    const current = await this.findHolding(userId, id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.query(
      `UPDATE holdings SET
         asset_type=$3, name=$4, ticker_id=$5, quantity=$6, avg_cost=$7,
         current_value=$8, invested_value=$9, notes=$10, meta=$11::jsonb, updated_at=$12
       WHERE id=$1 AND user_id=$2`,
      [
        id,
        userId,
        next.assetType,
        next.name,
        next.tickerId || null,
        next.quantity ?? null,
        next.avgCost ?? null,
        next.currentValue,
        next.investedValue,
        next.notes || null,
        JSON.stringify(next.meta || {}),
        next.updatedAt,
      ],
    );
    return this.findHolding(userId, id);
  }

  async deleteHolding(userId: string, id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM holdings WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount || 0) > 0;
  }

  async countHoldings(): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM holdings',
    );
    return Number(rows[0]?.count || 0);
  }

  async countHoldingsByUser(userId: string): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM holdings WHERE user_id = $1',
      [userId],
    );
    return Number(rows[0]?.count || 0);
  }

  // ——— Watchlists ———

  async listWatchlist(userId: string): Promise<WatchlistItem[]> {
    const { rows } = await this.query(
      `SELECT * FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((r) => this.mapWatchlist(r));
  }

  async findWatchlistItem(
    userId: string,
    tickerId: string,
  ): Promise<WatchlistItem | null> {
    const { rows } = await this.query(
      `SELECT * FROM watchlists WHERE user_id = $1 AND ticker_id = $2`,
      [userId, tickerId],
    );
    return rows[0] ? this.mapWatchlist(rows[0]) : null;
  }

  async addWatchlist(item: WatchlistItem): Promise<WatchlistItem> {
    await this.query(
      `INSERT INTO watchlists (id, user_id, ticker_id, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, ticker_id) DO NOTHING`,
      [item.id, item.userId, item.tickerId, item.createdAt],
    );
    return (await this.findWatchlistItem(item.userId, item.tickerId)) || item;
  }

  async removeWatchlist(userId: string, id: string): Promise<void> {
    await this.query(`DELETE FROM watchlists WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ]);
  }

  // ——— Screeners ———

  async replaceScreenerResults(results: ScreenerResult[]): Promise<void> {
    await this.query('DELETE FROM screener_results');
    for (const r of results) {
      await this.query(
        `INSERT INTO screener_results (id, ticker_id, screener, matched_at, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [uuid(), r.tickerId, r.screener, r.matchedAt, r.reason],
      );
    }
  }

  async listScreenerResults(screener?: ScreenerKey): Promise<ScreenerResult[]> {
    const { rows } = screener
      ? await this.query(
          `SELECT * FROM screener_results WHERE screener = $1 ORDER BY matched_at DESC`,
          [screener],
        )
      : await this.query(
          `SELECT * FROM screener_results ORDER BY matched_at DESC`,
        );
    return rows.map((r) => this.mapScreenerResult(r));
  }

  async countScreenerResults(): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM screener_results',
    );
    return Number(rows[0]?.count || 0);
  }

  // ——— Alerts ———

  async createAlert(alert: AlertLog): Promise<void> {
    await this.query(
      `INSERT INTO alerts (id, user_id, channel, title, body, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        alert.id,
        alert.userId,
        alert.channel,
        alert.title,
        alert.body,
        alert.status,
        alert.createdAt,
      ],
    );
  }

  async listAlerts(userId: string, limit = 50): Promise<AlertLog[]> {
    const { rows } = await this.query(
      `SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => this.mapAlert(r));
  }

  async countAlerts(): Promise<number> {
    const { rows } = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM alerts',
    );
    return Number(rows[0]?.count || 0);
  }

  // ——— Cron ———

  async startCronRun(run: CronRun): Promise<void> {
    await this.query(
      `INSERT INTO cron_runs (id, job, started_at, status, detail)
       VALUES ($1,$2,$3,$4,$5)`,
      [run.id, run.job, run.startedAt, run.status, run.detail || null],
    );
  }

  async finishCronRun(
    id: string,
    status: 'ok' | 'error',
    detail?: string,
  ): Promise<void> {
    await this.query(
      `UPDATE cron_runs SET status=$2, finished_at=NOW(), detail=$3 WHERE id=$1`,
      [id, status, detail || null],
    );
  }

  async listCronRuns(limit = 40): Promise<CronRun[]> {
    const { rows } = await this.query(
      `SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => this.mapCronRun(r));
  }

  // ——— Recurring income / expenses ———

  async listRecurring(userId: string): Promise<RecurringItem[]> {
    const { rows } = await this.query(
      `SELECT * FROM recurring_items
       WHERE user_id = $1
       ORDER BY kind ASC, name ASC`,
      [userId],
    );
    return rows.map((r) => this.mapRecurring(r));
  }

  async listActiveRecurringExpenses(): Promise<RecurringItem[]> {
    const { rows } = await this.query(
      `SELECT * FROM recurring_items
       WHERE active = true AND kind = 'expense'
       ORDER BY user_id ASC, name ASC`,
    );
    return rows.map((r) => this.mapRecurring(r));
  }

  async findRecurring(
    userId: string,
    id: string,
  ): Promise<RecurringItem | null> {
    const { rows } = await this.query(
      `SELECT * FROM recurring_items WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ? this.mapRecurring(rows[0]) : null;
  }

  async createRecurring(item: RecurringItem): Promise<RecurringItem> {
    await this.query(
      `INSERT INTO recurring_items (
         id, user_id, kind, name, category, amount, frequency,
         day_of_month, notes, active, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        item.id,
        item.userId,
        item.kind,
        item.name,
        item.category,
        item.amount,
        item.frequency,
        item.dayOfMonth ?? null,
        item.notes || null,
        item.active,
        item.createdAt,
        item.updatedAt,
      ],
    );
    return item;
  }

  async updateRecurring(
    userId: string,
    id: string,
    patch: Partial<Omit<RecurringItem, 'id' | 'userId' | 'createdAt'>>,
  ): Promise<RecurringItem | null> {
    const current = await this.findRecurring(userId, id);
    if (!current) return null;
    const next: RecurringItem = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.query(
      `UPDATE recurring_items SET
         kind=$3, name=$4, category=$5, amount=$6, frequency=$7,
         day_of_month=$8, notes=$9, active=$10, updated_at=$11
       WHERE id=$1 AND user_id=$2`,
      [
        id,
        userId,
        next.kind,
        next.name,
        next.category,
        next.amount,
        next.frequency,
        next.dayOfMonth ?? null,
        next.notes || null,
        next.active,
        next.updatedAt,
      ],
    );
    return this.findRecurring(userId, id);
  }

  async deleteRecurring(userId: string, id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM recurring_items WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount || 0) > 0;
  }

  // ——— NSE announcements ———

  async insertAnnouncementIfNew(
    item: Omit<NseAnnouncement, 'createdAt'> & { raw?: Record<string, unknown> },
  ): Promise<NseAnnouncement | null> {
    const { rows } = await this.query(
      `INSERT INTO nse_announcements (
         id, seq_id, symbol, company_name, isin, subject, body,
         attachment_url, attachment_size, announced_at, sort_date, industry, raw, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW()
       )
       ON CONFLICT (seq_id) DO NOTHING
       RETURNING *`,
      [
        item.id,
        item.seqId,
        item.symbol,
        item.companyName,
        item.isin || null,
        item.subject,
        item.body,
        item.attachmentUrl || null,
        item.attachmentSize || null,
        item.announcedAt || null,
        item.sortDate || null,
        item.industry || null,
        JSON.stringify(item.raw || {}),
      ],
    );
    return rows[0] ? this.mapNseAnnouncement(rows[0]) : null;
  }

  async listAnnouncements(opts?: {
    symbols?: string[];
    limit?: number;
  }): Promise<NseAnnouncement[]> {
    const limit = Math.min(200, Math.max(1, opts?.limit || 50));
    if (opts?.symbols?.length) {
      const { rows } = await this.query(
        `SELECT * FROM nse_announcements
         WHERE upper(symbol) = ANY($1::text[])
         ORDER BY COALESCE(announced_at, created_at) DESC
         LIMIT $2`,
        [opts.symbols.map((s) => s.toUpperCase()), limit],
      );
      return rows.map((r) => this.mapNseAnnouncement(r));
    }
    const { rows } = await this.query(
      `SELECT * FROM nse_announcements
       ORDER BY COALESCE(announced_at, created_at) DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => this.mapNseAnnouncement(r));
  }

  async listAnnouncementAlertStocks(
    userId: string,
  ): Promise<AnnouncementAlertStock[]> {
    const { rows } = await this.query(
      `SELECT * FROM announcement_alert_stocks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((r) => this.mapAnnouncementAlertStock(r));
  }

  async findAnnouncementAlertStock(
    userId: string,
    tickerId: string,
  ): Promise<AnnouncementAlertStock | null> {
    const { rows } = await this.query(
      `SELECT * FROM announcement_alert_stocks
       WHERE user_id = $1 AND ticker_id = $2`,
      [userId, tickerId],
    );
    return rows[0] ? this.mapAnnouncementAlertStock(rows[0]) : null;
  }

  async addAnnouncementAlertStock(
    item: AnnouncementAlertStock,
  ): Promise<AnnouncementAlertStock> {
    await this.query(
      `INSERT INTO announcement_alert_stocks (id, user_id, ticker_id, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, ticker_id) DO NOTHING`,
      [item.id, item.userId, item.tickerId, item.createdAt],
    );
    return (
      (await this.findAnnouncementAlertStock(item.userId, item.tickerId)) ||
      item
    );
  }

  async removeAnnouncementAlertStock(
    userId: string,
    id: string,
  ): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM announcement_alert_stocks WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount || 0) > 0;
  }

  /** Distinct watched symbols across all users, with ticker + subscribers. */
  async listAnnouncementWatchCoverage(): Promise<
    { symbol: string; tickerId: string; userIds: string[] }[]
  > {
    const { rows } = await this.query<{
      symbol: string;
      ticker_id: string;
      user_ids: string[];
    }>(
      `SELECT upper(t.symbol) AS symbol,
              t.id AS ticker_id,
              array_agg(DISTINCT a.user_id::text) AS user_ids
       FROM announcement_alert_stocks a
       JOIN tickers t ON t.id = a.ticker_id
       WHERE t.active = true
       GROUP BY upper(t.symbol), t.id
       ORDER BY upper(t.symbol)`,
    );
    return rows.map((r) => ({
      symbol: r.symbol,
      tickerId: r.ticker_id,
      userIds: r.user_ids || [],
    }));
  }
}
