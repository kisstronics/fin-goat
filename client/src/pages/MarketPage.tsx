import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { formatInr } from '../lib/format';
import type { ScreenerDef, ScreenerKey, ScreenerResultRow, Ticker } from '../types';

type MarketTab = 'screener' | 'stocks';
type SortKey = 'screener' | 'symbol' | 'name' | 'price' | 'sector' | 'matchedAt';
type StockSortKey = 'symbol' | 'name' | 'price' | 'sector' | 'change' | 'updatedAt';

const PAGE_SIZES = [10, 25, 50];

export function MarketPage() {
  const [tab, setTab] = useState<MarketTab>('screener');

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Market</p>
        <h1>Market intelligence</h1>
        <p className="muted">
          Screen NSE names or browse live ticker prices. Screens are analytical —
          not buy/sell recommendations.
        </p>
      </header>

      <div className="chip-row wrap">
        <button
          type="button"
          className={`chip${tab === 'screener' ? ' active' : ''}`}
          onClick={() => setTab('screener')}
        >
          Screener
        </button>
        <button
          type="button"
          className={`chip${tab === 'stocks' ? ' active' : ''}`}
          onClick={() => setTab('stocks')}
        >
          Stocks
        </button>
      </div>

      {tab === 'screener' ? <ScreenerPanel /> : <StocksPanel />}
    </div>
  );
}

