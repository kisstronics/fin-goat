import type {
  AlertLog,
  ChartRange,
  CronJobKey,
  CronRun,
  CronSettings,
  DashboardData,
  FeatureFlag,
  Holding,
  AnnouncementAlertStock,
  NetWorthProjection,
  NseAnnouncement,
  Plan,
  PriceBar,
  ProjectionSeries,
  RecurringItem,
  RecurringSummary,
  ScreenerDef,
  ScreenerKey,
  ScreenerResultRow,
  StockDetail,
  Ticker,
  TickerPage,
  User,
} from './types';

const TOKEN_KEY = 'fg_token';

/** Empty = same-origin (Vite proxies /api and /auth → Nest in local dev). */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  '',
) ?? '';

function apiUrl(path: string) {
  if (!path.startsWith('/')) return `${API_URL}/${path}`;
  return `${API_URL}${path}`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function clearToken() {
  setToken(null);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const googleLoginUrl = apiUrl('/auth/google');

export const api = {
  me: () => request<User>('/auth/me'),
  authStatus: () =>
    request<{ enabled: boolean; configured: boolean; allowDevLogin: boolean }>(
      '/auth/google/status',
    ),
  demoUsers: () =>
    request<{ id: string; name: string; email: string; role: string; planId: string }[]>(
      '/auth/demo-users',
    ),
  loginDev: (emailOrName: string) =>
    request<{ user: User; token: string }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ emailOrName }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  dashboard: () => request<DashboardData>('/api/portfolio/dashboard'),
  projectNetWorth: (month: number, year: number) =>
    request<NetWorthProjection>(
      `/api/portfolio/projection?month=${month}&year=${year}`,
    ),
  projectionSeries: (years = 10) =>
    request<ProjectionSeries>(
      `/api/portfolio/projection-series?years=${years}`,
    ),
  holdings: () => request<Holding[]>('/api/portfolio'),
  createHolding: (
    body: Partial<Holding> & {
      assetType: string;
      name: string;
      currentValue: number;
      investedValue: number;
      notes?: string;
      meta?: Record<string, string | number | boolean>;
    },
  ) =>
    request<Holding>('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateHolding: (
    id: string,
    body: Partial<Holding> & {
      assetType?: string;
      name?: string;
      currentValue?: number;
      investedValue?: number;
      notes?: string;
      meta?: Record<string, string | number | boolean>;
    },
  ) =>
    request<Holding>(`/api/portfolio/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteHolding: (id: string) =>
    request<{ ok: boolean }>(`/api/portfolio/${id}`, { method: 'DELETE' }),

  recurring: () => request<RecurringSummary>('/api/recurring'),
  createRecurring: (
    body: Partial<RecurringItem> & {
      kind: string;
      name: string;
      amount: number;
    },
  ) =>
    request<RecurringItem>('/api/recurring', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateRecurring: (
    id: string,
    body: Partial<Omit<RecurringItem, 'dayOfMonth'>> & {
      dayOfMonth?: number | null;
    },
  ) =>
    request<RecurringItem>(`/api/recurring/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteRecurring: (id: string) =>
    request<{ ok: boolean }>(`/api/recurring/${id}`, { method: 'DELETE' }),

  screeners: () => request<ScreenerDef[]>('/api/screeners'),
  screenerResults: (key?: ScreenerKey) =>
    request<ScreenerResultRow[]>(
      key ? `/api/screeners/results?key=${key}` : '/api/screeners/results',
    ),
  runScreeners: () =>
    request<{ count: number; results: ScreenerResultRow[] }>('/api/screeners/run', {
      method: 'POST',
    }),
  marketTickers: () => request<Ticker[]>('/api/market/tickers'),
  stockDetail: (symbol: string) =>
    request<StockDetail>(`/api/market/tickers/${encodeURIComponent(symbol)}`),
  stockHistory: (symbol: string, range: ChartRange = '1y') =>
    request<{
      symbol: string;
      range: ChartRange;
      source: string;
      bars: PriceBar[];
    }>(
      `/api/market/tickers/${encodeURIComponent(symbol)}/history?range=${range}`,
    ),
  historyCoverage: () =>
    request<{ total: number; complete: number; minBars: number }>(
      '/api/market/history-coverage',
    ),
  watchlist: () =>
    request<{ id: string; tickerId: string; ticker?: Ticker }[]>(
      '/api/screeners/watchlist',
    ),

  announcements: (limit = 50) =>
    request<{ items: NseAnnouncement[]; watchedSymbols: string[] }>(
      `/api/announcements?limit=${limit}`,
    ),
  announcementAlertStocks: () =>
    request<AnnouncementAlertStock[]>('/api/announcements/alert-stocks'),
  addAnnouncementAlertStock: (tickerId: string) =>
    request<AnnouncementAlertStock>('/api/announcements/alert-stocks', {
      method: 'POST',
      body: JSON.stringify({ tickerId }),
    }),
  removeAnnouncementAlertStock: (id: string) =>
    request<{ ok: boolean }>(`/api/announcements/alert-stocks/${id}`, {
      method: 'DELETE',
    }),
  searchAnnouncementTickers: (q: string) =>
    request<Ticker[]>(
      `/api/announcements/tickers/search?q=${encodeURIComponent(q)}`,
    ),
  syncAnnouncements: () =>
    request<{
      watchedSymbols: number;
      fetched: number;
      inserted: number;
      notified: number;
      detail: string;
    }>('/api/announcements/sync', { method: 'POST' }),

  settings: () =>
    request<{
      user: User;
      plan?: Plan;
      plans: Plan[];
      telegram: { enabled: boolean; botUsername: string; linked: boolean };
    }>('/api/settings'),
  updateSettings: (
    body: Partial<
      Pick<User, 'name' | 'phone' | 'notifyEmail' | 'notifyTelegram' | 'planId'>
    >,
  ) =>
    request<{
      user: User;
      plan?: Plan;
      plans: Plan[];
      telegram: { enabled: boolean; botUsername: string; linked: boolean };
    }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  alerts: () => request<AlertLog[]>('/api/settings/alerts'),
  sendTelegramTest: () =>
    request<{ ok: boolean; chatId?: string; phone?: string; message: string }>(
      '/api/settings/telegram/test',
      { method: 'POST' },
    ),
  adminSendTelegramTest: (phone: string) =>
    request<{
      ok: boolean;
      userId?: string;
      chatId?: string;
      phone?: string;
      message: string;
    }>('/api/admin/telegram/test', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  adminOverview: () =>
    request<{
      users: number;
      tickers: number;
      holdings: number;
      screenerHits: number;
      alerts: number;
      lastCron: CronRun | null;
    }>('/api/admin/overview'),
  adminUsers: () => request<(User & { holdingsCount: number })[]>('/api/admin/users'),
  adminTickers: (opts?: {
    page?: number;
    pageSize?: number;
    q?: string;
    screener?: 'all' | 'yes' | 'no';
    announcements?: 'all' | 'yes' | 'no';
  }) => {
    const params = new URLSearchParams();
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
    if (opts?.q?.trim()) params.set('q', opts.q.trim());
    if (opts?.screener === 'yes') params.set('screener', '1');
    if (opts?.screener === 'no') params.set('screener', '0');
    if (opts?.announcements === 'yes') params.set('announcements', '1');
    if (opts?.announcements === 'no') params.set('announcements', '0');
    const qs = params.toString();
    return request<TickerPage>(
      `/api/admin/tickers${qs ? `?${qs}` : ''}`,
    );
  },
  upsertTicker: (body: Partial<Ticker> & { symbol: string; name: string }) =>
    request<Ticker>('/api/admin/tickers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTickerInclusion: (
    id: string,
    body: {
      includeInScreener?: boolean;
      includeInAnnouncements?: boolean;
    },
  ) =>
    request<Ticker>(`/api/admin/tickers/${id}/inclusion`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  syncAllTickers: () =>
    request<{
      universeSize: number;
      created: number;
      updated: number;
      priceRefresh: {
        attempted: number;
        updated: number;
        failed: { symbol: string; error: string }[];
        status?: string;
        note?: string;
      };
      source: string;
      fallback?: boolean;
      syncedAt: string;
    }>('/api/admin/tickers/sync', { method: 'POST' }),
  refreshTickerPrices: () =>
    request<{
      attempted: number;
      updated: number;
      failed: { symbol: string; error: string }[];
      refreshedAt: string;
    }>('/api/admin/tickers/refresh-prices', { method: 'POST' }),
  backfillHistory: (batchSize = 25) =>
    request<{
      skipped: boolean;
      reason?: string;
      attempted: number;
      updated: number;
      failed: { symbol: string; error: string }[];
      coverage: { total: number; complete: number; minBars: number };
      finishedAt?: string;
    }>('/api/admin/tickers/backfill-history', {
      method: 'POST',
      body: JSON.stringify({ batchSize }),
    }),
  adminHistoryCoverage: () =>
    request<{ total: number; complete: number; minBars: number }>(
      '/api/admin/tickers/history-coverage',
    ),
  adminPlans: () => request<Plan[]>('/api/admin/plans'),
  adminFeatures: () => request<FeatureFlag[]>('/api/admin/features'),
  updateFeature: (key: string, body: Partial<FeatureFlag>) =>
    request<FeatureFlag>(`/api/admin/features/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  cronRuns: () => request<CronRun[]>('/api/admin/cron-runs'),
  cronSettings: () => request<CronSettings>('/api/admin/cron-settings'),
  updateCronSettings: (body: {
    masterEnabled?: boolean;
    jobs?: Partial<Record<CronJobKey, boolean>>;
    expressions?: Partial<Record<CronJobKey, string>>;
  }) =>
    request<CronSettings>('/api/admin/cron-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminAppSettings: () =>
    request<{
      google: {
        enabled: boolean;
        clientId: string;
        hasClientSecret: boolean;
        callbackUrl: string;
        allowDevLogin: boolean;
      };
      telegram: {
        enabled: boolean;
        hasBotToken: boolean;
        webhookUrl: string;
        hasWebhookSecret: boolean;
        botUsername: string;
      };
      smtp: {
        enabled: boolean;
        host: string;
        port: number;
        secure: boolean;
        user: string;
        hasPass: boolean;
        fromName: string;
        fromEmail: string;
      };
    }>('/api/admin/app-settings'),
  updateAdminAppSettings: (body: {
    google?: Partial<{
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
      enabled: boolean;
      allowDevLogin: boolean;
    }>;
    telegram?: Partial<{
      botToken: string;
      webhookUrl: string;
      webhookSecret: string;
      enabled: boolean;
    }>;
    smtp?: Partial<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      fromName: string;
      fromEmail: string;
      enabled: boolean;
    }>;
  }) =>
    request<{
      google: {
        enabled: boolean;
        clientId: string;
        hasClientSecret: boolean;
        callbackUrl: string;
        allowDevLogin: boolean;
      };
      telegram: {
        enabled: boolean;
        hasBotToken: boolean;
        webhookUrl: string;
        hasWebhookSecret: boolean;
        botUsername: string;
      };
      smtp: {
        enabled: boolean;
        host: string;
        port: number;
        secure: boolean;
        user: string;
        hasPass: boolean;
        fromName: string;
        fromEmail: string;
      };
    }>('/api/admin/app-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminSendEmailTest: (to: string) =>
    request<{
      ok: boolean;
      messageId?: string;
      message: string;
      to: string;
    }>('/api/admin/email/test', {
      method: 'POST',
      body: JSON.stringify({ to }),
    }),
  adminEmailTemplates: () =>
    request<
      {
        key: string;
        name: string;
        description: string;
        subject: string;
        bodyHtml: string;
        bodyText: string;
        enabled: boolean;
        updatedAt: string;
      }[]
    >('/api/admin/email-templates'),
  updateEmailTemplate: (
    key: string,
    body: Partial<{
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      enabled: boolean;
    }>,
  ) =>
    request<{
      key: string;
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      enabled: boolean;
      updatedAt: string;
    }>(`/api/admin/email-templates/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  resetEmailTemplate: (key: string) =>
    request<{
      key: string;
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      enabled: boolean;
      updatedAt: string;
    }>(`/api/admin/email-templates/${key}/reset`, { method: 'POST' }),
};
