import { Injectable, Logger } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { Ticker } from '../store/types';
import { NSE_UNIVERSE } from './universe';

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
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

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

  async fetchYahooChart(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE') {
    const yahoo = this.yahooSymbol(symbol, exchange);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=1y&interval=1d`;
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
          indicators?: {
            quote?: Array<{ close?: Array<number | null> }>;
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

    const closes = (result.indicators?.quote?.[0]?.close || []).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    const sma50 = this.avg(closes.slice(-50));
    const sma200 = this.avg(closes.slice(-200));
    const meta = result.meta;
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(
      meta.previousClose ?? meta.chartPreviousClose ?? price,
    );

    const snapshot: QuoteSnapshot = {
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
    };
    return snapshot;
  }

  private async mapPool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    });
    await Promise.all(runners);
    return results;
  }

  /** Upsert NSE universe, then pull LTP/SMA from Yahoo Finance (free chart API). */
  async syncAllTickers() {
    const created: string[] = [];
    const updated: string[] = [];
    const failed: { symbol: string; error: string }[] = [];

    for (const stock of NSE_UNIVERSE) {
      const existing = await this.store.findTickerBySymbol(stock.symbol, 'NSE');
      if (existing) {
        await this.store.upsertTicker({
          id: existing.id,
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          industry: stock.industry,
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
          exchange: 'NSE',
          active: true,
          price: 0,
          prevClose: 0,
        });
        created.push(stock.symbol);
      }
    }

    const priced = await this.refreshAllPrices();
    return {
      universeSize: NSE_UNIVERSE.length,
      created: created.length,
      updated: updated.length,
      createdSymbols: created,
      priceRefresh: priced,
      failed,
      source: 'Yahoo Finance chart API (free, delayed)',
      syncedAt: new Date().toISOString(),
    };
  }

  /** Refresh LTP + indicators for every active ticker. */
  async refreshAllPrices() {
    const tickers = (await this.store.listTickers()).filter((t) => t.active);
    let ok = 0;
    const failed: { symbol: string; error: string }[] = [];

    await this.mapPool(tickers, 4, async (ticker) => {
      try {
        const quote = await this.fetchYahooChart(ticker.symbol, ticker.exchange);
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
        ok += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        failed.push({ symbol: ticker.symbol, error: message });
        this.logger.warn(`Price refresh failed for ${ticker.symbol}: ${message}`);
      }
    });

    this.logger.log(`Price refresh: ${ok}/${tickers.length} ok, ${failed.length} failed`);
    return {
      attempted: tickers.length,
      updated: ok,
      failed,
      refreshedAt: new Date().toISOString(),
    };
  }

  async refreshOne(ticker: Ticker) {
    const quote = await this.fetchYahooChart(ticker.symbol, ticker.exchange);
    return this.store.applyQuote(ticker.id, {
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
  }
}
