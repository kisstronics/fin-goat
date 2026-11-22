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
  const [tab, setTab] = useState<MarketTab>('screener');

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">Market</p>
        <h1>Market intelligence</h1>
        <p className="muted">
          Screen NSE names, browse prices, manage your stock watchlist, and
          follow corporate announcements. Screens are analytical — not buy/sell
          recommendations.
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
        <button
          type="button"
          className={`chip${tab === 'watchlist' ? ' active' : ''}`}
          onClick={() => setTab('watchlist')}
        >
          Watchlist
        </button>
        <button
          type="button"
          className={`chip${tab === 'announcements' ? ' active' : ''}`}
          onClick={() => setTab('announcements')}
        >
          Announcements
        </button>
      </div>

      {tab === 'screener' && <ScreenerPanel />}
      {tab === 'stocks' && <StocksPanel />}
      {tab === 'watchlist' && (
        <WatchlistPanel onOpenAnnouncements={() => setTab('announcements')} />
      )}
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

      <Pager
        safePage={safePage}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
    </>
  );
}

function WatchlistPanel({
  onOpenAnnouncements,
}: {
  onOpenAnnouncements: () => void;
}) {
  const [stocks, setStocks] = useState<AnnouncementAlertStock[]>([]);
  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerHits, setTickerHits] = useState<Ticker[]>([]);
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
    const q = tickerQuery.trim();
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
  }, [tickerQuery]);

  async function addStock(ticker: Ticker) {
    setError('');
    setBusyId(ticker.id);
    try {
      await api.addAnnouncementAlertStock(ticker.id);
      await load();
      setTickerQuery('');
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

  return (
    <>
      <section className="panel-block form-grid">
        <div className="panel-head-row">
          <div>
            <h2 style={{ margin: 0 }}>Stock watchlist</h2>
            <p className="muted tiny">
              Create and manage stocks for NSE announcement alerts. New filings
              for these names are stored and sent via Telegram/email when
              notifications are on.
            </p>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={onOpenAnnouncements}
          >
            View announcements
          </button>
        </div>

        <label>
          Search & add stock
          <input
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value)}
            placeholder="Symbol or company name"
          />
        </label>

        {error && <p className="error">{error}</p>}

        {tickerHits.length > 0 && (
          <ul className="holding-list">
            {tickerHits.map((t) => {
              const already = stocks.some((s) => s.tickerId === t.id);
              return (
                <li key={t.id} className="holding-card">
                  <div className="holding-main">
                    <div>
                      <h3>
                        {t.symbol} · {t.exchange}
                      </h3>
                      <p className="muted tiny">{t.name}</p>
                    </div>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={already || busyId === t.id}
                      onClick={() => void addStock(t)}
                    >
                      {already
                        ? 'On watchlist'
                        : busyId === t.id
                          ? 'Adding…'
                          : 'Add'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel-block">
        <div className="panel-head-row">
          <h2>Your watchlist</h2>
          <span className="muted tiny">{stocks.length}</span>
        </div>
        <ul className="holding-list">
          {stocks.length === 0 && (
            <li className="muted">
              No stocks yet. Search above to add names you want announcement
              alerts for.
            </li>
          )}
          {stocks.map((s) => (
            <li key={s.id} className="holding-card">
              <div className="holding-main">
                <div>
                  <h3>
                    {s.ticker?.symbol || s.tickerId}
                    {s.ticker?.exchange ? ` · ${s.ticker.exchange}` : ''}
                  </h3>
                  <p className="muted tiny">{s.ticker?.name || ''}</p>
                </div>
                <button
                  type="button"
                  className="linkish"
                  disabled={busyId === s.id}
                  onClick={() => void removeStock(s.id)}
                >
                  {busyId === s.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.announcements(80);
    setItems(data.items);
    setWatched(data.watchedSymbols);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
  }, []);

  return (
    <>
      <div className="panel-block">
        <div className="panel-head-row">
          <div>
            <h2 style={{ margin: 0 }}>NSE corporate announcements</h2>
            <p className="muted tiny">
              Filings for stocks on your watchlist.
              {watched.length
                ? ` Watching ${watched.join(', ')}.`
                : ' No stocks on your watchlist yet.'}
            </p>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={onOpenWatchlist}
          >
            Manage watchlist
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {!watched.length && (
          <p className="muted">
            Add stocks in the Watchlist tab to see filings and get Telegram
            alerts when NSE publishes announcements.
          </p>
        )}
      </div>

      <ul className="holding-list">
        {items.length === 0 && watched.length > 0 && (
          <li className="muted">
            No stored announcements yet. They appear after the NSE announcements
            cron runs.
          </li>
        )}
        {items.map((a) => (
          <li key={a.id} className="holding-card">
            <div className="holding-main">
              <div>
                <p className="eyebrow">{a.symbol}</p>
                <h3>{a.subject || 'Announcement'}</h3>
                <p className="muted tiny">{a.companyName}</p>
              </div>
              <span className="muted tiny nowrap">
                {a.announcedAt
                  ? new Date(a.announcedAt).toLocaleString('en-IN')
                  : '—'}
              </span>
            </div>
            {a.body && <p className="tiny">{a.body.slice(0, 280)}</p>}
            <div className="holding-meta">
              {a.attachmentUrl && (
                <a
                  className="text-link"
                  href={a.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Attachment
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="quick-links">
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void load()
              .catch((err) =>
                setError(err instanceof Error ? err.message : 'Refresh failed'),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Refreshing…' : 'Refresh list'}
        </button>
      </div>
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
    <div className="table-pager">
      <button
        type="button"
        className="icon-btn"
        disabled={safePage <= 1}
        onClick={onPrev}
        aria-label="Previous page"
        title="Previous"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M15 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="muted tiny">
        Page {safePage} / {totalPages}
      </span>
      <button
        type="button"
        className="icon-btn"
        disabled={safePage >= totalPages}
        onClick={onNext}
        aria-label="Next page"
        title="Next"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
