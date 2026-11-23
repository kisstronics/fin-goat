import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { EmailService } from '../email/email.service';
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
    private readonly email: EmailService,
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
      this.store.listTickers({
        activeOnly: true,
        includeInScreener: true,
      }),
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
          // Stable while the ticker keeps matching this screener — price ticks
          // must not re-trigger the same alert.
          fingerprint: key,
        });
      }
    }

    await this.store.replaceScreenerResults(results);
    return results;
  }

  private fingerprintOf(result: ScreenerResult): string {
    // Presence-based: same ticker+screener stays silenced until it drops out.
    return result.fingerprint || result.screener;
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
    const activeKeys = results.map((r) => ({
      tickerId: r.tickerId,
      screener: r.screener,
    }));

    for (const user of users) {
      // Clear sent-state for matches that dropped out so a rematch can alert.
      await this.store.pruneScreenerAlertSent(user.id, activeKeys);

      const previouslySent = await this.store.listScreenerAlertSent(user.id);
      const sentByKey = new Map(
        previouslySent.map((s) => [`${s.tickerId}:${s.screener}`, s]),
      );

      const fresh = results.filter((r) => {
        const prior = sentByKey.get(`${r.tickerId}:${r.screener}`);
        if (!prior) return true;
        return prior.fingerprint !== this.fingerprintOf(r);
      });

      if (!fresh.length) {
        this.logger.debug(
          `Skipping screener alerts for ${user.id} — no new/changed matches`,
        );
        continue;
      }

      const digest = fresh.slice(0, 5);
      const body = digest
        .map((r) => {
          const t = byId.get(r.tickerId);
          return `${t?.symbol || r.tickerId}: ${r.reason}`;
        })
        .join('\n');
      const more = fresh.length - digest.length;

      let delivered = false;

      if (user.notifyEmail) {
        const title = 'Fin Goat screener digest';
        const sent = await this.email.notifyUser({
          user,
          templateKey: 'screener_digest',
          title,
          body,
        });
        if (!sent.ok) {
          this.logger.warn(
            `Email alert failed for ${user.id}: ${sent.error}`,
          );
        } else {
          delivered = true;
        }
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'email',
          title,
          body,
          createdAt: stamp,
          status: sent.ok ? 'sent' : 'failed',
        });
      }
      if (user.notifyTelegram && user.telegramChatId) {
        const title = 'Fin Goat screener alert';
        const e = (v: string) => this.telegram.escapeHtml(v);
        const htmlLines = digest.map((r) => {
          const t = byId.get(r.tickerId);
          const symbol = e(t?.symbol || r.tickerId);
          const name = t?.name ? ` · ${e(t.name)}` : '';
          const screenerName = e(
            SCREENER_META[r.screener]?.name || r.screener,
          );
          const reason = e(r.reason);
          const price =
            t && Number.isFinite(t.price) && t.price > 0
              ? `  ₹${Math.round(t.price).toLocaleString('en-IN')}`
              : '';
          return [
            `• <b>${symbol}</b>${name}${price}`,
            `  <i>${screenerName}</i>`,
            `  ${reason}`,
          ].join('\n');
        });
        if (more > 0) {
          htmlLines.push(`• <i>+${more} more match${more === 1 ? '' : 'es'}</i>`);
        }
        const message = this.telegram.formatHtmlCard({
          badge: '📊 Screener',
          title: 'New matches',
          subtitle: `${fresh.length} update${fresh.length === 1 ? '' : 's'} · Fin Goat`,
          lines: htmlLines,
          footer: 'Open Fin Goat → Market for full details',
        });
        const sent = await this.telegram.sendHtml(
          user.telegramChatId,
          message,
        );
        if (!sent.ok) {
          this.logger.warn(
            `Telegram alert failed for ${user.id}: ${sent.error}`,
          );
        } else {
          delivered = true;
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

      // Only mark the matches we actually included, after at least one channel
      // delivered — so a total failure (and overflow beyond the digest cap)
      // can retry on the next run.
      if (delivered) {
        for (const r of digest) {
          await this.store.upsertScreenerAlertSent({
            userId: user.id,
            tickerId: r.tickerId,
            screener: r.screener,
            fingerprint: this.fingerprintOf(r),
            sentAt: stamp,
          });
        }
      }
    }
  }
}
