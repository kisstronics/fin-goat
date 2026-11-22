import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type {
  CronJobKey,
  CronRun,
  CronSettings,
  FeatureFlag,
  Plan,
  Ticker,
  User,
} from '../types';

type Tab =
  | 'overview'
  | 'users'
  | 'tickers'
  | 'plans'
  | 'features'
  | 'signin'
  | 'email'
  | 'emailTemplates'
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

type SmtpForm = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  hasPass: boolean;
};

type EmailTemplateRow = {
  key: string;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  enabled: boolean;
  updatedAt: string;
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
  const [cronSettings, setCronSettings] = useState<CronSettings | null>(null);
  const [cronExprs, setCronExprs] = useState<Partial<Record<CronJobKey, string>>>(
    {},
  );
  const [cronBusy, setCronBusy] = useState(false);
  const [cronSaved, setCronSaved] = useState('');
  const [announceSyncBusy, setAnnounceSyncBusy] = useState(false);
  const [announceSyncNote, setAnnounceSyncNote] = useState('');
  const [googleForm, setGoogleForm] = useState<GoogleForm | null>(null);
  const [telegramForm, setTelegramForm] = useState<TelegramForm | null>(null);
  const [smtpForm, setSmtpForm] = useState<SmtpForm | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [templateDraft, setTemplateDraft] = useState<EmailTemplateRow | null>(
    null,
  );
  const [testPhone, setTestPhone] = useState('');
  const [testNote, setTestNote] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailNote, setTestEmailNote] = useState('');
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [error, setError] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [historyCoverage, setHistoryCoverage] = useState<{
    total: number;
    complete: number;
    minBars: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [ov, u, t, p, f, c, cronCfg, settings, templates, coverage] =
          await Promise.all([
            api.adminOverview(),
            api.adminUsers(),
            api.adminTickers(),
            api.adminPlans(),
            api.adminFeatures(),
            api.cronRuns(),
            api.cronSettings(),
            api.adminAppSettings(),
            api.adminEmailTemplates(),
            api.adminHistoryCoverage(),
          ]);
        setOverview(ov);
        setUsers(u);
        setTickers(t);
        setHistoryCoverage(coverage);
        setPlans(p);
        setFeatures(f);
        setCronRuns(c);
        setCronSettings(cronCfg);
        setCronExprs(
          Object.fromEntries(
            cronCfg.jobs.map((j) => [j.key, j.expression]),
          ) as Partial<Record<CronJobKey, string>>,
        );
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
        setSmtpForm({
          enabled: settings.smtp.enabled,
          host: settings.smtp.host,
          port: settings.smtp.port,
          secure: settings.smtp.secure,
          user: settings.smtp.user,
          pass: '',
          fromName: settings.smtp.fromName,
          fromEmail: settings.smtp.fromEmail,
          hasPass: settings.smtp.hasPass,
        });
        setEmailTemplates(templates);
        if (templates[0]) {
          setSelectedTemplateKey(templates[0].key);
          setTemplateDraft({ ...templates[0] });
        }
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
        `Synced ${result.universeSize} symbols · created ${result.created} · updated ${result.updated}. ${result.source}. ${result.priceRefresh.note || 'Price refresh started in background.'}`,
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
      setHistoryCoverage(await api.adminHistoryCoverage());
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

  async function onBackfillHistory() {
    setHistoryBusy(true);
    setSyncNote('');
    setError('');
    try {
      const result = await api.backfillHistory(25);
      setHistoryCoverage(result.coverage);
      setTickers(await api.adminTickers());
      setSyncNote(
        result.skipped
          ? `History backfill skipped (${result.reason})`
          : `History batch: ${result.updated}/${result.attempted} · coverage ${result.coverage.complete}/${result.coverage.total} tickers with ≥${result.coverage.minBars} daily bars`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'History backfill failed',
      );
    } finally {
      setHistoryBusy(false);
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

  async function onSaveSmtp(e: FormEvent) {
    e.preventDefault();
    if (!smtpForm) return;
    setSmtpSaved(false);
    setError('');
    try {
      const next = await api.updateAdminAppSettings({
        smtp: {
          enabled: smtpForm.enabled,
          host: smtpForm.host,
          port: Number(smtpForm.port) || 587,
          secure: smtpForm.secure,
          user: smtpForm.user,
          pass: smtpForm.pass || undefined,
          fromName: smtpForm.fromName,
          fromEmail: smtpForm.fromEmail,
        },
      });
      setSmtpForm({
        enabled: next.smtp.enabled,
        host: next.smtp.host,
        port: next.smtp.port,
        secure: next.smtp.secure,
        user: next.smtp.user,
        pass: '',
        fromName: next.smtp.fromName,
        fromEmail: next.smtp.fromEmail,
        hasPass: next.smtp.hasPass,
      });
      setSmtpSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save SMTP settings',
      );
    }
  }

  async function onSendEmailTest() {
    setTestEmailBusy(true);
    setTestEmailNote('');
    setError('');
    try {
      const result = await api.adminSendEmailTest(testEmailTo);
      setTestEmailNote(`${result.message} → ${result.to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setTestEmailBusy(false);
    }
  }

  function selectTemplate(key: string) {
    const row = emailTemplates.find((t) => t.key === key);
    setSelectedTemplateKey(key);
    setTemplateDraft(row ? { ...row } : null);
    setTemplateSaved(false);
  }

  async function onSaveTemplate(e: FormEvent) {
    e.preventDefault();
    if (!templateDraft) return;
    setTemplateSaved(false);
    setError('');
    try {
      const next = await api.updateEmailTemplate(templateDraft.key, {
        name: templateDraft.name,
        description: templateDraft.description,
        subject: templateDraft.subject,
        bodyHtml: templateDraft.bodyHtml,
        bodyText: templateDraft.bodyText,
        enabled: templateDraft.enabled,
      });
      setEmailTemplates((rows) =>
        rows.map((r) => (r.key === next.key ? next : r)),
      );
      setTemplateDraft({ ...next });
      setTemplateSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save email template',
      );
    }
  }

  async function onResetTemplate() {
    if (!templateDraft) return;
    setError('');
    setTemplateSaved(false);
    try {
      const next = await api.resetEmailTemplate(templateDraft.key);
      setEmailTemplates((rows) =>
        rows.map((r) => (r.key === next.key ? next : r)),
      );
      setTemplateDraft({ ...next });
      setTemplateSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reset email template',
      );
    }
  }

  async function toggleCronMaster() {
    if (!cronSettings) return;
    setCronBusy(true);
    setError('');
    setCronSaved('');
    try {
      const next = await api.updateCronSettings({
        masterEnabled: !cronSettings.masterEnabled,
      });
      setCronSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update cron');
    } finally {
      setCronBusy(false);
    }
  }

  async function toggleCronJob(key: CronJobKey) {
    if (!cronSettings) return;
    const current = cronSettings.jobs.find((j) => j.key === key);
    if (!current) return;
    setCronBusy(true);
    setError('');
    setCronSaved('');
    try {
      const next = await api.updateCronSettings({
        jobs: { [key]: !current.enabled },
      });
      setCronSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update cron');
    } finally {
      setCronBusy(false);
    }
  }

  async function saveCronExpression(key: CronJobKey) {
    const expression = (cronExprs[key] || '').trim();
    if (!expression) {
      setError('Cron expression cannot be empty');
      return;
    }
    setCronBusy(true);
    setError('');
    setCronSaved('');
    try {
      const next = await api.updateCronSettings({
        expressions: { [key]: expression },
      });
      setCronSettings(next);
      setCronExprs(
        Object.fromEntries(
          next.jobs.map((j) => [j.key, j.expression]),
        ) as Partial<Record<CronJobKey, string>>,
      );
      const job = next.jobs.find((j) => j.key === key);
      setCronSaved(
        job
          ? `Saved ${job.name}: ${job.expression} (${job.schedule})`
          : 'Cron schedule saved',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update cron');
    } finally {
      setCronBusy(false);
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
    { id: 'email', label: 'Email' },
    { id: 'emailTemplates', label: 'Email Templates' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'cron', label: 'Cron' },
  ];

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Console</h1>
        <p className="muted">
          Users, CRN tickers, plans, features, Google Sign-in, SMTP email,
          templates, Telegram, and job runs.
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
              disabled={syncBusy || refreshBusy || historyBusy}
              onClick={() => void onSyncTickers()}
            >
              {syncBusy ? 'Syncing tickers…' : 'Sync all tickers'}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={syncBusy || refreshBusy || historyBusy}
              onClick={() => void onRefreshPrices()}
            >
              {refreshBusy ? 'Refreshing LTP…' : 'Refresh prices now'}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={syncBusy || refreshBusy || historyBusy}
              onClick={() => void onBackfillHistory()}
            >
              {historyBusy
                ? 'Backfilling 1Y history…'
                : 'Backfill 1Y history (batch)'}
            </button>
          </div>
          <p className="muted tiny">
            Sync loads the full NSE equity master list (~2,000–2,700 symbols from
            EQUITY_L.csv), then starts Yahoo LTP refresh in the background. 1Y
            daily OHLCV is loaded in batches (admin button or cron every 20m) —
            not all tickers at once. Opening a stock page also pulls 1Y on demand.
          </p>
          {historyCoverage && (
            <p className="muted tiny">
              History coverage: {historyCoverage.complete}/{historyCoverage.total}{' '}
              tickers with ≥{historyCoverage.minBars} daily bars
            </p>
          )}
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

      {tab === 'email' && smtpForm && (
        <form
          className="panel-block form-grid"
          onSubmit={(e) => void onSaveSmtp(e)}
        >
          <h2>SMTP email</h2>
          <p className="muted">
            Stored in <code>app_settings</code>. Used for screener digests, NSE
            announcement alerts, and expense reminders when users enable email
            notifications.
          </p>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={smtpForm.enabled}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, enabled: e.target.checked })
              }
            />
            Enable email notifications
          </label>

          <label>
            SMTP host
            <input
              value={smtpForm.host}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, host: e.target.value })
              }
              placeholder="smtp.gmail.com"
              autoComplete="off"
            />
          </label>

          <label>
            Port
            <input
              type="number"
              value={smtpForm.port}
              onChange={(e) =>
                setSmtpForm({
                  ...smtpForm,
                  port: Number(e.target.value) || 587,
                })
              }
              placeholder="587"
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={smtpForm.secure}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, secure: e.target.checked })
              }
            />
            Use TLS/SSL (secure)
          </label>

          <label>
            Username
            <input
              value={smtpForm.user}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, user: e.target.value })
              }
              placeholder="apikey or SMTP user"
              autoComplete="off"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={smtpForm.pass}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, pass: e.target.value })
              }
              placeholder={
                smtpForm.hasPass
                  ? '•••••••• (leave blank to keep)'
                  : 'SMTP password / app password'
              }
              autoComplete="new-password"
            />
          </label>

          <label>
            From name
            <input
              value={smtpForm.fromName}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, fromName: e.target.value })
              }
              placeholder="Fin Goat"
            />
          </label>

          <label>
            From email
            <input
              type="email"
              value={smtpForm.fromEmail}
              onChange={(e) =>
                setSmtpForm({ ...smtpForm, fromEmail: e.target.value })
              }
              placeholder="alerts@example.com"
            />
          </label>

          {smtpSaved && <p className="positive">SMTP settings saved</p>}
          <button className="btn primary" type="submit">
            Save SMTP settings
          </button>
        </form>
      )}

      {tab === 'email' && (
        <div className="panel-block form-grid">
          <h2>Send test email</h2>
          <p className="muted">
            Sends the <code>test_email</code> template using the saved SMTP
            settings.
          </p>
          <label>
            Recipient email
            <input
              type="email"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {testEmailNote && <p className="positive">{testEmailNote}</p>}
          <button
            type="button"
            className="btn secondary"
            disabled={testEmailBusy || !testEmailTo.trim()}
            onClick={() => void onSendEmailTest()}
          >
            {testEmailBusy ? 'Sending…' : 'Send test email'}
          </button>
        </div>
      )}

      {tab === 'emailTemplates' && (
        <div className="page-stack">
          <div className="chip-row wrap">
            {emailTemplates.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`chip${selectedTemplateKey === t.key ? ' active' : ''}`}
                onClick={() => selectTemplate(t.key)}
              >
                {t.name}
              </button>
            ))}
          </div>

          {templateDraft && (
            <form
              className="panel-block form-grid"
              onSubmit={(e) => void onSaveTemplate(e)}
            >
              <h2>{templateDraft.name}</h2>
              <p className="muted tiny">{templateDraft.description}</p>
              <p className="muted tiny">
                Key: <code>{templateDraft.key}</code>
              </p>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={templateDraft.enabled}
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      enabled: e.target.checked,
                    })
                  }
                />
                Template enabled
              </label>

              <label>
                Display name
                <input
                  value={templateDraft.name}
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      name: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Subject
                <input
                  value={templateDraft.subject}
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      subject: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                HTML body
                <textarea
                  rows={10}
                  value={templateDraft.bodyHtml}
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      bodyHtml: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Plain-text body
                <textarea
                  rows={8}
                  value={templateDraft.bodyText}
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      bodyText: e.target.value,
                    })
                  }
                />
              </label>

              {templateSaved && (
                <p className="positive">Email template saved</p>
              )}
              <div className="quick-links">
                <button className="btn primary" type="submit">
                  Save template
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void onResetTemplate()}
                >
                  Reset to default
                </button>
              </div>
            </form>
          )}
        </div>
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
        <div className="page-stack">
          {cronSettings && (
            <section className="panel-block">
              <h2>Cron controls</h2>
              <p className="muted">
                Turn jobs on/off and edit cron expressions (5 fields: minute hour
                day month weekday). Manual ticker sync / price refresh from the
                Tickers tab still work when crons are off.
              </p>
              {cronSaved && <p className="positive">{cronSaved}</p>}
              <div className="quick-links" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={announceSyncBusy}
                  onClick={() => {
                    setAnnounceSyncBusy(true);
                    setAnnounceSyncNote('');
                    setError('');
                    void api
                      .syncAnnouncements()
                      .then((r) => {
                        setAnnounceSyncNote(
                          `NSE sync: watched ${r.watchedSymbols}, fetched ${r.fetched}, new ${r.inserted}, notified ${r.notified} (${r.detail})`,
                        );
                        return api.cronRuns();
                      })
                      .then(setCronRuns)
                      .catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : 'Announcement sync failed',
                        ),
                      )
                      .finally(() => setAnnounceSyncBusy(false));
                  }}
                >
                  {announceSyncBusy
                    ? 'Syncing NSE announcements…'
                    : 'Run NSE announcements now'}
                </button>
              </div>
              {announceSyncNote && (
                <p className="positive">{announceSyncNote}</p>
              )}

              <div className="holding-card" style={{ marginBottom: 12 }}>
                <div className="holding-main">
                  <div>
                    <h3>All scheduled jobs</h3>
                    <p className="muted tiny">
                      Master switch — disables every cron below when off.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`btn ${cronSettings.masterEnabled ? 'primary' : 'secondary'}`}
                    disabled={cronBusy}
                    onClick={() => void toggleCronMaster()}
                  >
                    {cronSettings.masterEnabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              <ul className="holding-list">
                {cronSettings.jobs.map((job) => {
                  const effective =
                    cronSettings.masterEnabled && job.enabled;
                  const dirty =
                    (cronExprs[job.key] || '').trim() !== job.expression;
                  return (
                    <li key={job.key} className="holding-card">
                      <div className="holding-main">
                        <div>
                          <h3>{job.name}</h3>
                          <p className="muted tiny">{job.schedule}</p>
                          <p className="tiny">{job.description}</p>
                          {!cronSettings.masterEnabled && job.enabled && (
                            <p className="muted tiny">
                              Enabled, but blocked by master switch.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`btn ${effective ? 'primary' : 'secondary'}`}
                          disabled={cronBusy}
                          onClick={() => void toggleCronJob(job.key)}
                        >
                          {job.enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                      <label style={{ display: 'block', marginTop: 10 }}>
                        Cron expression
                        <input
                          value={cronExprs[job.key] ?? job.expression}
                          onChange={(e) =>
                            setCronExprs((prev) => ({
                              ...prev,
                              [job.key]: e.target.value,
                            }))
                          }
                          placeholder="e.g. */10 * * * *"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <p className="muted tiny">
                        Examples: <code>*/10 * * * *</code> every 10m ·{' '}
                        <code>0 * * * *</code> hourly · <code>0 7 * * *</code>{' '}
                        daily 7:00 · <code>0 8 * * *</code> daily 8:00
                      </p>
                      <div className="quick-links" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={cronBusy || !dirty}
                          onClick={() => void saveCronExpression(job.key)}
                        >
                          {dirty ? 'Save schedule' : 'Saved'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="panel-block">
            <h2>Recent runs</h2>
            <ul className="holding-list">
              {cronRuns.length === 0 && (
                <li className="muted">No cron runs logged yet</li>
              )}
              {cronRuns.map((run) => (
                <li key={run.id} className="holding-card">
                  <div className="holding-main">
                    <div>
                      <h3>{run.job}</h3>
                      <p className="muted tiny">
                        {new Date(run.startedAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <strong
                      className={
                        run.status === 'error' ? 'negative' : 'positive'
                      }
                    >
                      {run.status}
                    </strong>
                  </div>
                  {run.detail && <p className="tiny">{run.detail}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
