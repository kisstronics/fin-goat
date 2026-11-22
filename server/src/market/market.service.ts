import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type {
  ChartRange,
  PriceBar,
  StockDetail,
  StockScorecardItem,
  Ticker,
} from '../store/types';
import { fetchNseEquityUniverse } from './nse-listings';

export interface QuoteSnapshot {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  sma50: number;
  sma200: number;
  high52w: number;
  low52w: number;
  volume: number;
  marketCapCr: number;
  bars: Omit<PriceBar, 'tickerId'>[];
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private historyBackfillRunning = false;

  constructor(private readonly store: StoreService) {}

  /** Map legacy / renamed NSE codes to current Yahoo symbols. */
  private readonly symbolAliases: Record<string, string> = {
    TATAMOTORS: 'TMPV',
  };

  yahooSymbol(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE') {
    let clean = symbol.trim().toUpperCase();
    if (clean.endsWith('.NS') || clean.endsWith('.BO')) {
      return clean;
    }
    clean = this.symbolAliases[clean] || clean;
    return exchange === 'BSE' ? `${clean}.BO` : `${clean}.NS`;
  }

  private avg(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private yahooRangeFor(range: ChartRange): { range: string; interval: string } {
    switch (range) {
      case '1d':
        return { range: '1d', interval: '5m' };
      case '1w':
        return { range: '5d', interval: '1d' };
      case '1m':
        return { range: '1mo', interval: '1d' };
      case '3m':
        return { range: '3mo', interval: '1d' };
      case '6m':
        return { range: '6mo', interval: '1d' };
      case '1y':
        return { range: '1y', interval: '1d' };
      case '3y':
        return { range: '3y', interval: '1d' };
      case '5y':
        return { range: '5y', interval: '1d' };
      case 'max':
        return { range: 'max', interval: '1wk' };
      default:
        return { range: '1y', interval: '1d' };
    }
  }

  async fetchYahooChart(
    symbol: string,
    exchange: 'NSE' | 'BSE' = 'NSE',
    chartRange: ChartRange = '1y',
  ): Promise<QuoteSnapshot> {
    const yahoo = this.yahooSymbol(symbol, exchange);
    const { range, interval } = this.yahooRangeFor(chartRange);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 FinGoat/1.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Yahoo ${yahoo} HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
            fiftyTwoWeekHigh?: number;
            fiftyTwoWeekLow?: number;
            regularMarketVolume?: number;
            longName?: string;
            shortName?: string;
            marketCap?: number;
          };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
        error?: { description?: string } | null;
      };
    };

    const result = json.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) {
      throw new Error(
        json.chart?.error?.description || `No quote data for ${yahoo}`,
      );
    }

    const quote = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];
    const closesRaw = quote.close || [];
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const volumes = quote.volume || [];

    const bars: Omit<PriceBar, 'tickerId'>[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closesRaw[i];
      if (typeof close !== 'number' || !Number.isFinite(close)) continue;
      const ts = timestamps[i] * 1000;
      const date = new Date(ts).toISOString().slice(0, 10);
      const open =
        typeof opens[i] === 'number' && Number.isFinite(opens[i] as number)
          ? (opens[i] as number)
          : close;
      const high =
        typeof highs[i] === 'number' && Number.isFinite(highs[i] as number)
          ? (highs[i] as number)
          : Math.max(open, close);
      const low =
        typeof lows[i] === 'number' && Number.isFinite(lows[i] as number)
          ? (lows[i] as number)
          : Math.min(open, close);
      const volume =
        typeof volumes[i] === 'number' && Number.isFinite(volumes[i] as number)
          ? (volumes[i] as number)
          : 0;
      bars.push({ date, open, high, low, close, volume });
    }

    const closes = bars.map((b) => b.close);
    const sma50 = this.avg(closes.slice(-50));
    const sma200 = this.avg(closes.slice(-200));
    const meta = result.meta;
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(
      meta.previousClose ?? meta.chartPreviousClose ?? price,
    );

    return {
      symbol: symbol.toUpperCase().replace(/\.NS$|\.BO$/i, ''),
      name: meta.longName || meta.shortName || symbol,
      price,
      prevClose,
      sma50: Number(sma50.toFixed(2)),
      sma200: Number(sma200.toFixed(2)),
      high52w: Number(meta.fiftyTwoWeekHigh ?? Math.max(...closes, price)),
      low52w: Number(meta.fiftyTwoWeekLow ?? Math.min(...closes, price)),
      volume: Number(meta.regularMarketVolume ?? 0),
      marketCapCr: meta.marketCap
        ? Number((meta.marketCap / 1_00_00_000).toFixed(2))
        : 0,
      bars,
    };
  }

  private async mapPool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (next < items.length) {
          const i = next++;
          results[i] = await worker(items[i], i);
        }
      },
    );
    await Promise.all(runners);
    return results;
  }

  private async persistQuote(ticker: Ticker, quote: QuoteSnapshot) {
    await this.store.applyQuote(ticker.id, {
      name: ticker.name || quote.name,
      price: quote.price,
      prevClose: quote.prevClose,
      sma50: quote.sma50,
      sma200: quote.sma200,
      high52w: quote.high52w,
      low52w: quote.low52w,
      volume: quote.volume,
      marketCapCr: quote.marketCapCr || ticker.marketCapCr,
    });
    if (quote.bars.length) {
      await this.store.upsertPriceBars(
        quote.bars.map((b) => ({ ...b, tickerId: ticker.id })),
      );
    }
  }

  /**
   * Upsert the full NSE equity master list (~2k+ symbols).
   * Price refresh runs in the background so the admin call returns quickly.
   */
  async syncAllTickers() {
    const listing = await fetchNseEquityUniverse();
    const created: string[] = [];
    const updated: string[] = [];
    const failed: { symbol: string; error: string }[] = [];

    for (const stock of listing.stocks) {
      try {
        const existing = await this.store.findTickerBySymbol(
          stock.symbol,
          'NSE',
        );
        if (existing) {
          await this.store.upsertTicker({
            id: existing.id,
            symbol: stock.symbol,
            name: stock.name || existing.name,
            sector: stock.sector || existing.sector,
            industry: stock.industry || existing.industry,
            isin: stock.isin || existing.isin,
            exchange: 'NSE',
            active: true,
          });
          updated.push(stock.symbol);
        } else {
          await this.store.upsertTicker({
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            industry: stock.industry,
            isin: stock.isin,
            exchange: 'NSE',
            active: true,
            price: 0,
            prevClose: 0,
          });
          created.push(stock.symbol);
        }
      } catch (err) {
        failed.push({
          symbol: stock.symbol,
          error: err instanceof Error ? err.message : 'upsert failed',
        });
      }
    }

    void this.refreshAllPrices()
      .then((priced) => {
        this.logger.log(
          `Background price refresh after sync: ${priced.updated}/${priced.attempted}`,
        );
      })
      .catch((err) => {
        this.logger.warn(
          `Background price refresh failed: ${err instanceof Error ? err.message : err}`,
        );
      });

    void this.backfillHistoryBatch(25).catch((err) => {
      this.logger.warn(
        `History backfill kickoff failed: ${err instanceof Error ? err.message : err}`,
      );
    });

    return {
      universeSize: listing.stocks.length,
      created: created.length,
      updated: updated.length,
      createdSymbols: created.slice(0, 50),
      priceRefresh: {
        attempted: 0,
        updated: 0,
        failed: [] as { symbol: string; error: string }[],
        status: 'started_in_background' as const,
        note: 'LTP refresh + 1Y history backfill started in background (batched).',
      },
      failed,
      source: listing.source,
      fallback: listing.fallback,
      syncedAt: new Date().toISOString(),
    };
  }

  async listActiveTickers() {
    const tickers = await this.store.listTickers();
    return tickers.filter((t) => t.active);
  }

  /** Refresh LTP + indicators for every active ticker (also stores daily bars). */
  async refreshAllPrices() {
    const tickers = (await this.store.listTickers()).filter((t) => t.active);
    let ok = 0;
    const failed: { symbol: string; error: string }[] = [];

    await this.mapPool(tickers, 6, async (ticker) => {
      try {
        const quote = await this.fetchYahooChart(
          ticker.symbol,
          ticker.exchange,
          '1y',
        );
        await this.persistQuote(ticker, quote);
        ok += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        failed.push({ symbol: ticker.symbol, error: message });
        this.logger.warn(`Price refresh failed for ${ticker.symbol}: ${message}`);
      }
    });

    this.logger.log(
      `Price refresh: ${ok}/${tickers.length} ok, ${failed.length} failed`,
    );
    return {
      attempted: tickers.length,
      updated: ok,
      failed,
      refreshedAt: new Date().toISOString(),
    };
  }

  async refreshOne(ticker: Ticker) {
    const quote = await this.fetchYahooChart(
      ticker.symbol,
      ticker.exchange,
      '1y',
    );
    await this.persistQuote(ticker, quote);
    return this.store.findTicker(ticker.id);
  }

  /**
   * Load ~1Y daily OHLCV for a small batch of tickers that still need history.
   * Designed to be called repeatedly by cron / admin — never all symbols at once.
   */
  async backfillHistoryBatch(batchSize = 25) {
    if (this.historyBackfillRunning) {
      return {
        skipped: true,
        reason: 'already_running',
        attempted: 0,
        updated: 0,
        failed: [] as { symbol: string; error: string }[],
        coverage: await this.store.countHistoryCoverage(200),
      };
    }
    this.historyBackfillRunning = true;
    try {
      const tickers = await this.store.listTickersNeedingHistory(
        200,
        Math.min(Math.max(batchSize, 1), 50),
      );
      let ok = 0;
      const failed: { symbol: string; error: string }[] = [];

      await this.mapPool(tickers, 4, async (ticker) => {
        try {
          const quote = await this.fetchYahooChart(
            ticker.symbol,
            ticker.exchange,
            '1y',
          );
          await this.persistQuote(ticker, quote);
          ok += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown';
          failed.push({ symbol: ticker.symbol, error: message });
          this.logger.warn(
            `History backfill failed for ${ticker.symbol}: ${message}`,
          );
        }
      });

      const coverage = await this.store.countHistoryCoverage(200);
      this.logger.log(
        `History backfill batch: ${ok}/${tickers.length} · coverage ${coverage.complete}/${coverage.total}`,
      );
      return {
        skipped: false,
        attempted: tickers.length,
        updated: ok,
        failed,
        coverage,
        finishedAt: new Date().toISOString(),
      };
    } finally {
      this.historyBackfillRunning = false;
    }
  }

  historyCoverage() {
    return this.store.countHistoryCoverage(200);
  }

  private buildScorecard(ticker: Ticker): StockScorecardItem[] {
    const changePct =
      ticker.prevClose > 0
        ? ((ticker.price - ticker.prevClose) / ticker.prevClose) * 100
        : 0;
    const range = ticker.high52w - ticker.low52w;
    const posInRange =
      range > 0 ? ((ticker.price - ticker.low52w) / range) * 100 : 50;
    const aboveSma50 = ticker.sma50 > 0 && ticker.price >= ticker.sma50;
    const aboveSma200 = ticker.sma200 > 0 && ticker.price >= ticker.sma200;
    const recoveryFromLow =
      ticker.low52w > 0
        ? ((ticker.price - ticker.low52w) / ticker.low52w) * 100
        : 0;

    const performanceRating: StockScorecardItem['rating'] =
      changePct >= 1 || (aboveSma50 && aboveSma200)
        ? 'High'
        : changePct <= -1 || (!aboveSma50 && !aboveSma200)
          ? 'Low'
          : 'Avg';

    const valuationRating: StockScorecardItem['rating'] =
      posInRange >= 75 ? 'High' : posInRange <= 30 ? 'Low' : 'Avg';

    const growthRating: StockScorecardItem['rating'] =
      recoveryFromLow >= 50 ? 'High' : recoveryFromLow >= 20 ? 'Avg' : 'Low';

    const profitabilityRating: StockScorecardItem['rating'] =
      ticker.pe != null && ticker.pe > 0 && ticker.pe < 25
        ? 'High'
        : ticker.pe != null && ticker.pe >= 40
          ? 'Low'
          : 'Avg';

    return [
      {
        key: 'performance',
        label: 'Performance',
        rating: performanceRating,
        summary:
          performanceRating === 'High'
            ? 'Trading constructive vs recent levels / moving averages'
            : performanceRating === 'Low'
              ? "Hasn't fared well — amongst the weaker recent performers"
              : 'Mixed recent performance versus moving averages',
      },
      {
        key: 'valuation',
        label: 'Valuation',
        rating: valuationRating,
        summary:
          valuationRating === 'High'
            ? 'Near the top of its 52-week range — may look stretched'
            : valuationRating === 'Low'
              ? 'Closer to the 52-week low — relatively cheaper vs own range'
              : 'Around the middle of its 52-week range',
      },
      {
        key: 'growth',
        label: 'Growth',
        rating: growthRating,
        summary:
          growthRating === 'High'
            ? 'Strong recovery from the 52-week low'
            : growthRating === 'Low'
              ? 'Limited recovery from the 52-week low so far'
              : 'Financials / price recovery has been moderate',
      },
      {
        key: 'profitability',
        label: 'Profitability',
        rating: profitabilityRating,
        summary:
          ticker.pe != null && ticker.pe > 0
            ? `P/E about ${ticker.pe.toFixed(1)} — ${profitabilityRating === 'High' ? 'reasonable vs broad market' : profitabilityRating === 'Low' ? 'elevated multiple' : 'around market average'}`
            : 'Showing signs of profitability & efficiency (limited fundamental feed)',
      },
    ];
  }

  async getStockDetail(symbol: string): Promise<StockDetail> {
    const clean = symbol.trim().toUpperCase();
    let ticker =
      (await this.store.findTickerBySymbol(clean, 'NSE')) ||
      (await this.store.findTickerBySymbol(clean, 'BSE'));
    if (!ticker) {
      throw new NotFoundException(`Ticker ${clean} not found`);
    }

    // Ensure at least one history pass when a user opens the page.
    const historyDays = await this.store.countPriceBars(ticker.id);
    if (historyDays < 200) {
      try {
        const quote = await this.fetchYahooChart(
          ticker.symbol,
          ticker.exchange,
          '1y',
        );
        await this.persistQuote(ticker, quote);
        ticker = (await this.store.findTicker(ticker.id)) || ticker;
      } catch (err) {
        this.logger.warn(
          `On-demand history for ${ticker.symbol} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const bars = await this.store.listPriceBars(ticker.id, { limit: 5 });
    const last = bars[bars.length - 1];
    const change = ticker.price - ticker.prevClose;
    const changePct =
      ticker.prevClose > 0 ? (change / ticker.prevClose) * 100 : 0;

    const [peers, announcements, historyCount] = await Promise.all([
      this.store.listPeerTickers(ticker.sector, ticker.id, 8),
      this.store.listAnnouncements({
        symbols: [ticker.symbol],
        limit: 12,
      }),
      this.store.countPriceBars(ticker.id),
    ]);

    return {
      ticker,
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      dayHigh: last?.high || ticker.high52w,
      dayLow: last?.low || ticker.low52w,
      scorecard: this.buildScorecard(ticker),
      peers,
      announcements,
      historyDays: historyCount,
      historyComplete: historyCount >= 200,
    };
  }

  async getStockHistory(symbol: string, range: ChartRange = '1y') {
    const clean = symbol.trim().toUpperCase();
    const ticker =
      (await this.store.findTickerBySymbol(clean, 'NSE')) ||
      (await this.store.findTickerBySymbol(clean, 'BSE'));
    if (!ticker) {
      throw new NotFoundException(`Ticker ${clean} not found`);
    }

    const now = new Date();
    const from = new Date(now);
    let useDb = true;
    let limit = 400;

    switch (range) {
      case '1d':
        useDb = false;
        break;
      case '1w':
        from.setDate(from.getDate() - 7);
        limit = 10;
        break;
      case '1m':
        from.setMonth(from.getMonth() - 1);
        limit = 30;
        break;
      case '3m':
        from.setMonth(from.getMonth() - 3);
        limit = 70;
        break;
      case '6m':
        from.setMonth(from.getMonth() - 6);
        limit = 140;
        break;
      case '1y':
        from.setFullYear(from.getFullYear() - 1);
        limit = 270;
        break;
      case '3y':
      case '5y':
      case 'max':
        useDb = false;
        break;
    }

    if (useDb) {
      const bars = await this.store.listPriceBars(ticker.id, {
        from: from.toISOString().slice(0, 10),
        limit,
      });
      if (bars.length >= 3 || range === '1y') {
        return {
          symbol: ticker.symbol,
          range,
          source: 'database' as const,
          bars,
        };
      }
    }

    const quote = await this.fetchYahooChart(
      ticker.symbol,
      ticker.exchange,
      range === '1d' ? '1d' : range,
    );
    // Persist daily bars when we fetched a daily series.
    if (range !== '1d' && range !== 'max' && quote.bars.length) {
      await this.store.upsertPriceBars(
        quote.bars.map((b) => ({ ...b, tickerId: ticker.id })),
      );
    }
    return {
      symbol: ticker.symbol,
      range,
      source: 'yahoo' as const,
      bars: quote.bars,
    };
  }
}
