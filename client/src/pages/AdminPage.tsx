import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { CronRun, FeatureFlag, Plan, Ticker, User } from '../types';

type Tab =
  | 'overview'
  | 'users'
  | 'tickers'
  | 'plans'
  | 'features'
  | 'signin'
  | 'telegram'
  | 'cron';

type GoogleForm = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  allowDevLogin: boolean;
  hasClientSecret: boolean;
};

type TelegramForm = {
  enabled: boolean;
  botToken: string;
  webhookUrl: string;
  webhookSecret: string;
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
  botUsername: string;
};

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<{
    users: number;
    tickers: number;
    holdings: number;
    screenerHits: number;
    alerts: number;
    lastCron: CronRun | null;
  } | null>(null);
  const [users, setUsers] = useState<(User & { holdingsCount: number })[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [googleForm, setGoogleForm] = useState<GoogleForm | null>(null);
  const [telegramForm, setTelegramForm] = useState<TelegramForm | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testNote, setTestNote] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);
  const [error, setError] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [syncNote, setSyncNote] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [ov, u, t, p, f, c, settings] = await Promise.all([
          api.adminOverview(),
          api.adminUsers(),
          api.adminTickers(),
          api.adminPlans(),
          api.adminFeatures(),
          api.cronRuns(),
          api.adminAppSettings(),
        ]);
        setOverview(ov);
        setUsers(u);
        setTickers(t);
        setPlans(p);
        setFeatures(f);
        setCronRuns(c);
        setGoogleForm({
          enabled: settings.google.enabled,
          clientId: settings.google.clientId,
          clientSecret: '',
          callbackUrl: settings.google.callbackUrl,
          allowDevLogin: settings.google.allowDevLogin,
          hasClientSecret: settings.google.hasClientSecret,
        });
        setTelegramForm({
          enabled: settings.telegram.enabled,
          botToken: '',
          webhookUrl: settings.telegram.webhookUrl,
          webhookSecret: '',
          hasBotToken: settings.telegram.hasBotToken,
          hasWebhookSecret: settings.telegram.hasWebhookSecret,
          botUsername: settings.telegram.botUsername,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Admin load failed');
      }
    })();
  }, []);

  async function toggleFeature(feature: FeatureFlag) {
    const next = await api.updateFeature(feature.key, {
      enabled: !feature.enabled,
    });
    setFeatures((rows) => rows.map((r) => (r.key === next.key ? next : r)));
  }

  async function onSyncTickers() {
    setSyncBusy(true);
    setSyncNote('');
    setError('');
    try {
      const result = await api.syncAllTickers();
      setTickers(await api.adminTickers());
      setOverview(await api.adminOverview());
      setSyncNote(
        `Synced ${result.universeSize} symbols · created ${result.created} · updated ${result.updated} · priced ${result.priceRefresh.updated}/${result.priceRefresh.attempted}. ${result.source}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticker sync failed');
    } finally {
      setSyncBusy(false);
    }
  }

  async function onRefreshPrices() {
    setRefreshBusy(true);
    setSyncNote('');
    setError('');
    try {
      const result = await api.refreshTickerPrices();
      setTickers(await api.adminTickers());
      setSyncNote(
        `LTP refresh: ${result.updated}/${result.attempted} updated` +
          (result.failed.length
            ? ` · ${result.failed.length} failed`
            : ''),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Price refresh failed');
    } finally {
      setRefreshBusy(false);
    }
  }

  async function onSaveGoogle(e: FormEvent) {
    e.preventDefault();
    if (!googleForm) return;
    setSaved(false);
    setError('');
    try {
      const next = await api.updateAdminAppSettings({
        google: {
          enabled: googleForm.enabled,
          clientId: googleForm.clientId,
          clientSecret: googleForm.clientSecret || undefined,
          callbackUrl: googleForm.callbackUrl,
          allowDevLogin: googleForm.allowDevLogin,
        },
      });
      setGoogleForm({
        enabled: next.google.enabled,
        clientId: next.google.clientId,
        clientSecret: '',
        callbackUrl: next.google.callbackUrl,
        allowDevLogin: next.google.allowDevLogin,
        hasClientSecret: next.google.hasClientSecret,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    }
  }

  async function onSaveTelegram(e: FormEvent) {
    e.preventDefault();
    if (!telegramForm) return;
    setTelegramSaved(false);
    setError('');
    try {
      const next = await api.updateAdminAppSettings({
        telegram: {
          enabled: telegramForm.enabled,
          botToken: telegramForm.botToken || undefined,
          webhookUrl: telegramForm.webhookUrl,
          webhookSecret: telegramForm.webhookSecret || undefined,
        },
      });
      setTelegramForm({
        enabled: next.telegram.enabled,
        botToken: '',
        webhookUrl: next.telegram.webhookUrl,
        webhookSecret: '',
        hasBotToken: next.telegram.hasBotToken,
        hasWebhookSecret: next.telegram.hasWebhookSecret,
        botUsername: next.telegram.botUsername,
      });
      setTelegramSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save Telegram settings',
      );
    }
  }

  async function onSendTelegramTest() {
    setTestBusy(true);
    setTestNote('');
    setError('');
    try {
      const result = await api.adminSendTelegramTest(testPhone);
      setTestNote(
        `${result.message} · phone ${result.phone} · chat ${result.chatId}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTestBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'tickers', label: 'Tickers' },
    { id: 'plans', label: 'Plans' },
    { id: 'features', label: 'Features' },
    { id: 'signin', label: 'Sign-in' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'cron', label: 'Cron' },
  ];

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Console</h1>
        <p className="muted">
          Users, CRN tickers, plans, features, Google Sign-in, Telegram, and job
          runs.
        </p>
      </header>

      <div className="chip-row wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {tab === 'overview' && overview && (
        <section className="stat-grid">
          <article className="stat-block">
            <p className="eyebrow">Users</p>
            <strong>{overview.users}</strong>
          </article>
          <article className="stat-block">
            <p className="eyebrow">Tickers</p>
            <strong>{overview.tickers}</strong>
          </article>
          <article className="stat-block">
            <p className="eyebrow">Holdings</p>
            <strong>{overview.holdings}</strong>
          </article>
          <article className="stat-block">
            <p className="eyebrow">Screener hits</p>
            <strong>{overview.screenerHits}</strong>
          </article>
          <article className="stat-block">
            <p className="eyebrow">Alerts</p>
            <strong>{overview.alerts}</strong>
          </article>
          <article className="stat-block">
            <p className="eyebrow">Last cron</p>
            <strong className="tiny-strong">
              {overview.lastCron?.job || '—'}
            </strong>
          </article>
        </section>
      )}

      {tab === 'users' && (
        <ul className="holding-list">
          {users.map((u) => (
            <li key={u.id} className="holding-card">
              <div className="holding-main">
                <div>
                  <h3>{u.name}</h3>
                  <p className="muted">{u.email}</p>
                </div>
                <div className="holding-values">
                  <strong>{u.planId}</strong>
                  <span className="muted tiny">
                    {u.role} · {u.provider || 'dev'}
                  </span>
                </div>
              </div>
              <p className="tiny">{u.holdingsCount} holdings</p>
            </li>
          ))}
        </ul>
      )}

      {tab === 'tickers' && (
        <>
          <div className="quick-links">
            <button
              type="button"
              className="btn primary"
              disabled={syncBusy || refreshBusy}
              onClick={() => void onSyncTickers()}
            >
              {syncBusy ? 'Syncing tickers…' : 'Sync all tickers'}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={syncBusy || refreshBusy}
              onClick={() => void onRefreshPrices()}
            >
              {refreshBusy ? 'Refreshing LTP…' : 'Refresh prices now'}
            </button>
          </div>
          <p className="muted tiny">
            Sync loads the NSE liquid universe (~100 names), then pulls LTP /
            SMA50 / SMA200 / 52W from Yahoo Finance (free chart API). Prices also
            refresh automatically every hour.
          </p>
          {syncNote && <p className="positive">{syncNote}</p>}
          <ul className="holding-list">
            {tickers.map((t) => (
              <li key={t.id} className="holding-card">
                <div className="holding-main">
                  <div>
                    <p className="eyebrow">{t.crn}</p>
                    <h3>
                      {t.symbol} · {t.exchange}
                    </h3>
                    <p className="muted">{t.name}</p>
                  </div>
                  <div className="holding-values">
                    <strong>₹{t.price.toLocaleString('en-IN')}</strong>
                    <span className="muted tiny">{t.sector}</span>
                  </div>
                </div>
                <p className="tiny">
                  SMA50 {t.sma50} · SMA200 {t.sma200} · 52W {t.low52w}–{t.high52w}
                  {' · '}
                  {new Date(t.updatedAt).toLocaleString('en-IN')}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'plans' && (
        <div className="plan-grid">
          {plans.map((p) => (
            <article key={p.id} className="plan-card static">
              <strong>{p.name}</strong>
              <span>₹{p.priceInr}/mo</span>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="tiny muted">
                Limits: {p.limits.holdings} holdings · {p.limits.alertsPerDay}{' '}
                alerts/day
              </p>
            </article>
          ))}
        </div>
      )}

      {tab === 'features' && (
        <ul className="holding-list">
          {features.map((f) => (
            <li key={f.key} className="holding-card">
              <div className="holding-main">
                <div>
                  <h3>{f.name}</h3>
                  <p className="muted tiny">{f.key}</p>
                  <p className="tiny">Plans: {f.plans.join(', ')}</p>
                </div>
                <button
                  type="button"
                  className={`btn ${f.enabled ? 'primary' : 'secondary'}`}
                  onClick={() => void toggleFeature(f)}
                >
                  {f.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'signin' && googleForm && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSaveGoogle(e)}>
          <h2>Google Sign-in</h2>
          <p className="muted">
            Stored in <code>app_settings</code>. Add this callback URL in Google
            Cloud Console.
          </p>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={googleForm.enabled}
              onChange={(e) =>
                setGoogleForm({ ...googleForm, enabled: e.target.checked })
              }
            />
            Enable Google Sign-in
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={googleForm.allowDevLogin}
              onChange={(e) =>
                setGoogleForm({
                  ...googleForm,
                  allowDevLogin: e.target.checked,
                })
              }
            />
            Allow demo / email login
          </label>

          <label>
            Google Client ID
            <input
              value={googleForm.clientId}
              onChange={(e) =>
                setGoogleForm({ ...googleForm, clientId: e.target.value })
              }
              placeholder="xxxx.apps.googleusercontent.com"
              autoComplete="off"
            />
          </label>

          <label>
            Google Client Secret
            <input
              type="password"
              value={googleForm.clientSecret}
              onChange={(e) =>
                setGoogleForm({ ...googleForm, clientSecret: e.target.value })
              }
              placeholder={
                googleForm.hasClientSecret
                  ? '•••••••• (leave blank to keep)'
                  : 'Enter client secret'
              }
              autoComplete="new-password"
            />
          </label>

          <label>
            Callback URL
            <input
              value={googleForm.callbackUrl}
              onChange={(e) =>
                setGoogleForm({ ...googleForm, callbackUrl: e.target.value })
              }
              placeholder="http://localhost:3003/auth/google/callback"
            />
          </label>

          {saved && <p className="positive">Sign-in settings saved</p>}
          <button className="btn primary" type="submit">
            Save sign-in settings
          </button>
        </form>
      )}

      {tab === 'telegram' && telegramForm && (
        <form
          className="panel-block form-grid"
          onSubmit={(e) => void onSaveTelegram(e)}
        >
          <h2>Telegram bot</h2>
          <p className="muted">
            Users save their phone in Settings, send <code>hi</code> to the bot,
            then share that phone so Fin Goat can store their <code>chat_id</code>{' '}
            for alerts.
          </p>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={telegramForm.enabled}
              onChange={(e) =>
                setTelegramForm({
                  ...telegramForm,
                  enabled: e.target.checked,
                })
              }
            />
            Enable Telegram notifications
          </label>

          <label>
            Bot token (from BotFather)
            <input
              type="password"
              value={telegramForm.botToken}
              onChange={(e) =>
                setTelegramForm({
                  ...telegramForm,
                  botToken: e.target.value,
                })
              }
              placeholder={
                telegramForm.hasBotToken
                  ? '•••••••• (leave blank to keep)'
                  : '123456:ABC…'
              }
              autoComplete="new-password"
            />
          </label>

          <label>
            Webhook URL (public HTTPS)
            <input
              value={telegramForm.webhookUrl}
              onChange={(e) =>
                setTelegramForm({
                  ...telegramForm,
                  webhookUrl: e.target.value,
                })
              }
              placeholder="https://api.example.com/telegram/webhook"
            />
          </label>

          <label>
            Webhook secret (optional)
            <input
              type="password"
              value={telegramForm.webhookSecret}
              onChange={(e) =>
                setTelegramForm({
                  ...telegramForm,
                  webhookSecret: e.target.value,
                })
              }
              placeholder={
                telegramForm.hasWebhookSecret
                  ? '•••••••• (leave blank to keep)'
                  : 'Optional shared secret'
              }
              autoComplete="new-password"
            />
          </label>

          {telegramForm.botUsername && (
            <p className="muted tiny">
              Bot username: @{telegramForm.botUsername}
            </p>
          )}
          {telegramSaved && <p className="positive">Telegram settings saved</p>}
          <button className="btn primary" type="submit">
            Save Telegram settings
          </button>
        </form>
      )}

      {tab === 'telegram' && (
        <div className="panel-block form-grid">
          <h2>Send test message</h2>
          <p className="muted">
            Looks up a user that has both this phone and a stored{' '}
            <code>chat_id</code>, then sends a Telegram message.
          </p>
          <label>
            User phone
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+91…"
            />
          </label>
          {testNote && <p className="positive">{testNote}</p>}
          <button
            type="button"
            className="btn secondary"
            disabled={testBusy || !testPhone.trim()}
            onClick={() => void onSendTelegramTest()}
          >
            {testBusy ? 'Sending…' : 'Send test message'}
          </button>
        </div>
      )}

      {tab === 'cron' && (
        <ul className="holding-list">
          {cronRuns.map((run) => (
            <li key={run.id} className="holding-card">
              <div className="holding-main">
                <div>
                  <h3>{run.job}</h3>
                  <p className="muted tiny">
                    {new Date(run.startedAt).toLocaleString('en-IN')}
                  </p>
                </div>
                <strong className={run.status === 'error' ? 'negative' : 'positive'}>
                  {run.status}
                </strong>
              </div>
              {run.detail && <p className="tiny">{run.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
