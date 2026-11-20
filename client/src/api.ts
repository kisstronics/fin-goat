import type {
  AlertLog,
  CronRun,
  DashboardData,
  FeatureFlag,
  Holding,
  Plan,
  ScreenerDef,
  ScreenerKey,
  ScreenerResultRow,
  Ticker,
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
  deleteHolding: (id: string) =>
    request<{ ok: boolean }>(`/api/portfolio/${id}`, { method: 'DELETE' }),

  screeners: () => request<ScreenerDef[]>('/api/screeners'),
  screenerResults: (key?: ScreenerKey) =>
    request<ScreenerResultRow[]>(
      key ? `/api/screeners/results?key=${key}` : '/api/screeners/results',
    ),
  runScreeners: () =>
    request<{ count: number; results: ScreenerResultRow[] }>('/api/screeners/run', {
      method: 'POST',
    }),
  watchlist: () =>
    request<{ id: string; tickerId: string; ticker?: Ticker }[]>(
      '/api/screeners/watchlist',
    ),

  settings: () =>
    request<{ user: User; plan?: Plan; plans: Plan[] }>('/api/settings'),
  updateSettings: (body: Partial<User>) =>
    request<{ user: User; plan?: Plan; plans: Plan[] }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  alerts: () => request<AlertLog[]>('/api/settings/alerts'),

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
  adminTickers: () => request<Ticker[]>('/api/admin/tickers'),
  upsertTicker: (body: Partial<Ticker> & { symbol: string; name: string }) =>
    request<Ticker>('/api/admin/tickers', {
      method: 'POST',
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
      };
      source: string;
      syncedAt: string;
    }>('/api/admin/tickers/sync', { method: 'POST' }),
  refreshTickerPrices: () =>
    request<{
      attempted: number;
      updated: number;
      failed: { symbol: string; error: string }[];
      refreshedAt: string;
    }>('/api/admin/tickers/refresh-prices', { method: 'POST' }),
  adminPlans: () => request<Plan[]>('/api/admin/plans'),
  adminFeatures: () => request<FeatureFlag[]>('/api/admin/features'),
  updateFeature: (key: string, body: Partial<FeatureFlag>) =>
    request<FeatureFlag>(`/api/admin/features/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  cronRuns: () => request<CronRun[]>('/api/admin/cron-runs'),
  adminAppSettings: () =>
    request<{
      google: {
        enabled: boolean;
        clientId: string;
        hasClientSecret: boolean;
        callbackUrl: string;
        allowDevLogin: boolean;
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
  }) =>
    request<{
      google: {
        enabled: boolean;
        clientId: string;
        hasClientSecret: boolean;
        callbackUrl: string;
        allowDevLogin: boolean;
      };
    }>('/api/admin/app-settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
