import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { assetLabel, formatInr, formatPct, loanTypeLabel } from '../lib/format';
import type { DashboardData } from '../types';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .dashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading dashboard…</p>;

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Dashboard</p>
        <h1>Net worth at a glance</h1>
        <p className="muted">Updated {new Date(data.updatedAt).toLocaleString('en-IN')}</p>
      </header>

      <section className="hero-metric rise">
        <p className="eyebrow">Net worth</p>
        <p className="hero-value">{formatInr(data.netWorth, true)}</p>
        <p className={data.returnPct >= 0 ? 'positive' : 'negative'}>
          Portfolio return {formatPct(data.returnPct)} · {formatInr(data.absoluteReturn)}
        </p>
      </section>

      <section className="stat-grid">
        <article className="stat-block">
          <p className="eyebrow">Assets</p>
          <strong>{formatInr(data.totalAssets, true)}</strong>
        </article>
        <article className="stat-block">
          <p className="eyebrow">Liabilities</p>
          <strong>{formatInr(data.totalLiabilities, true)}</strong>
        </article>
        <article className="stat-block">
          <p className="eyebrow">Invested</p>
          <strong>{formatInr(data.invested, true)}</strong>
        </article>
      </section>

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Asset allocation</h2>
          <Link to="/portfolio" className="text-link">
            Manage
          </Link>
        </div>
        <ul className="alloc-list">
          {data.allocation.map((row) => (
            <li key={row.type}>
              <div className="alloc-top">
                <span>{assetLabel(row.type)}</span>
                <span>{row.pct.toFixed(1)}%</span>
              </div>
              <div className="alloc-bar">
                <span style={{ width: `${Math.min(row.pct, 100)}%` }} />
              </div>
              <p className="muted tiny">{formatInr(row.value)}</p>
            </li>
          ))}
        </ul>
      </section>

      {!!data.loanBreakdown?.length && (
        <section className="panel-block">
          <div className="panel-head-row">
            <h2>Loans outstanding</h2>
            <Link to="/portfolio" className="text-link">
              Manage
            </Link>
          </div>
          <ul className="alloc-list">
            {data.loanBreakdown.map((row) => (
              <li key={row.type}>
                <div className="alloc-top">
                  <span>{loanTypeLabel(row.type)}</span>
                  <span className="negative">{formatInr(row.value)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel-block">
        <h2>Action center</h2>
        <ul className="action-list">
          {data.actions.length === 0 && <li className="muted">No upcoming actions</li>}
          {data.actions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Recurring & projection</h2>
          <Link to="/recurring" className="text-link">
            Open
          </Link>
        </div>
        <p className="muted">
          Track regular income and expenses, then project net worth for a future
          month and year.
        </p>
      </section>

      <section className="quick-links">
        <Link className="btn primary" to="/screeners">
          Open screeners
        </Link>
        <Link className="btn secondary" to="/recurring">
          Recurring & project
        </Link>
        <Link className="btn secondary" to="/settings">
          Alerts & plans
        </Link>
      </section>
    </div>
  );
}
