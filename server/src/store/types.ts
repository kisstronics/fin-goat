export type Role = 'user' | 'admin';
export type PlanId = 'free' | 'pro' | 'premium' | 'family';
export type AssetType =
  | 'stock'
  | 'mutual_fund'
  | 'epfo'
  | 'fd'
  | 'gold'
  | 'real_estate'
  | 'cash_lending'
  | 'ppf'
  | 'nps'
  | 'loan';

export type ScreenerKey =
  | 'golden_crossover'
  | 'near_52w_low'
  | 'above_50pct_from_low';

export type RecurringKind = 'income' | 'expense';
export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringItem {
  id: string;
  userId: string;
  kind: RecurringKind;
  name: string;
  category: string;
  amount: number;
  frequency: RecurringFrequency;
  dayOfMonth?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NetWorthProjection {
  asOf: string;
  targetMonth: number;
  targetYear: number;
  monthsAhead: number;
  currentNetWorth: number;
  projectedNetWorth: number;
  projectedAssets: number;
  projectedLiabilities: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyEmi: number;
  monthlySip: number;
  monthlySurplus: number;
  /** Assumed annual return applied to current + future investments. */
  annualGrowthPct?: number;
  incomeGrowthPct?: number;
  expenseGrowthPct?: number;
  breakdown: {
    label: string;
    amount: number;
  }[];
}

/** Per-user assumptions used by Dashboard net-worth projections. */
export interface ProjectionSettings {
  /** Annual return applied to current + future investments. */
  returnsPct: number;
  /** Annual growth applied to recurring income. */
  incomeGrowthPct: number;
  /** Annual growth applied to recurring expenses. */
  expenseGrowthPct: number;
  /** Projection horizon in years. */
  years: number;
}

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  returnsPct: 15,
  incomeGrowthPct: 0,
  expenseGrowthPct: 0,
  years: 10,
};

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  telegramChatId?: string;
  role: Role;
  planId: PlanId;
  notifyEmail: boolean;
  notifyTelegram: boolean;
  provider?: string;
  picture?: string;
  googleId?: string;
  createdAt: string;
  projectionSettings?: ProjectionSettings;
}

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface GoogleAuthSettings {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  allowDevLogin: boolean;
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  webhookUrl: string;
  webhookSecret: string;
  botUsername: string;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export type EmailTemplateKey =
  | 'screener_digest'
  | 'nse_announcement'
  | 'expense_reminder'
  | 'test_email';

export interface EmailTemplate {
  key: EmailTemplateKey;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  enabled: boolean;
  updatedAt: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceInr: number;
  features: string[];
  limits: {
    alertsPerDay: number;
    holdings: number;
    watchlists: number;
  };
}

export interface FeatureFlag {
  key: string;
  name: string;
  enabled: boolean;
  plans: PlanId[];
}

export interface Ticker {
  id: string;
  crn: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  name: string;
  sector: string;
  industry: string;
  isin?: string;
  price: number;
  prevClose: number;
  sma50: number;
  sma200: number;
  high52w: number;
  low52w: number;
  volume: number;
  marketCapCr: number;
  pe?: number;
  active: boolean;
  /** When true, this ticker is evaluated by screener jobs. */
  includeInScreener: boolean;
  /** When true, this ticker can be watched / notified for NSE announcements. */
  includeInAnnouncements: boolean;
  updatedAt: string;
}

export interface TickerPage {
  items: Ticker[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Holding {
  id: string;
  userId: string;
  assetType: AssetType;
  name: string;
  tickerId?: string;
  quantity?: number;
  avgCost?: number;
  currentValue: number;
  investedValue: number;
  notes?: string;
  meta?: Record<string, string | number | boolean>;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  tickerId: string;
  createdAt: string;
}

export interface ScreenerResult {
  tickerId: string;
  screener: ScreenerKey;
  matchedAt: string;
  reason: string;
  /** Stable match signature used to dedupe alerts (excludes cron trigger labels). */
  fingerprint?: string;
}

/** Tracks the last screener alert delivered to a user for a ticker+screener pair. */
export interface ScreenerAlertSent {
  id: string;
  userId: string;
  tickerId: string;
  screener: ScreenerKey;
  fingerprint: string;
  lastSentAt: string;
}

/** Tracks that a user was already notified about a specific NSE announcement. */
export interface AnnouncementAlertSent {
  id: string;
  userId: string;
  announcementId: string;
  lastSentAt: string;
}

export interface AlertLog {
  id: string;
  userId: string;
  channel: 'email' | 'telegram';
  title: string;
  body: string;
  createdAt: string;
  status: 'queued' | 'sent' | 'failed';
}

export interface CronRun {
  id: string;
  job: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'ok' | 'error';
  detail?: string;
}

export type CronJobKey =
  | 'screener_10m'
  | 'price_refresh'
  | 'history_backfill'
  | 'daily_digest'
  | 'expense_reminders'
  | 'nse_announcements';

export interface PriceBar {
  tickerId: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartRange =
  | '1d'
  | '1w'
  | '1m'
  | '3m'
  | '6m'
  | '1y'
  | '3y'
  | '5y'
  | 'max';

export interface StockScorecardItem {
  key: string;
  label: string;
  rating: 'High' | 'Avg' | 'Low';
  summary: string;
}

export interface StockDetail {
  ticker: Ticker;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  scorecard: StockScorecardItem[];
  peers: Ticker[];
  announcements: NseAnnouncement[];
  historyDays: number;
  historyComplete: boolean;
}

export interface NseAnnouncement {
  id: string;
  seqId: string;
  symbol: string;
  companyName: string;
  isin?: string;
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentSize?: string;
  announcedAt?: string;
  sortDate?: string;
  industry?: string;
  createdAt: string;
}

export interface AnnouncementAlertStock {
  id: string;
  userId: string;
  tickerId: string;
  createdAt: string;
}

export interface CronJobSetting {
  key: CronJobKey;
  name: string;
  /** Human-readable summary of the schedule. */
  schedule: string;
  /** Standard 5-field cron expression (min hour day month weekday). */
  expression: string;
  description: string;
  enabled: boolean;
}

export interface CronSettings {
  masterEnabled: boolean;
  jobs: CronJobSetting[];
}
