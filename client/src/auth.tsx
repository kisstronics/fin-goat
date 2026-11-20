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
  googleEnabled: boolean;
  allowDevLogin: boolean;
  loginDev: (emailOrName: string) => Promise<void>;
  completeTokenLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
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

  useEffect(() => {
    void api
      .authStatus()
      .then((status) => {
        setGoogleEnabled(status.enabled);
        setAllowDevLogin(status.allowDevLogin);
      })
      .catch(() => {
        setGoogleEnabled(false);
        setAllowDevLogin(false);
      })
      .finally(() => {
        setStatusReady(true);
      });
    void refresh();
  }, [refresh]);

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
      googleEnabled,
      allowDevLogin,
      loginDev,
      completeTokenLogin,
      logout,
      refresh,
    }),
    [
      user,
      loading,
      statusReady,
      googleEnabled,
      allowDevLogin,
      loginDev,
      completeTokenLogin,
      logout,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
