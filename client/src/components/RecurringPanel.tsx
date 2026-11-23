import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatInr } from '../lib/format';
import type {
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

type SortKey =
  | 'name'
  | 'category'
  | 'amount'
  | 'frequency'
  | 'dayOfMonth'
  | 'active'
  | 'updatedAt';

const PAGE_SIZES = [10, 25, 50];

export function RecurringPanel({
  kind,
  onCountsChange,
}: {
  kind: RecurringKind;
  onCountsChange?: (counts: { income: number; expense: number }) => void;
}) {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [monthlySip, setMonthlySip] = useState(0);
  const [monthlySurplus, setMonthlySurplus] = useState(0);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>(
    'all',
  );
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState({
    kind: kind as RecurringKind,
    name: '',
    category: kind === 'income' ? 'salary' : 'other',
    amount: '',
    frequency: 'monthly' as RecurringFrequency,
    dayOfMonth: '',
    notes: '',
  });

  const incomeItems = useMemo(
    () => items.filter((i) => i.kind === 'income'),
    [items],
  );
  const expenseItems = useMemo(
    () => items.filter((i) => i.kind === 'expense'),
    [items],
  );
  const activeRows = kind === 'income' ? incomeItems : expenseItems;

  const categoryOptions = useMemo(() => {
    const set = new Set(activeRows.map((i) => i.category || 'other'));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [activeRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = activeRows;
    if (q) {
      rows = rows.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q) ||
          (i.notes || '').toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== 'all') {
      rows = rows.filter((i) => (i.category || 'other') === categoryFilter);
    }
    if (statusFilter === 'active') rows = rows.filter((i) => i.active);
    if (statusFilter === 'paused') rows = rows.filter((i) => !i.active);

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av =
        sortKey === 'name'
          ? a.name
          : sortKey === 'category'
            ? a.category
            : sortKey === 'amount'
              ? a.amount
              : sortKey === 'frequency'
                ? a.frequency
                : sortKey === 'dayOfMonth'
                  ? a.dayOfMonth ?? 0
                  : sortKey === 'active'
                    ? a.active
                      ? 1
                      : 0
                    : a.updatedAt;
      const bv =
        sortKey === 'name'
          ? b.name
          : sortKey === 'category'
            ? b.category
            : sortKey === 'amount'
              ? b.amount
              : sortKey === 'frequency'
                ? b.frequency
                : sortKey === 'dayOfMonth'
                  ? b.dayOfMonth ?? 0
                  : sortKey === 'active'
                    ? b.active
                      ? 1
                      : 0
                    : b.updatedAt;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [
    activeRows,
    query,
    categoryFilter,
    statusFilter,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const rangeLabel = useMemo(() => {
    if (!filtered.length) return '0';
    const from = (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, filtered.length);
    return `${from}–${to} of ${filtered.length.toLocaleString('en-IN')}`;
  }, [filtered.length, safePage, pageSize]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(
      key === 'amount' || key === 'updatedAt' || key === 'dayOfMonth'
        ? 'desc'
        : 'asc',
    );
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  async function load() {
    const data = await api.recurring();
    setItems(data.items);
    setMonthlyIncome(data.monthlyIncome);
    setMonthlyExpenses(data.monthlyExpenses);
    setMonthlySip(data.monthlySip || 0);
    setMonthlySurplus(data.monthlySurplus);
    onCountsChange?.({
      income: data.items.filter((i) => i.kind === 'income').length,
      expense: data.items.filter((i) => i.kind === 'expense').length,
    });
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount / kind change
  }, [kind]);

  useEffect(() => {
    setQuery('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setPage(1);
    setSortKey('updatedAt');
    setSortDir('desc');
    setShowForm(false);
    resetForm(kind);
  }, [kind]);

  function resetForm(nextKind: RecurringKind = kind) {
    setEditingId(null);
    setForm({
      kind: nextKind,
      name: '',
      category: nextKind === 'income' ? 'salary' : 'other',
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
      resetForm(kind);
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

  const categories =
    form.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="page-stack">
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

      <div className="ticker-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            resetForm(kind);
            setShowForm(true);
          }}
        >
          {kind === 'income' ? 'Add income' : 'Add expense'}
        </button>
        {showForm && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setShowForm(false);
              resetForm(kind);
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSubmit(e)}>
          <h2>
            {editingId
              ? `Edit ${form.kind}`
              : kind === 'income'
                ? 'New income'
                : 'New expense'}
          </h2>
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

      <div className="ticker-filters">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={`Search ${kind} name, category, or notes`}
          aria-label="Search recurring items"
        />
        <label className="filter-field">
          <span>Category</span>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'paused');
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {(query || categoryFilter !== 'all' || statusFilter !== 'all') && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setQuery('');
              setCategoryFilter('all');
              setStatusFilter('all');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="table-toolbar">
        <p className="muted tiny">
          {rangeLabel} {kind === 'income' ? 'income' : 'expenses'} · {totalPages}{' '}
          page{totalPages === 1 ? '' : 's'}
        </p>
        <div className="table-pager">
          <button
            type="button"
            className="icon-btn"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            ‹
          </button>
          <label className="page-jump">
            <span className="muted tiny">Page</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={safePage}
              disabled={totalPages <= 1}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                setPage(Math.min(totalPages, Math.max(1, Math.floor(raw))));
              }}
              aria-label="Page number"
            />
            <span className="muted tiny">of {totalPages}</span>
          </label>
          <button
            type="button"
            className="icon-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
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
                  onClick={() => toggleSort('name')}
                >
                  Name{sortMark('name')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('category')}
                >
                  Category{sortMark('category')}
                </button>
              </th>
              <th className="num">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('amount')}
                >
                  Amount{sortMark('amount')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('frequency')}
                >
                  Frequency{sortMark('frequency')}
                </button>
              </th>
              <th className="num">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('dayOfMonth')}
                >
                  Day{sortMark('dayOfMonth')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('active')}
                >
                  Status{sortMark('active')}
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No {kind === 'income' ? 'income' : 'expense'} items match the
                  current filters.
                </td>
              </tr>
            )}
            {pageRows.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  {item.notes && (
                    <div className="muted tiny">{item.notes}</div>
                  )}
                </td>
                <td className="nowrap">{item.category || '—'}</td>
                <td
                  className={`num ${item.kind === 'expense' ? 'negative' : 'positive'}`}
                >
                  {item.kind === 'expense' ? '−' : '+'}
                  {formatInr(item.amount)}
                </td>
                <td className="nowrap">{item.frequency}</td>
                <td className="num">
                  {item.dayOfMonth != null ? item.dayOfMonth : '—'}
                </td>
                <td className="nowrap">
                  {item.active ? 'Active' : 'Paused'}
                </td>
                <td className="num nowrap">
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </button>{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => void onToggle(item)}
                  >
                    {item.active ? 'Pause' : 'Resume'}
                  </button>{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => void onDelete(item.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
