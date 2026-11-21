import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type { ScreenerKey, ScreenerResult, Ticker } from '../store/types';
import { TelegramService } from '../telegram/telegram.service';

const SCREENER_META: Record<
  ScreenerKey,
  { name: string; description: string; logic: string }
> = {
  golden_crossover: {
    name: 'Golden Cross Over',
    description: '50-day SMA crosses above the 200-day SMA.',
    logic: 'sma50 > sma200 AND price > sma50',
  },
  near_52w_low: {
    name: 'Near 52 Week Low',
    description: 'Price within 8% of the 52-week low.',
    logic: '(price - low52w) / low52w <= 0.08',
  },
  above_50pct_from_low: {
    name: 'Above 50% from 52W Low',
    description: 'Recovered at least 50% from the 52-week low.',
    logic: '(price - low52w) / low52w >= 0.50',
  },
};

@Injectable()
export class ScreenersService {
  private readonly logger = new Logger(ScreenersService.name);

  constructor(
    private readonly store: StoreService,
    private readonly telegram: TelegramService,
  ) {}

  async listDefinitions() {
    const features = await this.store.listFeatures();
    return (Object.keys(SCREENER_META) as ScreenerKey[]).map((key) => ({
      key,
      ...SCREENER_META[key],
      enabled: features.find((f) => f.key === key)?.enabled ?? true,
    }));
  }

  matchesTicker(ticker: Ticker, key: ScreenerKey): string | null {
    if (!ticker.active) return null;
    if (key === 'golden_crossover') {
      if (ticker.sma50 > ticker.sma200 && ticker.price > ticker.sma50) {
        return `SMA50 (${ticker.sma50}) above SMA200 (${ticker.sma200})`;
      }
    }
    if (key === 'near_52w_low') {
      const pct = (ticker.price - ticker.low52w) / ticker.low52w;
      if (pct <= 0.08) {
        return `${(pct * 100).toFixed(1)}% above 52W low`;
      }
    }
    if (key === 'above_50pct_from_low') {
      const pct = (ticker.price - ticker.low52w) / ticker.low52w;
      if (pct >= 0.5) {
        return `${(pct * 100).toFixed(1)}% above 52W low`;
      }
    }
    return null;
  }

  async runAll(triggeredBy = 'manual'): Promise<ScreenerResult[]> {
    const results: ScreenerResult[] = [];
    const keys = Object.keys(SCREENER_META) as ScreenerKey[];
    const stamp = new Date().toISOString();
    const [tickers, features] = await Promise.all([
      this.store.listTickers(),
      this.store.listFeatures(),
    ]);

    for (const ticker of tickers) {
      for (const key of keys) {
        const feature = features.find((f) => f.key === key);
        if (feature && !feature.enabled) continue;
        const reason = this.matchesTicker(ticker, key);
        if (!reason) continue;
        results.push({
          tickerId: ticker.id,
          screener: key,
          matchedAt: stamp,
          reason: `${reason} · ${triggeredBy}`,
        });
      }
    }

    await this.store.replaceScreenerResults(results);
    return results;
  }

  async getResults(screener?: ScreenerKey) {
    const rows = await this.store.listScreenerResults(screener);
    const tickers = await this.store.listTickers();
    const byId = new Map(tickers.map((t) => [t.id, t]));
    return rows.map((r) => ({ ...r, ticker: byId.get(r.tickerId) }));
  }

  async listWatchlist(userId: string) {
    const items = await this.store.listWatchlist(userId);
    const tickers = await this.store.listTickers();
    const byId = new Map(tickers.map((t) => [t.id, t]));
    return items.map((w) => ({ ...w, ticker: byId.get(w.tickerId) }));
  }

  async addWatchlist(userId: string, tickerId: string) {
    const existing = await this.store.findWatchlistItem(userId, tickerId);
    if (existing) return existing;
    return this.store.addWatchlist({
      id: uuid(),
      userId,
      tickerId,
      createdAt: new Date().toISOString(),
    });
  }

  removeWatchlist(userId: string, id: string) {
    return this.store.removeWatchlist(userId, id).then(() => ({ ok: true }));
  }

  async queueAlertsForResults(results: ScreenerResult[]) {
    const [users, tickers] = await Promise.all([
      this.store.listNotifyUsers(),
      this.store.listTickers(),
    ]);
    const byId = new Map(tickers.map((t) => [t.id, t]));
    const stamp = new Date().toISOString();

    for (const user of users) {
      const fresh = results.slice(0, 5);
      if (!fresh.length) continue;
      const body = fresh
        .map((r) => {
          const t = byId.get(r.tickerId);
          return `${t?.symbol || r.tickerId}: ${r.reason}`;
        })
        .join('\n');

      if (user.notifyEmail) {
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'email',
          title: 'Fin Goat screener digest',
          body,
          createdAt: stamp,
          status: 'sent',
        });
      }
      if (user.notifyTelegram && user.telegramChatId) {
        const title = 'Fin Goat screener alert';
        const message = `${title}\n\n${body}`;
        const sent = await this.telegram.sendMessage(
          user.telegramChatId,
          message,
        );
        if (!sent.ok) {
          this.logger.warn(
            `Telegram alert failed for ${user.id}: ${sent.error}`,
          );
        }
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'telegram',
          title,
          body,
          createdAt: stamp,
          status: sent.ok ? 'sent' : 'failed',
        });
      }
    }
  }
}
