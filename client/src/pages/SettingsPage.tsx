import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { AlertLog, Plan, PlanId, User } from '../types';

export function SettingsPage() {
  const { refresh } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([api.settings(), api.alerts()])
      .then(([settings, alertRows]) => {
        setUser(settings.user);
        setPlans(settings.plans);
        setAlerts(alertRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaved(false);
    try {
      const next = await api.updateSettings({
        name: user.name,
        phone: user.phone,
        telegramChatId: user.telegramChatId,
        notifyEmail: user.notifyEmail,
        notifyTelegram: user.notifyTelegram,
        planId: user.planId,
      });
      setUser(next.user);
      setPlans(next.plans);
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  if (!user) return <p className="muted">Loading settings…</p>;

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Plans & notifications</h1>
      </header>

      <form className="panel-block form-grid" onSubmit={(e) => void onSave(e)}>
        <label>
          Display name
          <input
            value={user.name}
            onChange={(e) => setUser({ ...user, name: e.target.value })}
          />
        </label>
        <label>
          Phone (Telegram)
          <input
            value={user.phone || ''}
            onChange={(e) => setUser({ ...user, phone: e.target.value })}
            placeholder="+91…"
          />
        </label>
        <label>
          Telegram chat ID
          <input
            value={user.telegramChatId || ''}
            onChange={(e) =>
              setUser({ ...user, telegramChatId: e.target.value })
            }
          />
        </label>

        <fieldset className="toggle-set">
          <legend>Notifications</legend>
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

        {error && <p className="error">{error}</p>}
        {saved && <p className="positive">Saved</p>}
        <button className="btn primary" type="submit">
          Save settings
        </button>
      </form>

      <section className="panel-block">
        <h2>Recent alerts</h2>
        <ul className="action-list">
          {alerts.length === 0 && <li className="muted">No alerts yet</li>}
          {alerts.map((a) => (
            <li key={a.id}>
              <strong>
                [{a.channel}] {a.title}
              </strong>
              <p className="muted tiny">{new Date(a.createdAt).toLocaleString('en-IN')}</p>
              <pre className="alert-body">{a.body}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
