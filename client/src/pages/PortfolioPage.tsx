import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
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

export function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<'investment' | 'loan'>('investment');
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

  function renderHolding(h: Holding) {
    const liability = isLiabilityHolding(h);
    const displayValue = liability ? Math.abs(h.currentValue) : h.currentValue;
    const gain = liability ? 0 : h.currentValue - h.investedValue;
    const pct =
      !liability && h.investedValue !== 0
        ? (gain / Math.abs(h.investedValue)) * 100
        : 0;
    const loanType =
      typeof h.meta?.loanType === 'string' ? h.meta.loanType : undefined;

    return (
      <li key={h.id} className="holding-card">
        <div className="holding-main">
          <div>
            <p className="eyebrow">
              {liability
                ? loanType
                  ? loanTypeLabel(loanType)
                  : assetLabel(h.assetType)
                : assetLabel(h.assetType)}
            </p>
            <h3>{h.name}</h3>
            {h.notes && !liability && <p className="muted tiny">{h.notes}</p>}
          </div>
          <div className="holding-values">
            <strong className={liability ? 'negative' : undefined}>
              {liability ? `−${formatInr(displayValue)}` : formatInr(displayValue)}
            </strong>
            {!liability && (
              <span className={gain >= 0 ? 'positive' : 'negative'}>
                {formatPct(pct)}
              </span>
            )}
            {liability && <span className="muted tiny">Outstanding</span>}
          </div>
        </div>
        <div className="holding-meta">
          {!liability && <span>Invested {formatInr(h.investedValue)}</span>}
          {liability && h.meta?.emi != null && (
            <span>EMI ₹{Number(h.meta.emi).toLocaleString('en-IN')}</span>
          )}
          {h.meta?.rate != null && <span>Rate {String(h.meta.rate)}%</span>}
          {h.assetType === 'mutual_fund' && h.meta?.nav != null && (
            <span>NAV ₹{Number(h.meta.nav).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</span>
          )}
          {h.assetType === 'mutual_fund' && h.meta?.sip != null && (
            <span>SIP ₹{Number(h.meta.sip).toLocaleString('en-IN')}/mo</span>
          )}
          {h.quantity != null && (
            <span>
              {h.assetType === 'mutual_fund' ? 'Units' : 'Qty'} {h.quantity}
            </span>
          )}
          <button type="button" className="linkish" onClick={() => startEdit(h)}>
            Edit
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => void onDelete(h.id)}
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Portfolio</p>
        <h1>Personal investment tracker</h1>
        <p className="muted">
          Track investments (including money you lent) separately from loans you
          owe.
        </p>
      </header>

      <div className="quick-links">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            resetForm('investment');
            setShowForm(true);
          }}
        >
          Add investment
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            resetForm('loan');
            setShowForm(true);
          }}
        >
          Add loan
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

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Investments</h2>
          <span className="muted tiny">{investments.length}</span>
        </div>
        <p className="muted tiny">
          Includes stocks, MFs, EPF, FDs, gold, real estate, and cash lending.
        </p>
        <ul className="holding-list">
          {investments.length === 0 && (
            <li className="muted">No investments yet</li>
          )}
          {investments.map(renderHolding)}
        </ul>
      </section>

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Loans</h2>
          <span className="muted tiny">{loans.length}</span>
        </div>
        <p className="muted tiny">
          Home, car, personal, education, gold, business, and other liabilities.
        </p>
        <ul className="holding-list">
          {loans.length === 0 && <li className="muted">No loans added</li>}
          {loans.map(renderHolding)}
        </ul>
      </section>
    </div>
  );
}
