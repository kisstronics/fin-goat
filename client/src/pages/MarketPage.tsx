import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatInr } from '../lib/format';
import type {
  AnnouncementAlertStock,
  NseAnnouncement,
  ScreenerDef,
  ScreenerKey,
  ScreenerResultRow,
  Ticker,
} from '../types';

type MarketTab = 'screener' | 'stocks' | 'watchlist' | 'announcements';
type SortKey = 'screener' | 'symbol' | 'name' | 'price' | 'sector' | 'matchedAt';
type StockSortKey = 'symbol' | 'name' | 'price' | 'sector' | 'change' | 'updatedAt';

const PAGE_SIZES = [10, 25, 50];

export function MarketPage() {
  const [tab, setTab] = useState<MarketTab>('stocks');

  return (
    <div className="page-stack market-console">
      <div className="chip-row wrap admin-tabs" role="tablist" aria-label="Market sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stocks'}
          className={`chip${tab === 'stocks' ? ' active' : ''}`}
          onClick={() => setTab('stocks')}
        >
          Stocks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'screener'}
          className={`chip${tab === 'screener' ? ' active' : ''}`}
          onClick={() => setTab('screener')}
        >
          Screener
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'watchlist'}
          className={`chip${tab === 'watchlist' ? ' active' : ''}`}
          onClick={() => setTab('watchlist')}
        >
          Watchlist
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'announcements'}
          className={`chip${tab === 'announcements' ? ' active' : ''}`}
          onClick={() => setTab('announcements')}
        >
          Announcements
        </button>
      </div>

      {tab === 'stocks' && <StocksPanel />}
      {tab === 'screener' && <ScreenerPanel />}
      {tab === 'watchlist' && <WatchlistPanel />}
      {tab === 'announcements' && (
        <AnnouncementsPanel onOpenWatchlist={() => setTab('watchlist')} />
      )}
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

      <div className="ticker-filters">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search symbol, name, or reason"
          aria-label="Search screener results"
        />
        <label className="filter-field">
          <span>Sector</span>
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
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
        {(query || sector !== 'all') && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setQuery('');
              setSector('all');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <TableToolbar
        label={`${rangeLabel(safePage, pageSize, filtered.length)} matches · ${totalPages} page${totalPages === 1 ? '' : 's'}`}
        safePage={safePage}
        totalPages={totalPages}
        onPage={setPage}
      />

      <div className="table-wrap">
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
                  {r.ticker?.symbol ? (
                    <Link
                      className="text-link"
                      to={`/market/${r.ticker.symbol}`}
                    >
                      <strong>{r.ticker.symbol}</strong>
                    </Link>
                  ) : (
                    <strong>{r.tickerId}</strong>
                  )}
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
      <div className="ticker-filters">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search symbol, name, or CRN"
          aria-label="Search stocks"
        />
        <label className="filter-field">
          <span>Sector</span>
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
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
        {(query || sector !== 'all') && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setQuery('');
              setSector('all');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <TableToolbar
        label={`${rangeLabel(safePage, pageSize, filtered.length)} stocks · ${totalPages} page${totalPages === 1 ? '' : 's'}`}
        safePage={safePage}
        totalPages={totalPages}
        onPage={setPage}
      />

      <div className="table-wrap">
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
                    <Link className="text-link" to={`/market/${t.symbol}`}>
                      <strong>{t.symbol}</strong>
                    </Link>
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
    </>
  );
}

type WatchSortKey = 'symbol' | 'name' | 'sector' | 'price' | 'createdAt';
type AnnounceSortKey = 'symbol' | 'subject' | 'companyName' | 'announcedAt';

