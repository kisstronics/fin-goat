import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api, googleLoginUrl } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';

export function LoginPage() {
  const {
    user,
    loading,
    statusReady,
    loginDev,
    googleEnabled,
    allowDevLogin,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [demoUsers, setDemoUsers] = useState<
    { id: string; name: string; email: string; role: string }[]
  >([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromQuery = params.get('error');
    if (!fromQuery) return;
    const nice: Record<string, string> = {
      google_not_configured:
        'Google Sign-in is not enabled. Ask an admin to configure it in Admin → Sign-in.',
      google_auth_failed: 'Google sign-in failed. Check OAuth redirect URI settings.',
      google_login_failed: 'Could not complete Google sign-in.',
      access_denied: 'Google sign-in was cancelled.',
    };
    setError(nice[fromQuery] || fromQuery);
  }, [params]);

  useEffect(() => {
    if (!statusReady || !allowDevLogin) {
      setDemoUsers([]);
      return;
    }
    void api.demoUsers().then(setDemoUsers).catch(() => setDemoUsers([]));
  }, [statusReady, allowDevLogin]);

  if (user) return <Navigate to="/" replace />;

  if (loading || !statusReady) {
    return (
      <div className="mobile-shell">
        <div className="app-main center">
          <p>Signing you in…</p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allowDevLogin) return;
    setBusy(true);
    setError('');
    try {
      await loginDev(name || 'Demo Investor');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not sign in. Is the server running?',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mobile-shell login-page">
      <button
        type="button"
        className="icon-btn theme-toggle login-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>
      <div className="login-panel app-main">
        <p className="brand">Fin Goat</p>
        <h1>All investments in one glance</h1>
        <p className="lede">
          Indian wealth tracker with stock screeners, alerts, and a household
          net-worth dashboard.
        </p>
        <p className="muted">
          Screeners are analytical tools — not buy/sell recommendations.
        </p>

        {googleEnabled && (
          <a className="btn primary google-btn" href={googleLoginUrl}>
            Continue with Google
          </a>
        )}

        {allowDevLogin && (
          <>
            {googleEnabled && <p className="divider">or</p>}
            <form className="dev-form" onSubmit={(e) => void onSubmit(e)}>
              <label>
                Sign in as
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Demo Investor"
                  autoComplete="username"
                />
              </label>
              {demoUsers.length > 0 && (
                <div className="chip-row">
                  {demoUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="chip"
                      onClick={() => setName(u.email)}
                    >
                      {u.name}
                      <span>{u.role}</span>
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="error">{error}</p>}
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Continue'}
              </button>
            </form>
          </>
        )}

        {!allowDevLogin && googleEnabled && error && (
          <p className="error">{error}</p>
        )}

        {!allowDevLogin && !googleEnabled && (
          <p className="error">
            No sign-in methods are enabled. Configure Google in Admin → Sign-in.
          </p>
        )}
      </div>
    </div>
  );
}
