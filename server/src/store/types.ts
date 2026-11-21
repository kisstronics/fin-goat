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
  updatedAt: string;
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
