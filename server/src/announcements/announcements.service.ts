import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type { NseAnnouncement, Ticker } from '../store/types';
import { TelegramService } from '../telegram/telegram.service';

type NseRawAnnouncement = {
  seq_id?: string | number;
  symbol?: string;
  sm_name?: string;
  sm_isin?: string;
  desc?: string;
  attchmntText?: string;
  attchmntFile?: string;
  attFileSize?: string;
  an_dt?: string;
  sort_date?: string;
  smIndustry?: string;
};

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  private cookie = '';
  private cookieAt = 0;

  constructor(
    private readonly store: StoreService,
    private readonly telegram: TelegramService,
  ) {}

  private nseHeaders() {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer:
        'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
      ...(this.cookie ? { Cookie: this.cookie } : {}),
    };
  }

  private async warmNseSession() {
    const stale = Date.now() - this.cookieAt > 10 * 60 * 1000;
    if (this.cookie && !stale) return;
    const res = await fetch('https://www.nseindia.com/', {
      headers: this.nseHeaders(),
      signal: AbortSignal.timeout(20000),
    });
    const setCookie =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [];
    if (setCookie.length) {
      this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      this.cookieAt = Date.now();
    }
  }

  private dmy(d: Date) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  private parseNseDate(value?: string) {
    if (!value?.trim()) return undefined;
    // "09-Nov-2026 23:45:59" or "2026-11-09 23:45:59"
    const isoish = value.trim().replace(' ', 'T');
    const parsed = Date.parse(isoish);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    const m = value.match(
      /^(\d{2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/,
    );
    if (!m) return undefined;
    const months: Record<string, number> = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    const month = months[m[2]];
    if (month == null) return undefined;
    const dt = new Date(
      Number(m[3]),
      month,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
    );
    return dt.toISOString();
  }

  private normalizeRows(payload: unknown): NseRawAnnouncement[] {
    if (Array.isArray(payload)) return payload as NseRawAnnouncement[];
    if (payload && typeof payload === 'object') {
      const obj = payload as { data?: unknown; announcements?: unknown };
      if (Array.isArray(obj.data)) return obj.data as NseRawAnnouncement[];
      if (Array.isArray(obj.announcements)) {
        return obj.announcements as NseRawAnnouncement[];
      }
    }
    return [];
  }

  async fetchFromNse(opts?: {
    symbol?: string;
    from?: Date;
    to?: Date;
  }): Promise<NseRawAnnouncement[]> {
    await this.warmNseSession();
    const params = new URLSearchParams({ index: 'equities' });
    if (opts?.symbol) params.set('symbol', opts.symbol.toUpperCase());
    if (opts?.from && opts?.to) {
      params.set('from_date', this.dmy(opts.from));
      params.set('to_date', this.dmy(opts.to));
    }
    const url = `https://www.nseindia.com/api/corporate-announcements?${params}`;
    const res = await fetch(url, {
      headers: this.nseHeaders(),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      throw new Error(`NSE announcements HTTP ${res.status}`);
    }
    const json = await res.json();
    return this.normalizeRows(json);
  }

  private toRecord(raw: NseRawAnnouncement): Omit<NseAnnouncement, 'createdAt'> & {
    raw: Record<string, unknown>;
  } | null {
    const seq = raw.seq_id != null ? String(raw.seq_id) : '';
    const symbol = (raw.symbol || '').trim().toUpperCase();
    if (!seq || !symbol) return null;
    return {
      id: uuid(),
      seqId: seq,
      symbol,
      companyName: (raw.sm_name || '').trim(),
      isin: raw.sm_isin || undefined,
      subject: (raw.desc || '').trim(),
      body: (raw.attchmntText || '').trim(),
      attachmentUrl: raw.attchmntFile || undefined,
      attachmentSize: raw.attFileSize || undefined,
      announcedAt: this.parseNseDate(raw.an_dt),
      sortDate: this.parseNseDate(raw.sort_date) || this.parseNseDate(raw.an_dt),
      industry: raw.smIndustry || undefined,
      raw: raw as Record<string, unknown>,
    };
  }

  async listForUser(userId: string, limit = 50) {
    const watched = await this.store.listAnnouncementAlertStocks(userId);
    if (!watched.length) {
      return { items: [] as NseAnnouncement[], watchedSymbols: [] as string[] };
    }
    const tickers = await this.store.listTickers();
    const byId = new Map(tickers.map((t) => [t.id, t]));
    const symbols = watched
      .map((w) => byId.get(w.tickerId)?.symbol)
      .filter((s): s is string => Boolean(s));
    const items = await this.store.listAnnouncements({ symbols, limit });
    return { items, watchedSymbols: symbols };
  }

  async listAlertStocks(userId: string) {
    const [items, tickers] = await Promise.all([
      this.store.listAnnouncementAlertStocks(userId),
      this.store.listTickers(),
    ]);
    const byId = new Map(tickers.map((t) => [t.id, t]));
    return items.map((item) => ({
      ...item,
      ticker: byId.get(item.tickerId),
    }));
  }

  async addAlertStock(userId: string, tickerId: string) {
    if (!tickerId?.trim()) {
      throw new BadRequestException('tickerId is required');
    }
    const ticker = await this.store.findTicker(tickerId);
    if (!ticker) throw new NotFoundException('Ticker not found');
    const item = await this.store.addAnnouncementAlertStock({
      id: uuid(),
      userId,
      tickerId,
      createdAt: new Date().toISOString(),
    });
    return { ...item, ticker };
  }

  async removeAlertStock(userId: string, id: string) {
    const ok = await this.store.removeAnnouncementAlertStock(userId, id);
    if (!ok) throw new NotFoundException('Alert stock not found');
    return { ok: true };
  }

  private async notifyUsers(
    announcement: NseAnnouncement,
    userIds: string[],
  ) {
    const stamp = new Date().toISOString();
    const title = `NSE · ${announcement.symbol}`;
    const bodyLines = [
      announcement.subject || 'Corporate announcement',
      announcement.companyName ? announcement.companyName : '',
      announcement.announcedAt
        ? `At ${new Date(announcement.announcedAt).toLocaleString('en-IN')}`
        : '',
      announcement.body ? announcement.body.slice(0, 500) : '',
      announcement.attachmentUrl || '',
    ].filter(Boolean);
    const body = bodyLines.join('\n');

    for (const userId of userIds) {
      const user = await this.store.findUserById(userId);
      if (!user) continue;
      if (!user.notifyEmail && !user.notifyTelegram) continue;

      if (user.notifyEmail) {
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'email',
          title,
          body,
          createdAt: stamp,
          status: 'sent',
        });
      }
      if (user.notifyTelegram && user.telegramChatId) {
        const message = `${title}\n\n${body}`;
        const sent = await this.telegram.sendMessage(
          user.telegramChatId,
          message,
        );
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'telegram',
          title,
          body,
          createdAt: stamp,
          status: sent.ok ? 'sent' : 'failed',
        });
        if (!sent.ok) {
          this.logger.warn(
            `Announcement Telegram failed for ${user.id}: ${sent.error}`,
          );
        }
      }
    }
  }

  /**
   * Cron entry: pull recent NSE filings for watched symbols, store new ones,
   * notify subscribed users.
   */
  async syncAndNotify() {
    const coverage = await this.store.listAnnouncementWatchCoverage();
    if (!coverage.length) {
      return {
        watchedSymbols: 0,
        fetched: 0,
        inserted: 0,
        notified: 0,
        detail: 'No users watching announcement stocks',
      };
    }

    const bySymbol = new Map(
      coverage.map((c) => [c.symbol.toUpperCase(), c.userIds]),
    );
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 2);

    let fetched = 0;
    let inserted = 0;
    let notified = 0;
    const errors: string[] = [];

    let marketWideOk = false;
    try {
      const rows = await this.fetchFromNse({ from, to });
      marketWideOk = true;
      fetched += rows.length;
      for (const raw of rows) {
        const record = this.toRecord(raw);
        if (!record) continue;
        const subscribers = bySymbol.get(record.symbol);
        if (!subscribers?.length) continue;
        const created = await this.store.insertAnnouncementIfNew(record);
        if (!created) continue;
        inserted += 1;
        await this.notifyUsers(created, subscribers);
        notified += subscribers.length;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'market-wide fetch failed';
      errors.push(message);
      this.logger.warn(`NSE market-wide fetch failed: ${message}`);
    }

    // Per-symbol only when the market-wide pull failed.
    if (!marketWideOk) {
      for (const item of coverage) {
        try {
          const rows = await this.fetchFromNse({
            symbol: item.symbol,
            from,
            to,
          });
          fetched += rows.length;
          for (const raw of rows) {
            const record = this.toRecord(raw);
            if (!record) continue;
            const created = await this.store.insertAnnouncementIfNew(record);
            if (!created) continue;
            inserted += 1;
            await this.notifyUsers(created, item.userIds);
            notified += item.userIds.length;
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : `fetch ${item.symbol} failed`;
          errors.push(`${item.symbol}: ${message}`);
          this.logger.warn(`NSE fetch failed for ${item.symbol}: ${message}`);
        }
      }
    }

    return {
      watchedSymbols: coverage.length,
      fetched,
      inserted,
      notified,
      detail: errors.length ? `errors: ${errors.slice(0, 3).join('; ')}` : 'ok',
    };
  }

  async manualSync() {
    return this.syncAndNotify();
  }

  async searchTickers(query: string): Promise<Ticker[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 1) throw new BadRequestException('Query required');
    const tickers = await this.store.listTickers();
    return tickers
      .filter(
        (t) =>
          t.active &&
          (t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q)),
      )
      .slice(0, 25);
  }
}
