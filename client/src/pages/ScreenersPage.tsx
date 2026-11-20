import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatInr } from '../lib/format';
import type { ScreenerDef, ScreenerKey, ScreenerResultRow } from '../types';

export function ScreenersPage() {
  const [defs, setDefs] = useState<ScreenerDef[]>([]);
  const [active, setActive] = useState<ScreenerKey | 'all'>('all');
  const [results, setResults] = useState<ScreenerResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(key: ScreenerKey | 'all' = active) {
    const [definitions, rows] = await Promise.all([
      api.screeners(),
      api.screenerResults(key === 'all' ? undefined : key),
    ]);
    setDefs(definitions);
    setResults(rows);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFilter(key: ScreenerKey | 'all') {
    setActive(key);
    setResults(await api.screenerResults(key === 'all' ? undefined : key));
  }

  async function onRun() {
    setBusy(true);
    setError('');
    try {
      const res = await api.runScreeners();
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Screeners</p>
        <h1>Market intelligence</h1>
        <p className="muted">
          Rule-based screens on NSE tickers. Historical signals are not future
          guarantees.
        </p>
      </header>

      <div className="quick-links">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void onRun()}
        >
          {busy ? 'Running…' : 'Run screeners now'}
        </button>
      </div>

      <div className="chip-row wrap">
        <button
          type="button"
          className={`chip${active === 'all' ? ' active' : ''}`}
          onClick={() => void onFilter('all')}
        >
          All
        </button>
        {defs.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`chip${active === d.key ? ' active' : ''}`}
            onClick={() => void onFilter(d.key)}
            disabled={!d.enabled}
          >
            {d.name}
          </button>
        ))}
      </div>

      <section className="panel-block">
        <h2>Logic</h2>
        <ul className="logic-list">
          {defs.map((d) => (
            <li key={d.key}>
              <strong>{d.name}</strong>
              <p className="muted">{d.description}</p>
              <code>{d.logic}</code>
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="error">{error}</p>}

      <ul className="holding-list">
        {results.length === 0 && (
          <li className="muted">No matches yet. Run screeners or wait for cron.</li>
        )}
        {results.map((r) => (
          <li key={`${r.screener}-${r.tickerId}-${r.matchedAt}`} className="holding-card">
            <div className="holding-main">
              <div>
                <p className="eyebrow">{r.screener.replace(/_/g, ' ')}</p>
                <h3>
                  {r.ticker?.symbol || r.tickerId}
                  <span className="muted tiny"> · {r.ticker?.exchange}</span>
                </h3>
                <p className="muted">{r.ticker?.name}</p>
              </div>
              <div className="holding-values">
                <strong>{r.ticker ? formatInr(r.ticker.price) : '—'}</strong>
              </div>
            </div>
            <p className="tiny">{r.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
