import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { RecurringPanel } from '../components/RecurringPanel';
import {
  assetLabel,
  formatInr,
  formatPct,
  isLiabilityHolding,
  loanTypeLabel,
} from '../lib/format';
import type { AssetType, Holding } from '../types';

const INVESTMENT_TYPES: AssetType[] = [
  'stock',
  'mutual_fund',
  'epfo',
  'ppf',
  'nps',
  'fd',
  'gold',
  'real_estate',
  'cash_lending',
];

const LOAN_TYPES = [
  'home',
  'car',
  'personal',
  'education',
  'gold',
  'business',
  'credit_card',
  'other',
] as const;

type LoanType = (typeof LOAN_TYPES)[number];
type PortfolioTab = 'investments' | 'loans' | 'income' | 'expense';
type SortKey =
  | 'name'
  | 'type'
  | 'investedValue'
  | 'currentValue'
  | 'returnPct'
  | 'updatedAt';

const PAGE_SIZES = [10, 25, 50];
const PORTFOLIO_TABS: PortfolioTab[] = [
  'investments',
  'loans',
  'income',
  'expense',
];

function parseTab(raw: string | null): PortfolioTab {
  if (raw && PORTFOLIO_TABS.includes(raw as PortfolioTab)) {
    return raw as PortfolioTab;
  }
  return 'investments';
}

