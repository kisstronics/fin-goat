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

export interface DashboardData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  invested: number;
  absoluteReturn: number;
  returnPct: number;
  allocation: { type: string; value: number; pct: number }[];
  loanBreakdown?: { type: string; value: number }[];
  investments?: Holding[];
  loans?: Holding[];
  holdings: Holding[];
  updatedAt: string;
}

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

export interface RecurringSummary {
  items: RecurringItem[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
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
  breakdown: { label: string; amount: number }[];
}

export interface ProjectionSeriesPoint {
  year: number;
  month: number;
  label: string;
  monthsAhead: number;
  projectedNetWorth: number;
  projectedAssets: number;
  projectedLiabilities: number;
}

export interface ProjectionSeries {
  asOf: string;
  years: number;
  currentNetWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyEmi: number;
  monthlySip: number;
  monthlySurplus: number;
  points: ProjectionSeriesPoint[];
}

export interface Ticker {
  id: string;
  crn: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  name: string;
  sector: string;
  industry: string;
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
  updatedAt: string;
}

export interface ScreenerDef {
  key: ScreenerKey;
  name: string;
  description: string;
  logic: string;
  enabled: boolean;
}

export interface ScreenerResultRow {
  tickerId: string;
  screener: ScreenerKey;
  matchedAt: string;
  reason: string;
  ticker?: Ticker;
}

export interface FeatureFlag {
  key: string;
  name: string;
  enabled: boolean;
  plans: PlanId[];
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
  | 'daily_digest'
  | 'expense_reminders'
  | 'nse_announcements';

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
  ticker?: Ticker;
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
