import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatInr } from '../lib/format';
import type {
  NetWorthProjection,
  RecurringFrequency,
  RecurringItem,
  RecurringKind,
} from '../types';

const INCOME_CATEGORIES = [
  'salary',
  'business',
  'rent',
  'interest',
  'dividend',
  'other',
];
const EXPENSE_CATEGORIES = [
  'rent',
  'groceries',
  'utilities',
  'transport',
  'school',
  'insurance',
  'subscriptions',
  'other',
];

export function RecurringPage() {
  const now = new Date();
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [monthlySip, setMonthlySip] = useState(0);
  const [monthlySurplus, setMonthlySurplus] = useState(0);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: 'expense' as RecurringKind,
    name: '',
    category: 'other',
    amount: '',
    frequency: 'monthly' as RecurringFrequency,
    dayOfMonth: '',
    notes: '',
  });
  const [projMonth, setProjMonth] = useState(now.getMonth() + 1);
  const [projYear, setProjYear] = useState(now.getFullYear() + 1);
  const [projection, setProjection] = useState<NetWorthProjection | null>(null);
  const [projBusy, setProjBusy] = useState(false);

  const incomeItems = useMemo(
    () => items.filter((i) => i.kind === 'income'),
    [items],
  );
  const expenseItems = useMemo(
    () => items.filter((i) => i.kind === 'expense'),
    [items],
  );

  async function load() {
    const data = await api.recurring();
    setItems(data.items);
    setMonthlyIncome(data.monthlyIncome);
    setMonthlyExpenses(data.monthlyExpenses);
    setMonthlySip(data.monthlySip || 0);
    setMonthlySurplus(data.monthlySurplus);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
  }, []);

  function resetForm(kind: RecurringKind = 'expense') {
    setEditingId(null);
    setForm({
      kind,
      name: '',
      category: kind === 'income' ? 'salary' : 'other',
      amount: '',
      frequency: 'monthly',
      dayOfMonth: '',
      notes: '',
    });
  }

  function startEdit(item: RecurringItem) {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      kind: item.kind,
      name: item.name,
      category: item.category || 'other',
      amount: String(item.amount),
      frequency: item.frequency,
      dayOfMonth: item.dayOfMonth != null ? String(item.dayOfMonth) : '',
      notes: item.notes || '',
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const needsDay =
        form.kind === 'expense' && form.frequency === 'monthly';
      if (needsDay && !form.dayOfMonth) {
        setError('Monthly expenses require a deduction date (day of month)');
        return;
      }
      const day = form.dayOfMonth ? Number(form.dayOfMonth) : undefined;
      const payload = {
        kind: form.kind,
        name: form.name,
        category: form.category,
        amount: Number(form.amount) || 0,
        frequency: form.frequency,
        dayOfMonth: day,
        notes: form.notes || undefined,
        active: true,
      };
      if (editingId) {
        await api.updateRecurring(editingId, {
          ...payload,
          dayOfMonth: day ?? null,
        });
      } else {
        await api.createRecurring(payload);
      }
      resetForm(form.kind);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  async function onDelete(id: string) {
    await api.deleteRecurring(id);
    await load();
  }

  async function onToggle(item: RecurringItem) {
    await api.updateRecurring(item.id, { active: !item.active });
    await load();
  }

  async function onProject(e: FormEvent) {
    e.preventDefault();
    setProjBusy(true);
    setError('');
    try {
      setProjection(await api.projectNetWorth(projMonth, projYear));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projection failed');
    } finally {
      setProjBusy(false);
    }
  }

  function renderItem(item: RecurringItem) {
    return (
      <li key={item.id} className="holding-card">
        <div className="holding-main">
          <div>
            <p className="eyebrow">{item.category}</p>
            <h3>{item.name}</h3>
            <p className="muted tiny">
              {item.frequency}
              {item.dayOfMonth != null ? ` · day ${item.dayOfMonth}` : ''}
              {!item.active ? ' · paused' : ''}
            </p>
          </div>
          <div className="holding-values">
            <strong className={item.kind === 'expense' ? 'negative' : 'positive'}>
              {item.kind === 'expense' ? '−' : '+'}
              {formatInr(item.amount)}
            </strong>
          </div>
        </div>
        <div className="holding-meta">
          <button type="button" className="linkish" onClick={() => startEdit(item)}>
            Edit
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => void onToggle(item)}
          >
            {item.active ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => void onDelete(item.id)}
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  const categories =
    form.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Recurring</p>
        <h1>Income, expenses & projection</h1>
        <p className="muted">
          Track regular cashflows, then project net worth for a future month.
        </p>
      </header>

      <section className="stat-grid">
        <article className="stat-block">
          <p className="eyebrow">Monthly income</p>
          <strong className="positive">{formatInr(monthlyIncome, true)}</strong>
        </article>
        <article className="stat-block">
          <p className="eyebrow">Monthly expenses</p>
          <strong className="negative">{formatInr(monthlyExpenses, true)}</strong>
        </article>
        <article className="stat-block">
          <p className="eyebrow">Monthly SIP</p>
          <strong className="negative">{formatInr(monthlySip, true)}</strong>
        </article>
        <article className="stat-block">
          <p className="eyebrow">Surplus</p>
          <strong className={monthlySurplus >= 0 ? 'positive' : 'negative'}>
            {formatInr(monthlySurplus, true)}
          </strong>
          <p className="muted tiny">After expenses &amp; SIP</p>
        </article>
      </section>

      <div className="quick-links">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            resetForm('income');
            setShowForm(true);
          }}
        >
          Add income
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            resetForm('expense');
            setShowForm(true);
          }}
        >
          Add expense
        </button>
        {showForm && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setShowForm(false);
              resetForm();
            }}
          >
            Cancel
          </button>
        )}
        <Link to="/portfolio" className="text-link">
          Portfolio
        </Link>
      </div>

      {showForm && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSubmit(e)}>
          <h2>{editingId ? 'Edit recurring item' : 'New recurring item'}</h2>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${form.kind === 'income' ? ' active' : ''}`}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  kind: 'income',
                  category: 'salary',
                }))
              }
            >
              Income
            </button>
            <button
              type="button"
              className={`chip${form.kind === 'expense' ? ' active' : ''}`}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  kind: 'expense',
                  category: 'other',
                }))
              }
            >
              Expense
            </button>
          </div>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={
                form.kind === 'income' ? 'e.g. Salary' : 'e.g. House rent'
              }
            />
          </label>
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (₹)
            <input
              type="number"
              required
              min={0}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <label>
            Frequency
            <select
              value={form.frequency}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  frequency: e.target.value as RecurringFrequency,
                }))
              }
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {(form.kind === 'expense' || form.dayOfMonth) && (
            <label>
              Deduction date (day of month)
              <input
                type="number"
                min={1}
                max={31}
                required={form.kind === 'expense' && form.frequency === 'monthly'}
                value={form.dayOfMonth}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dayOfMonth: e.target.value }))
                }
                placeholder={
                  form.frequency === 'monthly'
                    ? 'e.g. 5 for the 5th of each month'
                    : 'Optional day for reminders'
                }
              />
            </label>
          )}
          {form.kind === 'expense' && form.frequency === 'monthly' && (
            <p className="muted tiny">
              Required for monthly expenses. Reminder notifications fire on this
              day via Admin → Cron → Expense deduction reminders.
            </p>
          )}
          <label>
            Notes
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <button className="btn primary" type="submit">
            {editingId ? 'Update' : 'Save'}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Regular income</h2>
          <span className="muted tiny">{incomeItems.length}</span>
        </div>
        <ul className="holding-list">
          {incomeItems.length === 0 && (
            <li className="muted">No income items yet</li>
          )}
          {incomeItems.map(renderItem)}
        </ul>
      </section>

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Regular expenses</h2>
          <span className="muted tiny">{expenseItems.length}</span>
        </div>
        <ul className="holding-list">
          {expenseItems.length === 0 && (
            <li className="muted">No expense items yet</li>
          )}
          {expenseItems.map(renderItem)}
        </ul>
      </section>

      <section className="panel-block">
        <h2>Project net worth</h2>
        <p className="muted">
          Uses current portfolio, recurring cashflows, loan EMIs, and SIPs to
          estimate a future month.
        </p>
        <form className="form-grid" onSubmit={(e) => void onProject(e)}>
          <label>
            Month
            <select
              value={projMonth}
              onChange={(e) => setProjMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString('en-IN', {
                    month: 'long',
                  })}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              min={now.getFullYear()}
              max={2100}
              value={projYear}
              onChange={(e) => setProjYear(Number(e.target.value))}
            />
          </label>
          <button className="btn primary" type="submit" disabled={projBusy}>
            {projBusy ? 'Calculating…' : 'Project'}
          </button>
        </form>

        {projection && (
          <div className="page-stack" style={{ marginTop: 16 }}>
            <section className="hero-metric">
              <p className="eyebrow">
                Projected ·{' '}
                {new Date(
                  projection.targetYear,
                  projection.targetMonth - 1,
                  1,
                ).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
              </p>
              <p className="hero-value">
                {formatInr(projection.projectedNetWorth, true)}
              </p>
              <p className="muted">
                {projection.monthsAhead} months ahead · current{' '}
                {formatInr(projection.currentNetWorth, true)}
              </p>
            </section>
            <section className="stat-grid">
              <article className="stat-block">
                <p className="eyebrow">Projected assets</p>
                <strong>{formatInr(projection.projectedAssets, true)}</strong>
              </article>
              <article className="stat-block">
                <p className="eyebrow">Projected liabilities</p>
                <strong>
                  {formatInr(projection.projectedLiabilities, true)}
                </strong>
              </article>
              <article className="stat-block">
                <p className="eyebrow">Monthly EMI / SIP</p>
                <strong>
                  {formatInr(projection.monthlyEmi)} /{' '}
                  {formatInr(projection.monthlySip)}
                </strong>
              </article>
            </section>
            <ul className="alloc-list">
              {projection.breakdown.map((row) => (
                <li key={row.label}>
                  <div className="alloc-top">
                    <span>{row.label}</span>
                    <span>{formatInr(row.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
