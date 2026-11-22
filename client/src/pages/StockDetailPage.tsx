import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { PriceAreaChart } from '../components/Charts';
import { formatInr } from '../lib/format';
import type {
  ChartRange,
  PriceBar,
  StockDetail,
  StockScorecardItem,
} from '../types';

type DetailTab =
  | 'overview'
  | 'sentiment'
  | 'forecasts'
  | 'financials'
  | 'peers'
  | 'holdings'
  | 'events'
  | 'news';

const RANGES: { id: ChartRange; label: string }[] = [
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: '3y', label: '3Y' },
  { id: '5y', label: '5Y' },
  { id: 'max', label: 'Max' },
];

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sentiment', label: 'Sentiment' },
  { id: 'forecasts', label: 'Forecasts' },
  { id: 'financials', label: 'Financials' },
  { id: 'peers', label: 'Peers' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'events', label: 'Events' },
  { id: 'news', label: 'News' },
];

function ratingClass(rating: StockScorecardItem['rating']) {
  if (rating === 'High') return 'score-high';
  if (rating === 'Low') return 'score-low';
  return 'score-avg';
}

export function StockDetailPage() {
  const { symbol = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [range, setRange] = useState<ChartRange>('1d');
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [chartBusy, setChartBusy] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const d = await api.stockDetail(symbol);
        setDetail(d);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load stock');
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    setChartBusy(true);
    void (async () => {
      try {
        const hist = await api.stockHistory(symbol, range);
        setBars(hist.bars);
      } catch {
        setBars([]);
      } finally {
        setChartBusy(false);
      }
    })();
  }, [symbol, range]);

  const positive = (detail?.changePct ?? 0) >= 0;
  const t = detail?.ticker;

  const riskNote = useMemo(() => {
    if (!t || !t.sma50) return 'Volatility vs market not available yet';
    const vsSma = t.price > 0 ? Math.abs(t.price - t.sma50) / t.price : 0;
    return `Moves about ${(1 + vsSma * 8).toFixed(2)}× typical range vs its 50-day average`;
  }, [t]);

  if (loading) {
    return (
      <div className="page-stack">
        <p className="muted">Loading stock…</p>
      </div>
    );
  }

  if (!detail || !t) {
    return (
      <div className="page-stack">
        <p className="error">{error || 'Stock not found'}</p>
        <Link className="text-link" to="/market">
          ← Back to Market
        </Link>
      </div>
    );
  }

  return (
    <div className="page-stack stock-detail">
      <div className="stock-detail-top">
        <Link className="text-link" to="/market">
          ← Market
        </Link>
        {!detail.historyComplete && (
          <p className="muted tiny">
            Loading 1Y history ({detail.historyDays} days so far). Batched
            backfill continues in the background.
          </p>
        )}
      </div>

      <div className="stock-detail-layout">
        <aside className="stock-side panel-block">
          <div className="stock-side-head">
            <div className="stock-avatar" aria-hidden>
              {t.symbol.slice(0, 2)}
            </div>
            <div>
              <h1 className="stock-title">{t.name}</h1>
              <p className="muted tiny">
                {t.symbol} · {t.exchange}
              </p>
            </div>
          </div>

          <div className="stock-ltp">
            <strong>{formatInr(t.price)}</strong>
            <span className={positive ? 'positive' : 'negative'}>
              {positive ? '+' : ''}
              {detail.changePct.toFixed(2)}% ({positive ? '+' : ''}
              {detail.change.toFixed(2)})
            </span>
          </div>

          <div className="stock-trade-row">
            <button
              type="button"
              className="btn stock-sell"
              onClick={() =>
                navigate('/portfolio', {
                  state: { intent: 'sell', symbol: t.symbol },
                })
              }
            >
              Sell
            </button>
            <button
              type="button"
              className="btn stock-buy"
              onClick={() =>
                navigate('/portfolio', {
                  state: { intent: 'buy', symbol: t.symbol },
                })
              }
            >
              Buy
            </button>
          </div>
          <p className="muted tiny">
            Buy / Sell opens portfolio tracking — not a brokerage order.
          </p>

          <div className="stock-scorecard">
            <p className="eyebrow">Scorecard</p>
            {detail.scorecard.map((item) => (
              <article key={item.key} className="score-row">
                <div className="score-row-top">
                  <strong>{item.label}</strong>
                  <span className={`score-pill ${ratingClass(item.rating)}`}>
                    {item.rating}
                  </span>
                </div>
                <p className="muted tiny">{item.summary}</p>
              </article>
            ))}
          </div>
        </aside>

        <section className="stock-main">
          <div className="chip-row wrap stock-tabs">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${tab === item.id ? ' active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="page-stack">
              <div className="stock-metric-row">
                <div>
                  <p className="eyebrow">High</p>
                  <strong>{formatInr(detail.dayHigh)}</strong>
                </div>
                <div>
                  <p className="eyebrow">Low</p>
                  <strong>{formatInr(detail.dayLow)}</strong>
                </div>
                <div>
                  <p className="eyebrow">Returns</p>
                  <strong className={positive ? 'positive' : 'negative'}>
                    {positive ? '+' : ''}
                    {detail.changePct.toFixed(2)}%
                  </strong>
                </div>
              </div>

              <div className="panel-block">
                <div className="panel-head-row">
                  <h2>Price</h2>
                  {chartBusy && <span className="muted tiny">Updating…</span>}
                </div>
                <PriceAreaChart bars={bars} positive={positive} />
                <div className="chip-row wrap">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`chip${range === r.id ? ' active' : ''}`}
                      onClick={() => setRange(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stock-info-cards">
                <article className="panel-block">
                  <p className="eyebrow">Financials</p>
                  <div className="chip-row wrap">
                    <span className="chip static">{t.industry || 'Equity'}</span>
                    <span className="chip static">{t.sector || 'Other'}</span>
                  </div>
                </article>
                <article className="panel-block">
                  <p className="eyebrow">
                    {t.marketCapCr >= 20000
                      ? 'Largecap'
                      : t.marketCapCr >= 5000
                        ? 'Midcap'
                        : 'Smallcap'}
                  </p>
                  <strong>
                    {t.marketCapCr
                      ? `₹${t.marketCapCr.toLocaleString('en-IN')} Cr`
                      : '—'}
                  </strong>
                  <p className="muted tiny">Market capitalisation</p>
                </article>
                <article className="panel-block">
                  <p className="eyebrow">Risk lens</p>
                  <strong>
                    {Math.abs(detail.changePct) >= 2 ? 'Higher move' : 'Steady'}
                  </strong>
                  <p className="muted tiny">{riskNote}</p>
                </article>
              </div>
            </div>
          )}

          {tab === 'sentiment' && (
            <Placeholder
              title="Sentiment"
              body="Social / news sentiment scoring is coming next. For now, use Events and News for corporate filings."
            />
          )}

          {tab === 'forecasts' && (
            <Placeholder
              title="Forecasts"
              body="Analyst consensus targets are not wired yet. Technical levels from SMA50 / SMA200 are on Overview."
            />
          )}

          {tab === 'financials' && (
            <div className="panel-block">
              <h2>Key metrics</h2>
              <ul className="holding-list">
                <li className="holding-card">
                  <div className="holding-main">
                    <span>P/E</span>
                    <strong>{t.pe != null ? t.pe.toFixed(1) : '—'}</strong>
                  </div>
                </li>
                <li className="holding-card">
                  <div className="holding-main">
                    <span>Market cap</span>
                    <strong>
                      {t.marketCapCr
                        ? `₹${t.marketCapCr.toLocaleString('en-IN')} Cr`
                        : '—'}
                    </strong>
                  </div>
                </li>
                <li className="holding-card">
                  <div className="holding-main">
                    <span>SMA50 / SMA200</span>
                    <strong>
                      {formatInr(t.sma50)} / {formatInr(t.sma200)}
                    </strong>
                  </div>
                </li>
                <li className="holding-card">
                  <div className="holding-main">
                    <span>52W range</span>
                    <strong>
                      {formatInr(t.low52w)} – {formatInr(t.high52w)}
                    </strong>
                  </div>
                </li>
                <li className="holding-card">
                  <div className="holding-main">
                    <span>Volume</span>
                    <strong>{t.volume.toLocaleString('en-IN')}</strong>
                  </div>
                </li>
                <li className="holding-card">
                  <div className="holding-main">
                    <span>ISIN / CRN</span>
                    <strong>
                      {t.isin || '—'} · {t.crn}
                    </strong>
                  </div>
                </li>
              </ul>
            </div>
          )}

          {tab === 'peers' && (
            <div className="panel-block">
              <h2>Peers · {t.sector || 'Same sector'}</h2>
              {!detail.peers.length && (
                <p className="muted">No peer names in this sector yet.</p>
              )}
              <ul className="holding-list">
                {detail.peers.map((p) => {
                  const pct =
                    p.prevClose > 0
                      ? ((p.price - p.prevClose) / p.prevClose) * 100
                      : 0;
                  return (
                    <li key={p.id} className="holding-card">
                      <Link
                        className="holding-main stock-peer-link"
                        to={`/market/${p.symbol}`}
                      >
                        <div>
                          <h3>
                            {p.symbol} · {p.exchange}
                          </h3>
                          <p className="muted tiny">{p.name}</p>
                        </div>
                        <div className="holding-values">
                          <strong>{formatInr(p.price)}</strong>
                          <span
                            className={`tiny ${pct >= 0 ? 'positive' : 'negative'}`}
                          >
                            {pct >= 0 ? '+' : ''}
                            {pct.toFixed(2)}%
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === 'holdings' && (
            <Placeholder
              title="Holdings"
              body="Promoter / FII / DII shareholding break-up will land here. Track your own lots from Portfolio → Stocks."
              action={
                <Link className="btn secondary" to="/portfolio">
                  Open portfolio
                </Link>
              }
            />
          )}

          {(tab === 'events' || tab === 'news') && (
            <div className="panel-block">
              <h2>{tab === 'events' ? 'Events' : 'News'} · NSE filings</h2>
              {!detail.announcements.length && (
                <p className="muted">
                  No recent NSE announcements stored for {t.symbol}.
                </p>
              )}
              <ul className="holding-list">
                {detail.announcements.map((a) => (
                  <li key={a.id} className="holding-card">
                    <div>
                      <h3>{a.subject || 'Announcement'}</h3>
                      <p className="muted tiny">
                        {a.announcedAt
                          ? new Date(a.announcedAt).toLocaleString('en-IN')
                          : new Date(a.createdAt).toLocaleString('en-IN')}
                      </p>
                      {a.body && (
                        <p className="tiny">{a.body.slice(0, 220)}</p>
                      )}
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
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Placeholder({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-block">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}
