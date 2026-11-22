import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { AlertLog, Plan, PlanId, User } from '../types';

type TelegramInfo = {
  enabled: boolean;
  botUsername: string;
  linked: boolean;
};

type SettingsTab = 'profile' | 'notifications' | 'plan' | 'alerts';

export function SettingsPage() {
  const { refresh } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [user, setUser] = useState<User | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [telegram, setTelegram] = useState<TelegramInfo | null>(null);
  const [saved, setSaved] = useState(false);
  const [testNote, setTestNote] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.settings(), api.alerts()])
      .then(([settings, alertRows]) => {
        setUser(settings.user);
        setPlans(settings.plans);
        setTelegram(settings.telegram);
        setAlerts(alertRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaved(false);
    setError('');
    try {
      const next = await api.updateSettings({
        name: user.name,
        phone: user.phone,
        notifyEmail: user.notifyEmail,
        notifyTelegram: user.notifyTelegram,
        planId: user.planId,
      });
      setUser(next.user);
      setPlans(next.plans);
      setTelegram(next.telegram);
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function onSendTest() {
    setTestBusy(true);
    setTestNote('');
    setError('');
    try {
      const result = await api.sendTelegramTest();
      setTestNote(result.message);
      const settings = await api.settings();
      setUser(settings.user);
      setTelegram(settings.telegram);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTestBusy(false);
    }
  }

  if (!user) return <p className="muted">Loading settings…</p>;

  const botUrl = telegram?.botUsername
    ? `https://t.me/${telegram.botUsername}`
    : null;

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Plans & notifications</h1>
      </header>

      <div className="chip-row">
        <button
          type="button"
          className={`chip${tab === 'profile' ? ' active' : ''}`}
          onClick={() => setTab('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          className={`chip${tab === 'notifications' ? ' active' : ''}`}
          onClick={() => setTab('notifications')}
        >
          Notifications
        </button>
        <button
          type="button"
          className={`chip${tab === 'plan' ? ' active' : ''}`}
          onClick={() => setTab('plan')}
        >
          Plan
        </button>
        <button
          type="button"
          className={`chip${tab === 'alerts' ? ' active' : ''}`}
          onClick={() => setTab('alerts')}
        >
          Alerts
        </button>
      </div>

      {error && tab !== 'alerts' && <p className="error">{error}</p>}
      {saved && tab !== 'alerts' && <p className="positive">Saved</p>}

      {tab === 'profile' && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSave(e)}>
          <label>
            Display name
            <input
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
            />
          </label>
          <label>
            Telegram phone
            <input
              value={user.phone || ''}
              onChange={(e) => setUser({ ...user, phone: e.target.value })}
              placeholder="+91…"
            />
          </label>

          <div className="panel-note">
            <p>
              Status:{' '}
              <strong>
                {telegram?.linked
                  ? 'Telegram linked'
                  : 'Not linked — send hi to the bot'}
              </strong>
            </p>
            <ol className="tiny muted">
              <li>Save your Telegram phone number here (with country code).</li>
              <li>
                Open{' '}
                {botUrl ? (
                  <a href={botUrl} target="_blank" rel="noreferrer">
                    @{telegram?.botUsername}
                  </a>
                ) : (
                  'the Fin Goat Telegram bot'
                )}{' '}
                and send <code>hi</code>.
              </li>
              <li>Share the same phone number when the bot asks.</li>
            </ol>
            {!telegram?.enabled && (
              <p className="muted tiny">
                Telegram bot is not configured yet. Ask an admin to set the
                token.
              </p>
            )}
          </div>

          <button className="btn primary" type="submit">
            Save profile
          </button>
        </form>
      )}

      {tab === 'notifications' && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSave(e)}>
          <fieldset className="toggle-set">
            <legend>Channels</legend>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={user.notifyEmail}
                onChange={(e) =>
                  setUser({ ...user, notifyEmail: e.target.checked })
                }
              />
              Email notifications
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={user.notifyTelegram}
                onChange={(e) =>
                  setUser({ ...user, notifyTelegram: e.target.checked })
                }
              />
              Telegram notifications
            </label>
          </fieldset>

          <div className="panel-note">
            <p className="muted tiny">
              Telegram must be linked under Profile before test messages work.
            </p>
            <button
              type="button"
              className="btn secondary"
              disabled={!telegram?.linked || testBusy}
              onClick={() => void onSendTest()}
            >
              {testBusy ? 'Sending…' : 'Send test message'}
            </button>
            {testNote && <p className="positive tiny">{testNote}</p>}
          </div>

          <button className="btn primary" type="submit">
            Save notifications
          </button>
        </form>
      )}

      {tab === 'plan' && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSave(e)}>
          <fieldset className="plan-set">
            <legend>Plan</legend>
            <div className="plan-grid">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`plan-card${user.planId === plan.id ? ' active' : ''}`}
                  onClick={() =>
                    setUser({ ...user, planId: plan.id as PlanId })
                  }
                >
                  <strong>{plan.name}</strong>
                  <span>
                    {plan.priceInr === 0 ? 'Free' : `₹${plan.priceInr}/mo`}
                  </span>
                  <ul>
                    {plan.features.slice(0, 3).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </fieldset>

          <button className="btn primary" type="submit">
            Save plan
          </button>
        </form>
      )}

      {tab === 'alerts' && (
        <section className="panel-block">
          <h2>Recent alerts</h2>
          {error && <p className="error">{error}</p>}
          <ul className="alert-list">
            {alerts.length === 0 && <li className="muted">No alerts yet</li>}
            {alerts.map((a) => {
              const open = expandedAlertId === a.id;
              return (
                <li key={a.id} className={`alert-row${open ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="alert-summary"
                    onClick={() =>
                      setExpandedAlertId((id) => (id === a.id ? null : a.id))
                    }
                    aria-expanded={open}
                  >
                    <span className="alert-summary-main">
                      <strong>
                        [{a.channel}] {a.title}
                      </strong>
                      <span className="muted tiny">
                        {new Date(a.createdAt).toLocaleString('en-IN')} ·{' '}
                        {a.status}
                      </span>
                    </span>
                    <span className="alert-chevron" aria-hidden>
                      {open ? '▾' : '▸'}
                    </span>
                  </button>
                  {open && <pre className="alert-body">{a.body}</pre>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
