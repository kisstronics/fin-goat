import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import type {
  CronJobKey,
  CronRun,
  CronSettings,
  FeatureFlag,
  Plan,
  PlanId,
  Role,
  Ticker,
  User,
} from '../types';

const TICKER_PAGE_SIZE = 25;
const TICKER_SEARCH_DEBOUNCE_MS = 250;
const USER_PAGE_SIZE = 25;
const USER_SEARCH_DEBOUNCE_MS = 250;

type AdminUserRow = User & { holdingsCount: number };
type UserSortKey =
  | 'name'
  | 'email'
  | 'role'
  | 'planId'
  | 'provider'
  | 'holdingsCount'
  | 'createdAt';

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
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | Role>('all');
  const [userPlanFilter, setUserPlanFilter] = useState<'all' | PlanId>('all');
  const [userProviderFilter, setUserProviderFilter] = useState<'all' | string>(
    'all',
  );
  const [userSortKey, setUserSortKey] = useState<UserSortKey>('createdAt');
  const [userSortDir, setUserSortDir] = useState<'asc' | 'desc'>('desc');
  const [userPage, setUserPage] = useState(1);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [tickerPage, setTickerPage] = useState(1);
  const [tickerTotal, setTickerTotal] = useState(0);
  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerSearch, setTickerSearch] = useState('');
  const [screenerFilter, setScreenerFilter] = useState<'all' | 'yes' | 'no'>(
    'all',
  );
  const [announcementsFilter, setAnnouncementsFilter] = useState<
    'all' | 'yes' | 'no'
  >('all');
  const [tickerBusy, setTickerBusy] = useState(false);
  const [inclusionBusyId, setInclusionBusyId] = useState<string | null>(null);
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

  const tickerTotalPages = useMemo(
    () => Math.max(1, Math.ceil(tickerTotal / TICKER_PAGE_SIZE) || 1),
    [tickerTotal],
  );

  const tickerRangeLabel = useMemo(() => {
    if (!tickerTotal) return '0 tickers';
    const from = (tickerPage - 1) * TICKER_PAGE_SIZE + 1;
    const to = Math.min(tickerPage * TICKER_PAGE_SIZE, tickerTotal);
    return `${from}–${to} of ${tickerTotal.toLocaleString('en-IN')}`;
  }, [tickerPage, tickerTotal]);

  const userProviders = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) set.add(u.provider || 'dev');
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    let rows = users.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userPlanFilter !== 'all' && u.planId !== userPlanFilter) return false;
      if (
        userProviderFilter !== 'all' &&
        (u.provider || 'dev') !== userProviderFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    });

    const dir = userSortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[userSortKey];
      const bv = b[userSortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
        sensitivity: 'base',
      }) * dir;
    });
    return rows;
  }, [
    users,
    userSearch,
    userRoleFilter,
    userPlanFilter,
    userProviderFilter,
    userSortKey,
    userSortDir,
  ]);

  const userTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE) || 1),
    [filteredUsers.length],
  );

  const safeUserPage = Math.min(userPage, userTotalPages);

  const pagedUsers = useMemo(() => {
    const start = (safeUserPage - 1) * USER_PAGE_SIZE;
    return filteredUsers.slice(start, start + USER_PAGE_SIZE);
  }, [filteredUsers, safeUserPage]);

  const userRangeLabel = useMemo(() => {
    if (!filteredUsers.length) return '0 users';
    const from = (safeUserPage - 1) * USER_PAGE_SIZE + 1;
    const to = Math.min(safeUserPage * USER_PAGE_SIZE, filteredUsers.length);
    return `${from}–${to} of ${filteredUsers.length.toLocaleString('en-IN')}`;
  }, [filteredUsers.length, safeUserPage]);

  function toggleUserSort(key: UserSortKey) {
    if (userSortKey === key) {
      setUserSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setUserSortKey(key);
    setUserSortDir(key === 'createdAt' || key === 'holdingsCount' ? 'desc' : 'asc');
  }

  function userSortMarker(key: UserSortKey) {
    if (userSortKey !== key) return '';
    return userSortDir === 'asc' ? ' ↑' : ' ↓';
  }

  async function loadTickersPage(
    page = tickerPage,
    q = tickerSearch,
    screener = screenerFilter,
    announcements = announcementsFilter,
  ) {
    setTickerBusy(true);
    try {
      const result = await api.adminTickers({
        page,
        pageSize: TICKER_PAGE_SIZE,
        q: q || undefined,
        screener,
        announcements,
      });
      setTickers(result.items);
      setTickerTotal(result.total);
      const maxPage = Math.max(1, Math.ceil(result.total / TICKER_PAGE_SIZE) || 1);
      setTickerPage(Math.min(result.page, maxPage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickers');
    } finally {
      setTickerBusy(false);
    }
  }

  // Live search: debounce keystrokes into the query used by the fetch effect.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = tickerQuery.trim();
      if (next === tickerSearch) return;
      setTickerPage(1);
      setTickerSearch(next);
    }, TICKER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [tickerQuery, tickerSearch]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = userQuery.trim();
      if (next === userSearch) return;
      setUserPage(1);
      setUserSearch(next);
    }, USER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [userQuery, userSearch]);

  useEffect(() => {
    setUserPage(1);
  }, [userRoleFilter, userPlanFilter, userProviderFilter]);

  useEffect(() => {
    if (userPage > userTotalPages) setUserPage(userTotalPages);
  }, [userPage, userTotalPages]);

  useEffect(() => {
    void (async () => {
      try {
        const [ov, u, p, f, c, cronCfg, settings, templates, coverage] =
          await Promise.all([
            api.adminOverview(),
            api.adminUsers(),
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

  useEffect(() => {
    if (tab !== 'tickers') return;
    void loadTickersPage(
      tickerPage,
      tickerSearch,
      screenerFilter,
      announcementsFilter,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when tab/page/search/filters change
  }, [tab, tickerPage, tickerSearch, screenerFilter, announcementsFilter]);

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
      await loadTickersPage(1, tickerSearch);
      setOverview(await api.adminOverview());
      setSyncNote(
        `Synced ${result.universeSize} NSE symbols · created ${result.created} · updated ${result.updated}` +
          `${result.totalInDb != null ? ` · DB now ${result.totalInDb}` : ''}` +
          `. ${result.source}. ${result.priceRefresh.note || 'Price refresh started in background.'}`,
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
      await loadTickersPage(tickerPage, tickerSearch);
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

  async function onToggleTickerInclusion(
    ticker: Ticker,
    field: 'includeInScreener' | 'includeInAnnouncements',
    value: boolean,
  ) {
    setInclusionBusyId(ticker.id);
    setError('');
    try {
      const next = await api.updateTickerInclusion(ticker.id, {
        [field]: value,
      });
      setTickers((rows) => rows.map((r) => (r.id === next.id ? next : r)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update ticker options',
      );
    } finally {
      setInclusionBusyId(null);
    }
  }

  async function onBackfillHistory() {
    setHistoryBusy(true);
    setSyncNote('');
    setError('');
    try {
      const result = await api.backfillHistory(25);
      setHistoryCoverage(result.coverage);
      await loadTickersPage(tickerPage, tickerSearch);
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
    <div className="page-stack admin-console">
      <div className="chip-row wrap admin-tabs" role="tablist" aria-label="Admin sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
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
        <>
          <div className="ticker-filters">
            <input
              type="search"
              placeholder="Search name, email, or phone"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              aria-label="Search users"
            />
            <label className="filter-field">
              <span>Role</span>
              <select
                value={userRoleFilter}
                onChange={(e) =>
                  setUserRoleFilter(e.target.value as 'all' | Role)
                }
              >
                <option value="all">All</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="filter-field">
              <span>Plan</span>
              <select
                value={userPlanFilter}
                onChange={(e) =>
                  setUserPlanFilter(e.target.value as 'all' | PlanId)
                }
              >
                <option value="all">All</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
                <option value="family">Family</option>
              </select>
            </label>
            <label className="filter-field">
              <span>Provider</span>
              <select
                value={userProviderFilter}
                onChange={(e) => setUserProviderFilter(e.target.value)}
              >
                <option value="all">All</option>
                {userProviders.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            {(userQuery ||
              userSearch ||
              userRoleFilter !== 'all' ||
              userPlanFilter !== 'all' ||
              userProviderFilter !== 'all') && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setUserQuery('');
                  setUserSearch('');
                  setUserRoleFilter('all');
                  setUserPlanFilter('all');
                  setUserProviderFilter('all');
                  setUserPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="table-toolbar">
            <p className="muted tiny">
              {`${userRangeLabel} · ${userTotalPages} page${userTotalPages === 1 ? '' : 's'}`}
            </p>
            <div className="table-pager">
              <button
                type="button"
                className="icon-btn"
                disabled={safeUserPage <= 1}
                onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                title="Previous"
              >
                ‹
              </button>
              <label className="page-jump">
                <span className="muted tiny">Page</span>
                <input
                  type="number"
                  min={1}
                  max={userTotalPages}
                  value={safeUserPage}
                  disabled={userTotalPages <= 1}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    setUserPage(
                      Math.min(
                        userTotalPages,
                        Math.max(1, Math.floor(raw)),
                      ),
                    );
                  }}
                  aria-label="Page number"
                />
                <span className="muted tiny">of {userTotalPages}</span>
              </label>
              <button
                type="button"
                className="icon-btn"
                disabled={safeUserPage >= userTotalPages}
                onClick={() =>
                  setUserPage((p) => Math.min(userTotalPages, p + 1))
                }
                aria-label="Next page"
                title="Next"
              >
                ›
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('name')}
                    >
                      Name{userSortMarker('name')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('email')}
                    >
                      Email{userSortMarker('email')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('role')}
                    >
                      Role{userSortMarker('role')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('planId')}
                    >
                      Plan{userSortMarker('planId')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('provider')}
                    >
                      Provider{userSortMarker('provider')}
                    </button>
                  </th>
                  <th className="num">
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('holdingsCount')}
                    >
                      Holdings{userSortMarker('holdingsCount')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => toggleUserSort('createdAt')}
                    >
                      Joined{userSortMarker('createdAt')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.phone && (
                        <div className="muted tiny">{u.phone}</div>
                      )}
                    </td>
                    <td>{u.email}</td>
                    <td className="nowrap">{u.role}</td>
                    <td className="nowrap">{u.planId}</td>
                    <td className="nowrap">{u.provider || 'dev'}</td>
                    <td className="num">{u.holdingsCount}</td>
                    <td className="nowrap">
                      {new Date(u.createdAt).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))}
                {pagedUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No users match the current search or filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'tickers' && (
        <>
          <div className="ticker-actions">
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
          {historyCoverage && (
            <p className="muted tiny">
              History coverage: {historyCoverage.complete}/{historyCoverage.total}{' '}
              tickers with ≥{historyCoverage.minBars} daily bars · only checked
              tickers run in screener / announcement jobs
            </p>
          )}
          {syncNote && <p className="positive">{syncNote}</p>}

          <div className="ticker-filters">
            <input
              type="search"
              placeholder="Search symbol, name, or CRN"
              value={tickerQuery}
              onChange={(e) => setTickerQuery(e.target.value)}
              aria-label="Search tickers"
            />
            <label className="filter-field">
              <span>Screener</span>
              <select
                value={screenerFilter}
                onChange={(e) => {
                  setTickerPage(1);
                  setScreenerFilter(e.target.value as 'all' | 'yes' | 'no');
                }}
              >
                <option value="all">All</option>
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </label>
            <label className="filter-field">
              <span>Announcements</span>
              <select
                value={announcementsFilter}
                onChange={(e) => {
                  setTickerPage(1);
                  setAnnouncementsFilter(
                    e.target.value as 'all' | 'yes' | 'no',
                  );
                }}
              >
                <option value="all">All</option>
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </label>
            {(tickerQuery ||
              tickerSearch ||
              screenerFilter !== 'all' ||
              announcementsFilter !== 'all') && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setTickerQuery('');
                  setTickerSearch('');
                  setScreenerFilter('all');
                  setAnnouncementsFilter('all');
                  setTickerPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="table-toolbar">
            <p className="muted tiny">
              {tickerBusy
                ? 'Loading…'
                : `${tickerRangeLabel} · ${tickerTotalPages} page${tickerTotalPages === 1 ? '' : 's'}`}
            </p>
            <div className="table-pager">
              <button
                type="button"
                className="icon-btn"
                disabled={tickerBusy || tickerPage <= 1}
                onClick={() => setTickerPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                title="Previous"
              >
                ‹
              </button>
              <label className="page-jump">
                <span className="muted tiny">Page</span>
                <input
                  type="number"
                  min={1}
                  max={tickerTotalPages}
                  value={tickerPage}
                  disabled={tickerBusy || tickerTotalPages <= 1}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    const next = Math.min(
                      tickerTotalPages,
                      Math.max(1, Math.floor(raw)),
                    );
                    setTickerPage(next);
                  }}
                  aria-label="Page number"
                />
                <span className="muted tiny">of {tickerTotalPages}</span>
              </label>
              <button
                type="button"
                className="icon-btn"
                disabled={tickerBusy || tickerPage >= tickerTotalPages}
                onClick={() =>
                  setTickerPage((p) => Math.min(tickerTotalPages, p + 1))
                }
                aria-label="Next page"
                title="Next"
              >
                ›
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Sector</th>
                  <th className="num">Price</th>
                  <th>Include in screener</th>
                  <th>Include in announcements</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t) => {
                  const busy = inclusionBusyId === t.id;
                  return (
                    <tr key={t.id}>
                      <td className="nowrap">
                        <strong>{t.symbol}</strong>
                        <span className="muted tiny"> {t.exchange}</span>
                        <div className="muted tiny">{t.crn}</div>
                      </td>
                      <td>{t.name}</td>
                      <td>{t.sector || '—'}</td>
                      <td className="num">
                        ₹{t.price.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <label className="check-inline">
                          <input
                            type="checkbox"
                            checked={t.includeInScreener}
                            disabled={busy}
                            onChange={(e) =>
                              void onToggleTickerInclusion(
                                t,
                                'includeInScreener',
                                e.target.checked,
                              )
                            }
                          />
                          Screener
                        </label>
                      </td>
                      <td>
                        <label className="check-inline">
                          <input
                            type="checkbox"
                            checked={t.includeInAnnouncements}
                            disabled={busy}
                            onChange={(e) =>
                              void onToggleTickerInclusion(
                                t,
                                'includeInAnnouncements',
                                e.target.checked,
                              )
                            }
                          />
                          Announcements
                        </label>
                      </td>
                    </tr>
                  );
                })}
                {!tickerBusy && tickers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No tickers found. Sync the NSE list or clear the search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`${f.name} ${f.enabled ? 'enabled' : 'disabled'}`}
                  className={`switch-toggle${f.enabled ? ' on' : ''}`}
                  onClick={() => void toggleFeature(f)}
                >
                  <span className="switch-thumb" aria-hidden="true" />
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
                    role="switch"
                    aria-checked={cronSettings.masterEnabled}
                    aria-label="Master cron switch"
                    className={`switch-toggle${cronSettings.masterEnabled ? ' on' : ''}`}
                    disabled={cronBusy}
                    onClick={() => void toggleCronMaster()}
                  >
                    <span className="switch-thumb" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <ul className="holding-list">
                {cronSettings.jobs.map((job) => {
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
                          role="switch"
                          aria-checked={job.enabled}
                          aria-label={`${job.name} ${job.enabled ? 'on' : 'off'}`}
                          className={`switch-toggle${job.enabled ? ' on' : ''}`}
                          disabled={cronBusy}
                          onClick={() => void toggleCronJob(job.key)}
                        >
                          <span className="switch-thumb" aria-hidden="true" />
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
            <p className="muted tiny">Last 10 cron runs</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {cronRuns.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No cron runs logged yet
                      </td>
                    </tr>
                  )}
                  {cronRuns.slice(0, 10).map((run) => (
                    <tr key={run.id}>
                      <td className="nowrap">
                        <strong>{run.job}</strong>
                      </td>
                      <td className="nowrap">
                        {new Date(run.startedAt).toLocaleString('en-IN')}
                      </td>
                      <td>
                        <strong
                          className={
                            run.status === 'error'
                              ? 'negative'
                              : run.status === 'ok'
                                ? 'positive'
                                : undefined
                          }
                        >
                          {run.status}
                        </strong>
                      </td>
                      <td className="reason-cell">{run.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
