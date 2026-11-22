import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AllocationDonut, ProjectionLineChart } from '../components/Charts';
import { assetLabel, formatInr, formatPct, loanTypeLabel } from '../lib/format';
import type { DashboardData, ProjectionSeries } from '../types';

type InsightView = 'graphs' | 'numbers';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [series, setSeries] = useState<ProjectionSeries | null>(null);
  const [view, setView] = useState<InsightView>('graphs');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [dash, proj] = await Promise.all([
          api.dashboard(),
          api.projectionSeries(10),
        ]);
        setData(dash);
        setSeries(proj);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    })();
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading dashboard…</p>;

  const allocRows = data.allocation.map((row) => ({
    type: row.type,
    label: assetLabel(row.type),
    value: row.value,
    pct: row.pct,
  }));

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Dashboard</p>
        <h1>Net worth at a glance</h1>
        <p className="muted">
          Updated {new Date(data.updatedAt).toLocaleString('en-IN')}
        </p>
      </header>

      <section className="hero-metric rise">
        <p className="eyebrow">Net worth</p>
        <p className="hero-value">{formatInr(data.netWorth, true)}</p>
        <p className={data.returnPct >= 0 ? 'positive' : 'negative'}>
          Portfolio return {formatPct(data.returnPct)} ·{' '}
          {formatInr(data.absoluteReturn)}
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
          <h2>Insights</h2>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${view === 'graphs' ? ' active' : ''}`}
              onClick={() => setView('graphs')}
            >
              Graphs
            </button>
            <button
              type="button"
              className={`chip${view === 'numbers' ? ' active' : ''}`}
              onClick={() => setView('numbers')}
            >
              View numbers
            </button>
          </div>
        </div>

        {view === 'graphs' ? (
          <div className="insight-grid">
            <article className="insight-card">
              <div className="panel-head-row">
                <h3>10-year projection</h3>
                <Link to="/recurring" className="text-link">
                  Cashflows
                </Link>
              </div>
              <p className="muted tiny">
                Net worth path from recurring income, expenses, EMIs, and SIPs.
              </p>
              {series ? (
                <ProjectionLineChart
                  points={series.points.map((p) => ({
                    label: p.label,
                    value: p.projectedNetWorth,
                  }))}
                />
              ) : (
                <p className="muted">Loading projection…</p>
              )}
            </article>

            <article className="insight-card">
              <div className="panel-head-row">
                <h3>Investment allocation</h3>
                <Link to="/portfolio" className="text-link">
                  Manage
                </Link>
              </div>
              <p className="muted tiny">Share of current assets by class.</p>
              <AllocationDonut rows={allocRows} />
            </article>
          </div>
        ) : (
          <div className="page-stack">
            <div>
              <div className="panel-head-row">
                <h3>Investment allocation</h3>
                <Link to="/portfolio" className="text-link">
                  Manage
                </Link>
              </div>
              <ul className="alloc-list">
                {data.allocation.length === 0 && (
                  <li className="muted">No investments yet</li>
                )}
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
            </div>

            <div>
              <div className="panel-head-row">
                <h3>10-year projection numbers</h3>
                <Link to="/recurring" className="text-link">
                  Open
                </Link>
              </div>
              {series ? (
                <>
                  <section className="stat-grid">
                    <article className="stat-block">
                      <p className="eyebrow">Now</p>
                      <strong>{formatInr(series.currentNetWorth, true)}</strong>
                    </article>
                    <article className="stat-block">
                      <p className="eyebrow">In {series.years} years</p>
                      <strong>
                        {formatInr(
                          series.points[series.points.length - 1]
                            ?.projectedNetWorth || 0,
                          true,
                        )}
                      </strong>
                    </article>
                    <article className="stat-block">
                      <p className="eyebrow">Monthly surplus</p>
                      <strong
                        className={
                          series.monthlySurplus >= 0 ? 'positive' : 'negative'
                        }
                      >
                        {formatInr(series.monthlySurplus, true)}
                      </strong>
                      <p className="muted tiny">
                        After expenses &amp; SIP
                        {series.monthlySip > 0
                          ? ` (−${formatInr(series.monthlySip, true)})`
                          : ''}
                      </p>
                    </article>
                  </section>
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Year</th>
                          <th className="num">Net worth</th>
                          <th className="num">Assets</th>
                          <th className="num">Liabilities</th>
                        </tr>
                      </thead>
                      <tbody>
                        {series.points.map((p) => (
                          <tr key={`${p.year}-${p.month}`}>
                            <td>{p.label}</td>
                            <td className="num">
                              {formatInr(p.projectedNetWorth, true)}
                            </td>
                            <td className="num">
                              {formatInr(p.projectedAssets, true)}
                            </td>
                            <td className="num">
                              {formatInr(p.projectedLiabilities, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="muted">Loading projection…</p>
              )}
            </div>
          </div>
        )}
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

      <section className="quick-links">
        <Link className="btn primary" to="/market">
          Open market
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