export function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<'investment' | 'loan'>('investment');
  const [tab, setTab] = useState<PortfolioTab>(() =>
    parseTab(searchParams.get('tab')),
  );
  const [recurringCounts, setRecurringCounts] = useState({
    income: 0,
    expense: 0,
  });
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const isRecurringTab = tab === 'income' || tab === 'expense';
  const [form, setForm] = useState({
    assetType: 'mutual_fund' as AssetType,
    loanType: 'home' as LoanType,
    name: '',
    investedValue: '',
    currentValue: '',
    emi: '',
    rate: '',
    isSip: false,
    sip: '',
    nav: '',
    units: '',
  });

  const investments = useMemo(
    () => holdings.filter((h) => !isLiabilityHolding(h)),
    [holdings],
  );
  const loans = useMemo(
    () => holdings.filter((h) => isLiabilityHolding(h)),
    [holdings],
  );

  const activeRows = tab === 'investments' ? investments : loans;

  const typeOptions = useMemo(() => {
    if (tab === 'investments') {
      const set = new Set(activeRows.map((h) => h.assetType));
      return INVESTMENT_TYPES.filter((t) => set.has(t));
    }
    const set = new Set(
      activeRows.map((h) =>
        typeof h.meta?.loanType === 'string' ? h.meta.loanType : 'other',
      ),
    );
    return LOAN_TYPES.filter((t) => set.has(t));
  }, [activeRows, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = activeRows;
    if (q) {
      rows = rows.filter((h) => {
        const typeLabel =
          tab === 'loans'
            ? loanTypeLabel(
                typeof h.meta?.loanType === 'string' ? h.meta.loanType : 'other',
              )
            : assetLabel(h.assetType);
        return (
          h.name.toLowerCase().includes(q) ||
          typeLabel.toLowerCase().includes(q) ||
          (h.notes || '').toLowerCase().includes(q)
        );
      });
    }
    if (typeFilter !== 'all') {
      rows = rows.filter((h) => {
        if (tab === 'loans') {
          const loanType =
            typeof h.meta?.loanType === 'string' ? h.meta.loanType : 'other';
          return loanType === typeFilter;
        }
        return h.assetType === typeFilter;
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const typeA =
        tab === 'loans'
          ? typeof a.meta?.loanType === 'string'
            ? a.meta.loanType
            : 'other'
          : a.assetType;
      const typeB =
        tab === 'loans'
          ? typeof b.meta?.loanType === 'string'
            ? b.meta.loanType
            : 'other'
          : b.assetType;
      const returnA =
        !isLiabilityHolding(a) && a.investedValue
          ? ((a.currentValue - a.investedValue) / Math.abs(a.investedValue)) * 100
          : 0;
      const returnB =
        !isLiabilityHolding(b) && b.investedValue
          ? ((b.currentValue - b.investedValue) / Math.abs(b.investedValue)) * 100
          : 0;
      const av =
        sortKey === 'name'
          ? a.name
          : sortKey === 'type'
            ? typeA
            : sortKey === 'investedValue'
              ? a.investedValue
              : sortKey === 'currentValue'
                ? Math.abs(a.currentValue)
                : sortKey === 'returnPct'
                  ? returnA
                  : a.updatedAt;
      const bv =
        sortKey === 'name'
          ? b.name
          : sortKey === 'type'
            ? typeB
            : sortKey === 'investedValue'
              ? b.investedValue
              : sortKey === 'currentValue'
                ? Math.abs(b.currentValue)
                : sortKey === 'returnPct'
                  ? returnB
                  : b.updatedAt;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [activeRows, query, typeFilter, sortKey, sortDir, tab]);

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
      key === 'currentValue' ||
        key === 'investedValue' ||
        key === 'returnPct' ||
        key === 'updatedAt'
        ? 'desc'
        : 'asc',
    );
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function switchTab(next: PortfolioTab) {
    setTab(next);
    setShowForm(false);
    setQuery('');
    setTypeFilter('all');
    setPage(1);
    setSortKey('updatedAt');
    setSortDir('desc');
    setSearchParams(
      next === 'investments' ? {} : { tab: next },
      { replace: true },
    );
  }

  async function load() {
    try {
      setHoldings(await api.holdings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const next = parseTab(searchParams.get('tab'));
    setTab(next);
  }, [searchParams]);

  useEffect(() => {
    if (isRecurringTab) return;
    void api
      .recurring()
      .then((data) => {
        setRecurringCounts({
          income: data.items.filter((i) => i.kind === 'income').length,
          expense: data.items.filter((i) => i.kind === 'expense').length,
        });
      })
      .catch(() => {
        // Counts are decorative; ignore failures here.
      });
  }, [isRecurringTab, holdings.length]);

  function resetForm(kind: 'investment' | 'loan' = 'investment') {
    setEntryKind(kind);
    setEditingId(null);
    setForm({
      assetType: kind === 'loan' ? 'loan' : 'mutual_fund',
      loanType: 'home',
      name: '',
      investedValue: '',
      currentValue: '',
      emi: '',
      rate: '',
      isSip: false,
      sip: '',
      nav: '',
      units: '',
    });
  }

  function mfCurrentValue(nav: string, units: string, fallback: string) {
    const n = Number(nav);
    const u = Number(units);
    if (Number.isFinite(n) && n > 0 && Number.isFinite(u) && u > 0) {
      return String(Math.round(n * u * 100) / 100);
    }
    return fallback;
  }

  function startEdit(h: Holding) {
    const liability = isLiabilityHolding(h);
    const loanType =
      typeof h.meta?.loanType === 'string' &&
      LOAN_TYPES.includes(h.meta.loanType as LoanType)
        ? (h.meta.loanType as LoanType)
        : 'other';
    const sipAmount =
      h.meta?.sip != null && Number.isFinite(Number(h.meta.sip))
        ? Number(h.meta.sip)
        : 0;
    setTab(liability ? 'loans' : 'investments');
    setEntryKind(liability ? 'loan' : 'investment');
    setEditingId(h.id);
    setShowForm(true);
    setForm({
      assetType: liability ? 'loan' : h.assetType,
      loanType,
      name: h.name,
      investedValue: String(h.investedValue || ''),
      currentValue: String(Math.abs(h.currentValue) || ''),
      emi: h.meta?.emi != null ? String(h.meta.emi) : '',
      rate: h.meta?.rate != null ? String(h.meta.rate) : '',
      isSip: Boolean(h.meta?.isSip) || sipAmount > 0,
      sip: sipAmount > 0 ? String(sipAmount) : '',
      nav: h.meta?.nav != null ? String(h.meta.nav) : '',
      units: h.quantity != null ? String(h.quantity) : '',
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const isLoan = entryKind === 'loan' || form.assetType === 'loan';
      const isMf = !isLoan && form.assetType === 'mutual_fund';
      const outstanding = Math.abs(Number(form.currentValue) || 0);
      const invested = Number(form.investedValue) || 0;
      const nav = Number(form.nav) || 0;
      const units =
        Number(form.units) ||
        (isMf && nav > 0 && invested > 0 ? invested / nav : 0);
      const currentFromNav =
        isMf && nav > 0 && units > 0 ? Math.round(nav * units * 100) / 100 : 0;

      const existing = editingId
        ? holdings.find((h) => h.id === editingId)
        : undefined;
      const priorMeta = { ...(existing?.meta || {}) };
      // Drop SIP fields when the SIP option is off so old amounts do not linger.
      delete priorMeta.isSip;
      delete priorMeta.sip;
      delete priorMeta.nav;
      delete priorMeta.loanType;
      delete priorMeta.emi;
      delete priorMeta.rate;

      let meta: Record<string, string | number | boolean> | undefined;
      if (isLoan) {
        meta = {
          ...priorMeta,
          loanType: form.loanType,
          ...(form.emi ? { emi: Number(form.emi) } : {}),
          ...(form.rate ? { rate: Number(form.rate) } : {}),
        };
      } else if (isMf) {
        meta = {
          ...priorMeta,
          ...(form.isSip ? { isSip: true } : {}),
          ...(form.isSip && form.sip ? { sip: Number(form.sip) } : {}),
          ...(nav > 0 ? { nav } : {}),
        };
      } else if (form.assetType === 'cash_lending') {
        meta = {
          ...priorMeta,
          ...(form.rate ? { rate: Number(form.rate) } : {}),
        };
      }

      const payload = {
        assetType: (isLoan ? 'loan' : form.assetType) as AssetType,
        name: form.name,
        investedValue: invested,
        currentValue: isLoan
          ? -outstanding
          : currentFromNav || Number(form.currentValue) || 0,
        quantity: isMf && units > 0 ? units : undefined,
        avgCost: isMf && units > 0 && invested > 0 ? invested / units : undefined,
        notes: isLoan ? 'Liability' : undefined,
        meta,
      };

      if (editingId) {
        await api.updateHolding(editingId, payload);
      } else {
        await api.createHolding(payload);
      }
      resetForm(entryKind);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  async function onDelete(id: string) {
    await api.deleteHolding(id);
    if (editingId === id) {
      resetForm();
      setShowForm(false);
    }
    await load();
  }

  return (
    <div className="page-stack market-console">
      <div
        className="chip-row wrap admin-tabs"
        role="tablist"
        aria-label="Portfolio sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'investments'}
          className={`chip${tab === 'investments' ? ' active' : ''}`}
          onClick={() => switchTab('investments')}
        >
          Investments ({investments.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'loans'}
          className={`chip${tab === 'loans' ? ' active' : ''}`}
          onClick={() => switchTab('loans')}
        >
          Loans ({loans.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'income'}
          className={`chip${tab === 'income' ? ' active' : ''}`}
          onClick={() => switchTab('income')}
        >
          Income ({recurringCounts.income})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'expense'}
          className={`chip${tab === 'expense' ? ' active' : ''}`}
          onClick={() => switchTab('expense')}
        >
          Expenses ({recurringCounts.expense})
        </button>
      </div>

      {isRecurringTab ? (
        <RecurringPanel
          kind={tab}
          onCountsChange={setRecurringCounts}
        />
      ) : (
        <>
      <div className="ticker-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            resetForm(tab === 'loans' ? 'loan' : 'investment');
            setShowForm(true);
          }}
        >
          {tab === 'loans' ? 'Add loan' : 'Add investment'}
        </button>
        {showForm && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setShowForm(false);
              resetForm(tab === 'loans' ? 'loan' : 'investment');
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel-block form-grid" onSubmit={(e) => void onSubmit(e)}>
          <h2>{editingId ? 'Edit entry' : 'New entry'}</h2>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${entryKind === 'investment' ? ' active' : ''}`}
              onClick={() => {
                if (editingId) {
                  setEntryKind('investment');
                  setForm((f) => ({ ...f, assetType: 'mutual_fund' }));
                } else {
                  resetForm('investment');
                  setShowForm(true);
                }
              }}
            >
              Investment
            </button>
            <button
              type="button"
              className={`chip${entryKind === 'loan' ? ' active' : ''}`}
              onClick={() => {
                if (editingId) {
                  setEntryKind('loan');
                  setForm((f) => ({ ...f, assetType: 'loan' }));
                } else {
                  resetForm('loan');
                  setShowForm(true);
                }
              }}
            >
              Loan (liability)
            </button>
          </div>

          {entryKind === 'investment' ? (
            <>
              <label>
                Investment type
                <select
                  value={form.assetType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      assetType: e.target.value as AssetType,
                    }))
                  }
                >
                  {INVESTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {assetLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              {form.assetType === 'cash_lending' && (
                <p className="muted tiny">
                  Money you lent to someone counts as an investment / receivable.
                </p>
              )}
            </>
          ) : (
            <>
              <label>
                Loan type
                <select
                  value={form.loanType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      loanType: e.target.value as LoanType,
                      assetType: 'loan',
                    }))
                  }
                >
                  {LOAN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {loanTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted tiny">
                Loans you owe (home, car, personal, etc.) reduce net worth — they
                are not investments.
              </p>
            </>
          )}

          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={
                entryKind === 'loan'
                  ? 'e.g. SBI Home Loan'
                  : form.assetType === 'cash_lending'
                    ? 'e.g. Loan to Rahul'
                    : 'Holding name'
              }
            />
          </label>

          {entryKind === 'investment' && form.assetType === 'mutual_fund' && (
            <>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.isSip}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isSip: e.target.checked }))
                  }
                />
                SIP investment
              </label>
              {form.isSip && (
                <label>
                  SIP amount (₹ / month)
                  <input
                    type="number"
                    min={0}
                    value={form.sip}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sip: e.target.value }))
                    }
                    placeholder="e.g. 5000"
                  />
                </label>
              )}
              <label>
                Current NAV (₹)
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.nav}
                  onChange={(e) => {
                    const nav = e.target.value;
                    setForm((f) => ({
                      ...f,
                      nav,
                      currentValue: mfCurrentValue(nav, f.units, f.currentValue),
                    }));
                  }}
                  placeholder="e.g. 84.25"
                />
              </label>
              <label>
                Units
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={form.units}
                  onChange={(e) => {
                    const units = e.target.value;
                    setForm((f) => ({
                      ...f,
                      units,
                      currentValue: mfCurrentValue(f.nav, units, f.currentValue),
                    }));
                  }}
                  placeholder="Optional — or derived from invested ÷ NAV"
                />
              </label>
            </>
          )}

          {entryKind === 'investment' && (
            <label>
              {form.assetType === 'mutual_fund'
                ? 'Current invested amount (₹)'
                : 'Invested / principal (₹)'}
              <input
                type="number"
                value={form.investedValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, investedValue: e.target.value }))
                }
              />
            </label>
          )}

          <label>
            {entryKind === 'loan'
              ? 'Outstanding amount (₹)'
              : form.assetType === 'mutual_fund'
                ? 'Current value (₹)'
                : 'Current value (₹)'}
            <input
              type="number"
              required
              min={0}
              value={form.currentValue}
              onChange={(e) =>
                setForm((f) => ({ ...f, currentValue: e.target.value }))
              }
            />
          </label>
          {entryKind === 'investment' && form.assetType === 'mutual_fund' && (
            <p className="muted tiny">
              Current value auto-fills from units × NAV when both are set.
            </p>
          )}

          {entryKind === 'loan' && (
            <>
              <label>
                EMI (₹ / month)
                <input
                  type="number"
                  value={form.emi}
                  onChange={(e) => setForm((f) => ({ ...f, emi: e.target.value }))}
                />
              </label>
              <label>
                Interest rate (% p.a.)
                <input
                  type="number"
                  step="0.1"
                  value={form.rate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rate: e.target.value }))
                  }
                />
              </label>
            </>
          )}

          {entryKind === 'investment' && form.assetType === 'cash_lending' && (
            <label>
              Interest rate (% p.a.)
              <input
                type="number"
                step="0.1"
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              />
            </label>
          )}

          <button className="btn primary" type="submit">
            {editingId
              ? 'Update'
              : entryKind === 'loan'
                ? 'Save loan'
                : 'Save investment'}
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
          placeholder={
            tab === 'loans'
              ? 'Search loan name or type'
              : 'Search investment name or type'
          }
          aria-label="Search portfolio entries"
        />
        <label className="filter-field">
          <span>Type</span>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {tab === 'loans' ? loanTypeLabel(t) : assetLabel(t)}
              </option>
            ))}
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
        {(query || typeFilter !== 'all') && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setQuery('');
              setTypeFilter('all');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="table-toolbar">
        <p className="muted tiny">
          {rangeLabel} {tab} · {totalPages} page
          {totalPages === 1 ? '' : 's'}
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
                  onClick={() => toggleSort('type')}
                >
                  Type{sortMark('type')}
                </button>
              </th>
              {tab === 'investments' && (
                <th className="num">
                  <button
                    type="button"
                    className="th-btn"
                    onClick={() => toggleSort('investedValue')}
                  >
                    Invested{sortMark('investedValue')}
                  </button>
                </th>
              )}
              <th className="num">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('currentValue')}
                >
                  {tab === 'loans' ? 'Outstanding' : 'Value'}
                  {sortMark('currentValue')}
                </button>
              </th>
              {tab === 'investments' && (
                <th className="num">
                  <button
                    type="button"
                    className="th-btn"
                    onClick={() => toggleSort('returnPct')}
                  >
                    Return{sortMark('returnPct')}
                  </button>
                </th>
              )}
              {tab === 'loans' && <th className="num">EMI</th>}
              {tab === 'loans' && <th className="num">Rate</th>}
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('updatedAt')}
                >
                  Updated{sortMark('updatedAt')}
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={tab === 'loans' ? 7 : 7} className="muted">
                  {tab === 'loans'
                    ? 'No loans match the current filters.'
                    : 'No investments match the current filters.'}
                </td>
              </tr>
            )}
            {pageRows.map((h) => {
              const liability = isLiabilityHolding(h);
              const displayValue = Math.abs(h.currentValue);
              const gain = liability ? 0 : h.currentValue - h.investedValue;
              const pct =
                !liability && h.investedValue !== 0
                  ? (gain / Math.abs(h.investedValue)) * 100
                  : 0;
              const loanType =
                typeof h.meta?.loanType === 'string'
                  ? h.meta.loanType
                  : 'other';
              return (
                <tr key={h.id}>
                  <td>
                    <strong>{h.name}</strong>
                    {h.assetType === 'mutual_fund' && h.meta?.sip != null && (
                      <div className="muted tiny">
                        SIP ₹{Number(h.meta.sip).toLocaleString('en-IN')}/mo
                      </div>
                    )}
                  </td>
                  <td className="nowrap">
                    {liability
                      ? loanTypeLabel(loanType)
                      : assetLabel(h.assetType)}
                  </td>
                  {tab === 'investments' && (
                    <td className="num">{formatInr(h.investedValue)}</td>
                  )}
                  <td className={`num${liability ? ' negative' : ''}`}>
                    {liability
                      ? `−${formatInr(displayValue)}`
                      : formatInr(displayValue)}
                  </td>
                  {tab === 'investments' && (
                    <td
                      className={`num ${gain >= 0 ? 'positive' : 'negative'}`}
                    >
                      {formatPct(pct)}
                    </td>
                  )}
                  {tab === 'loans' && (
                    <td className="num">
                      {h.meta?.emi != null
                        ? formatInr(Number(h.meta.emi))
                        : '—'}
                    </td>
                  )}
                  {tab === 'loans' && (
                    <td className="num">
                      {h.meta?.rate != null ? `${h.meta.rate}%` : '—'}
                    </td>
                  )}
                  <td className="nowrap">
                    {new Date(h.updatedAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="num nowrap">
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => startEdit(h)}
                    >
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => void onDelete(h.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}