function ScreenerPanel() {
  const [defs, setDefs] = useState<ScreenerDef[]>([]);
  const [active, setActive] = useState<ScreenerKey | 'all'>('all');
  const [results, setResults] = useState<ScreenerResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('matchedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [logicOpen, setLogicOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!logicOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setLogicOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLogicOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [logicOpen]);

  async function onFilter(key: ScreenerKey | 'all') {
    setActive(key);
    setPage(1);
    setResults(await api.screenerResults(key === 'all' ? undefined : key));
  }

  async function onRun() {
    setBusy(true);
    setError('');
    try {
      const res = await api.runScreeners();
      setResults(res.results);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  }

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      const s = r.ticker?.sector?.trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [results]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = results;
    if (q) {
      rows = rows.filter((r) => {
        const symbol = (r.ticker?.symbol || '').toLowerCase();
        const name = (r.ticker?.name || '').toLowerCase();
        const reason = (r.reason || '').toLowerCase();
        return symbol.includes(q) || name.includes(q) || reason.includes(q);
      });
    }
    if (sector !== 'all') {
      rows = rows.filter((r) => r.ticker?.sector === sector);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av =
        sortKey === 'screener'
          ? a.screener
          : sortKey === 'symbol'
            ? a.ticker?.symbol || ''
            : sortKey === 'name'
              ? a.ticker?.name || ''
              : sortKey === 'sector'
                ? a.ticker?.sector || ''
                : sortKey === 'price'
                  ? (a.ticker?.price ?? 0)
                  : a.matchedAt;
      const bv =
        sortKey === 'screener'
          ? b.screener
          : sortKey === 'symbol'
            ? b.ticker?.symbol || ''
            : sortKey === 'name'
              ? b.ticker?.name || ''
              : sortKey === 'sector'
                ? b.ticker?.sector || ''
                : sortKey === 'price'
                  ? (b.ticker?.price ?? 0)
                  : b.matchedAt;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [results, query, sector, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'matchedAt' || key === 'price' ? 'desc' : 'asc');
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <div className="page-head-row" style={{ alignItems: 'flex-start' }}>
        <div className="quick-links" style={{ margin: 0 }}>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void onRun()}
          >
            {busy ? 'Running…' : 'Run screeners now'}
          </button>
        </div>
        <div className="ellipsis-menu" ref={menuRef}>
          <button
            type="button"
            className="icon-btn ellipsis-trigger"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={logicOpen}
            onClick={() => setLogicOpen((o) => !o)}
          >
            ⋯
          </button>
          {logicOpen && (
            <div className="ellipsis-panel" role="menu">
              <p className="ellipsis-title">Screener logic</p>
              <ul className="logic-list compact">
                {defs.map((d) => (
                  <li key={d.key}>
                    <strong>{d.name}</strong>
                    <p className="muted tiny">{d.description}</p>
                    <code>{d.logic}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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

      <section className="panel-block screener-filters">
        <label>
          Search
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Symbol, name, or reason"
          />
        </label>
        <label>
          Sector
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rows per page
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
        <p className="muted tiny filter-meta">
          Showing {pageRows.length} of {filtered.length} matches
          {filtered.length !== results.length
            ? ` (filtered from ${results.length})`
            : ''}
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap panel-block">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('screener')}
                >
                  Screener{sortMark('screener')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('symbol')}
                >
                  Symbol{sortMark('symbol')}
                </button>
              </th>
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
                  onClick={() => toggleSort('sector')}
                >
                  Sector{sortMark('sector')}
                </button>
              </th>
              <th className="num">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('price')}
                >
                  Price{sortMark('price')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('matchedAt')}
                >
                  Matched{sortMark('matchedAt')}
                </button>
              </th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No matches yet. Run screeners or adjust filters.
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={`${r.screener}-${r.tickerId}-${r.matchedAt}`}>
                <td>{r.screener.replace(/_/g, ' ')}</td>
                <td>
                  <strong>{r.ticker?.symbol || r.tickerId}</strong>
                  {r.ticker?.exchange && (
                    <span className="muted tiny"> {r.ticker.exchange}</span>
                  )}
                </td>
                <td>{r.ticker?.name || '—'}</td>
                <td>{r.ticker?.sector || '—'}</td>
                <td className="num">
                  {r.ticker ? formatInr(r.ticker.price) : '—'}
                </td>
                <td className="nowrap">
                  {new Date(r.matchedAt).toLocaleString('en-IN')}
                </td>
                <td className="reason-cell">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        safePage={safePage}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
    </>
  );
}

function StocksPanel() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('all');
  const [sortKey, setSortKey] = useState<StockSortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    void (async () => {
      try {
        setTickers(await api.marketTickers());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stocks');
      }
    })();
  }, []);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickers) {
      const s = t.sector?.trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tickers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = tickers;
    if (q) {
      rows = rows.filter((t) => {
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.crn.toLowerCase().includes(q)
        );
      });
    }
    if (sector !== 'all') {
      rows = rows.filter((t) => t.sector === sector);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const changeA =
        a.prevClose > 0 ? ((a.price - a.prevClose) / a.prevClose) * 100 : 0;
      const changeB =
        b.prevClose > 0 ? ((b.price - b.prevClose) / b.prevClose) * 100 : 0;
      const av =
        sortKey === 'symbol'
          ? a.symbol
          : sortKey === 'name'
            ? a.name
            : sortKey === 'sector'
              ? a.sector
              : sortKey === 'price'
                ? a.price
                : sortKey === 'change'
                  ? changeA
                  : a.updatedAt;
      const bv =
        sortKey === 'symbol'
          ? b.symbol
          : sortKey === 'name'
            ? b.name
            : sortKey === 'sector'
              ? b.sector
              : sortKey === 'price'
                ? b.price
                : sortKey === 'change'
                  ? changeB
                  : b.updatedAt;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [tickers, query, sector, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function toggleSort(key: StockSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'price' || key === 'change' ? 'desc' : 'asc');
    }
  }

  function sortMark(key: StockSortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <section className="panel-block screener-filters">
        <label>
          Search
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Symbol, name, or CRN"
          />
        </label>
        <label>
          Sector
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rows per page
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
        <p className="muted tiny filter-meta">
          Showing {pageRows.length} of {filtered.length} stocks
          {filtered.length !== tickers.length
            ? ` (filtered from ${tickers.length})`
            : ''}
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap panel-block">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('symbol')}
                >
                  Symbol{sortMark('symbol')}
                </button>
              </th>
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
                  onClick={() => toggleSort('sector')}
                >
                  Sector{sortMark('sector')}
                </button>
              </th>
              <th className="num">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('price')}
                >
                  LTP{sortMark('price')}
                </button>
              </th>
              <th className="num">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('change')}
                >
                  Change{sortMark('change')}
                </button>
              </th>
              <th className="num">SMA50</th>
              <th className="num">SMA200</th>
              <th className="num">52W</th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('updatedAt')}
                >
                  Updated{sortMark('updatedAt')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No stocks yet. Ask an admin to sync tickers.
                </td>
              </tr>
            )}
            {pageRows.map((t) => {
              const changePct =
                t.prevClose > 0
                  ? ((t.price - t.prevClose) / t.prevClose) * 100
                  : 0;
              return (
                <tr key={t.id}>
                  <td>
                    <strong>{t.symbol}</strong>
                    <span className="muted tiny"> {t.exchange}</span>
                  </td>
                  <td>{t.name}</td>
                  <td>{t.sector || '—'}</td>
                  <td className="num">{formatInr(t.price)}</td>
                  <td
                    className={`num ${changePct >= 0 ? 'positive' : 'negative'}`}
                  >
                    {changePct >= 0 ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </td>
                  <td className="num">{formatInr(t.sma50)}</td>
                  <td className="num">{formatInr(t.sma200)}</td>
                  <td className="num nowrap">
                    {formatInr(t.low52w)}–{formatInr(t.high52w)}
                  </td>
                  <td className="nowrap">
                    {new Date(t.updatedAt).toLocaleString('en-IN')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pager
        safePage={safePage}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
    </>
  );
}

function Pager({
  safePage,
  totalPages,
  onPrev,
  onNext,
}: {
  safePage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="quick-links">
      <button
        type="button"
        className="btn secondary"
        disabled={safePage <= 1}
        onClick={onPrev}
      >
        Previous
      </button>
      <span className="muted tiny">
        Page {safePage} / {totalPages}
      </span>
      <button
        type="button"
        className="btn secondary"
        disabled={safePage >= totalPages}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  );
}
