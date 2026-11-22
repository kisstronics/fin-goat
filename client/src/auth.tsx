import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearToken, setToken } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  statusReady: boolean;
  statusError: string | null;
  googleEnabled: boolean;
  allowDevLogin: boolean;
  loginDev: (emailOrName: string) => Promise<void>;
  completeTokenLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchAuthStatus(retries = 8, delayMs = 400) {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await api.authStatus();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not reach the API');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [allowDevLogin, setAllowDevLogin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadStatus = useCallback(async () => {
    setStatusReady(false);
    setStatusError(null);
    try {
      const status = await fetchAuthStatus();
      setGoogleEnabled(status.enabled);
      setAllowDevLogin(status.allowDevLogin);
      setStatusError(null);
    } catch (err) {
      setGoogleEnabled(false);
      setAllowDevLogin(false);
      setStatusError(
        err instanceof Error
          ? err.message
          : 'Could not reach the API. Is the server running?',
      );
    } finally {
      setStatusReady(true);
    }
  }, []);

  useEffect(() => {
    void reloadStatus();
    void refresh();
  }, [refresh, reloadStatus]);

  const loginDev = useCallback(async (emailOrName: string) => {
    const result = await api.loginDev(emailOrName);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const completeTokenLogin = useCallback(async (token: string) => {
    setToken(token);
    const me = await api.me();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      statusReady,
      statusError,
      googleEnabled,
      allowDevLogin,
      loginDev,
      completeTokenLogin,
      logout,
      refresh,
      reloadStatus,
    }),
    [
      user,
      loading,
      statusReady,
      statusError,
      googleEnabled,
      allowDevLogin,
      loginDev,
      completeTokenLogin,
      logout,
      refresh,
      reloadStatus,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