function WatchlistPanel() {
  const [stocks, setStocks] = useState<AnnouncementAlertStock[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [tickerHits, setTickerHits] = useState<Ticker[]>([]);
  const [listQuery, setListQuery] = useState('');
  const [sector, setSector] = useState('all');
  const [sortKey, setSortKey] = useState<WatchSortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setStocks(await api.announcementAlertStocks());
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load watchlist'),
    );
  }, []);

  useEffect(() => {
    const q = addQuery.trim();
    if (q.length < 1) {
      setTickerHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api
        .searchAnnouncementTickers(q)
        .then(setTickerHits)
        .catch(() => setTickerHits([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [addQuery]);

  async function addStock(ticker: Ticker) {
    setError('');
    setBusyId(ticker.id);
    try {
      await api.addAnnouncementAlertStock(ticker.id);
      await load();
      setAddQuery('');
      setTickerHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add stock');
    } finally {
      setBusyId(null);
    }
  }

  async function removeStock(id: string) {
    setError('');
    setBusyId(id);
    try {
      await api.removeAnnouncementAlertStock(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove stock');
    } finally {
      setBusyId(null);
    }
  }

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) {
      const sectorName = s.ticker?.sector?.trim();
      if (sectorName) set.add(sectorName);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [stocks]);

  const filtered = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    let rows = stocks;
    if (q) {
      rows = rows.filter((s) => {
        const symbol = (s.ticker?.symbol || '').toLowerCase();
        const name = (s.ticker?.name || '').toLowerCase();
        return symbol.includes(q) || name.includes(q);
      });
    }
    if (sector !== 'all') {
      rows = rows.filter((s) => s.ticker?.sector === sector);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av =
        sortKey === 'symbol'
          ? a.ticker?.symbol || ''
          : sortKey === 'name'
            ? a.ticker?.name || ''
            : sortKey === 'sector'
              ? a.ticker?.sector || ''
              : sortKey === 'price'
                ? (a.ticker?.price ?? 0)
                : a.createdAt;
      const bv =
        sortKey === 'symbol'
          ? b.ticker?.symbol || ''
          : sortKey === 'name'
            ? b.ticker?.name || ''
            : sortKey === 'sector'
              ? b.ticker?.sector || ''
              : sortKey === 'price'
                ? (b.ticker?.price ?? 0)
                : b.createdAt;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [stocks, listQuery, sector, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function toggleSort(key: WatchSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'price' || key === 'createdAt' ? 'desc' : 'asc');
    }
  }

  function sortMark(key: WatchSortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <p className="muted tiny">
        Stocks watched for NSE announcement alerts.
      </p>

      <div className="ticker-filters">
        <input
          type="search"
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value)}
          placeholder="Add stock — search symbol or name"
          aria-label="Add stock to watchlist"
        />
      </div>

      {error && <p className="error">{error}</p>}

      {tickerHits.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Sector</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tickerHits.map((t) => {
                const already = stocks.some((s) => s.tickerId === t.id);
                return (
                  <tr key={t.id}>
                    <td className="nowrap">
                      <strong>{t.symbol}</strong>
                      <span className="muted tiny"> {t.exchange}</span>
                    </td>
                    <td>{t.name}</td>
                    <td>{t.sector || '—'}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={already || busyId === t.id}
                        onClick={() => void addStock(t)}
                      >
                        {already
                          ? 'Added'
                          : busyId === t.id
                            ? 'Adding…'
                            : 'Add'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ticker-filters">
        <input
          type="search"
          value={listQuery}
          onChange={(e) => {
            setListQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Filter watchlist"
          aria-label="Filter watchlist"
        />
        <label className="filter-field">
          <span>Sector</span>
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
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
        {(listQuery || sector !== 'all') && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setListQuery('');
              setSector('all');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <TableToolbar
        label={`${rangeLabel(safePage, pageSize, filtered.length)} watched · ${totalPages} page${totalPages === 1 ? '' : 's'}`}
        safePage={safePage}
        totalPages={totalPages}
        onPage={setPage}
      />

      <div className="table-wrap">
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
                  Price{sortMark('price')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('createdAt')}
                >
                  Added{sortMark('createdAt')}
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No stocks yet. Search above to add names for announcement
                  alerts.
                </td>
              </tr>
            )}
            {pageRows.map((s) => (
              <tr key={s.id}>
                <td className="nowrap">
                  {s.ticker?.symbol ? (
                    <Link
                      className="text-link"
                      to={`/market/${s.ticker.symbol}`}
                    >
                      <strong>{s.ticker.symbol}</strong>
                    </Link>
                  ) : (
                    <strong>{s.tickerId}</strong>
                  )}
                  {s.ticker?.exchange && (
                    <span className="muted tiny"> {s.ticker.exchange}</span>
                  )}
                </td>
                <td>{s.ticker?.name || '—'}</td>
                <td>{s.ticker?.sector || '—'}</td>
                <td className="num">
                  {s.ticker ? formatInr(s.ticker.price) : '—'}
                </td>
                <td className="nowrap">
                  {new Date(s.createdAt).toLocaleDateString('en-IN')}
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="linkish"
                    disabled={busyId === s.id}
                    onClick={() => void removeStock(s.id)}
                  >
                    {busyId === s.id ? 'Removing…' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AnnouncementsPanel({
  onOpenWatchlist,
}: {
  onOpenWatchlist: () => void;
}) {
  const [items, setItems] = useState<NseAnnouncement[]>([]);
  const [watched, setWatched] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('all');
  const [sortKey, setSortKey] = useState<AnnounceSortKey>('announcedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.announcements(200);
    setItems(data.items);
    setWatched(data.watchedSymbols);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = items;
    if (symbol !== 'all') {
      rows = rows.filter((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
    }
    if (q) {
      rows = rows.filter((a) => {
        return (
          a.symbol.toLowerCase().includes(q) ||
          a.subject.toLowerCase().includes(q) ||
          a.companyName.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q)
        );
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av =
        sortKey === 'symbol'
          ? a.symbol
          : sortKey === 'subject'
            ? a.subject
            : sortKey === 'companyName'
              ? a.companyName
              : a.announcedAt || a.createdAt;
      const bv =
        sortKey === 'symbol'
          ? b.symbol
          : sortKey === 'subject'
            ? b.subject
            : sortKey === 'companyName'
              ? b.companyName
              : b.announcedAt || b.createdAt;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [items, query, symbol, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function toggleSort(key: AnnounceSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'announcedAt' ? 'desc' : 'asc');
    }
  }

  function sortMark(key: AnnounceSortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <div className="page-head-row" style={{ alignItems: 'center' }}>
        <p className="muted tiny" style={{ margin: 0 }}>
          NSE filings for your watchlist
          {watched.length ? ` · ${watched.join(', ')}` : ''}.
        </p>
        <div className="ticker-actions">
          <button
            type="button"
            className="text-link"
            onClick={onOpenWatchlist}
          >
            Manage watchlist
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void load()
                .catch((err) =>
                  setError(
                    err instanceof Error ? err.message : 'Refresh failed',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!watched.length && (
        <p className="muted tiny">
          Add stocks in Watchlist to see filings and get alerts.
        </p>
      )}

      <div className="ticker-filters">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search symbol, subject, or company"
          aria-label="Search announcements"
        />
        <label className="filter-field">
          <span>Symbol</span>
          <select
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {watched.map((s) => (
              <option key={s} value={s}>
                {s}
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
        {(query || symbol !== 'all') && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setQuery('');
              setSymbol('all');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <TableToolbar
        label={`${rangeLabel(safePage, pageSize, filtered.length)} filings · ${totalPages} page${totalPages === 1 ? '' : 's'}`}
        safePage={safePage}
        totalPages={totalPages}
        onPage={setPage}
      />

      <div className="table-wrap">
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
                  onClick={() => toggleSort('subject')}
                >
                  Subject{sortMark('subject')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('companyName')}
                >
                  Company{sortMark('companyName')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => toggleSort('announcedAt')}
                >
                  Announced{sortMark('announcedAt')}
                </button>
              </th>
              <th>Attachment</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {watched.length
                    ? 'No announcements match the current filters.'
                    : 'No watchlist stocks yet.'}
                </td>
              </tr>
            )}
            {pageRows.map((a) => (
              <tr key={a.id}>
                <td className="nowrap">
                  <Link className="text-link" to={`/market/${a.symbol}`}>
                    <strong>{a.symbol}</strong>
                  </Link>
                </td>
                <td>
                  <div>{a.subject || 'Announcement'}</div>
                  {a.body && (
                    <div className="muted tiny">{a.body.slice(0, 140)}</div>
                  )}
                </td>
                <td>{a.companyName || '—'}</td>
                <td className="nowrap">
                  {a.announcedAt
                    ? new Date(a.announcedAt).toLocaleString('en-IN')
                    : '—'}
                </td>
                <td>
                  {a.attachmentUrl ? (
                    <a
                      className="text-link"
                      href={a.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function rangeLabel(page: number, pageSize: number, total: number) {
  if (!total) return '0';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `${from}–${to} of ${total.toLocaleString('en-IN')}`;
}

function TableToolbar({
  label,
  safePage,
  totalPages,
  onPage,
}: {
  label: string;
  safePage: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="table-toolbar">
      <p className="muted tiny">{label}</p>
      <div className="table-pager">
        <button
          type="button"
          className="icon-btn"
          disabled={safePage <= 1}
          onClick={() => onPage(Math.max(1, safePage - 1))}
          aria-label="Previous page"
          title="Previous"
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
              onPage(Math.min(totalPages, Math.max(1, Math.floor(raw))));
            }}
            aria-label="Page number"
          />
          <span className="muted tiny">of {totalPages}</span>
        </label>
        <button
          type="button"
          className="icon-btn"
          disabled={safePage >= totalPages}
          onClick={() => onPage(Math.min(totalPages, safePage + 1))}
          aria-label="Next page"
          title="Next"
        >
          ›
        </button>
      </div>
    </div>
  );
}
