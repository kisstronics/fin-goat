import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CronJob } from 'cron';
import { GoogleAuthService } from '../auth/google-auth.service';
import { CronJobsService } from '../cron/cron.service';
import { EmailService } from '../email/email.service';
import { MarketService } from '../market/market.service';
import { StoreService } from '../store/store.service';
import type {
  CronJobKey,
  EmailTemplateKey,
  FeatureFlag,
  Plan,
  PlanId,
  Ticker,
} from '../store/types';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly store: StoreService,
    private readonly googleAuth: GoogleAuthService,
    private readonly market: MarketService,
    private readonly telegram: TelegramService,
    private readonly email: EmailService,
    private readonly cronJobs: CronJobsService,
  ) {}

  async users() {
    const users = await this.store.listUsers();
    return Promise.all(
      users.map(async (u) => ({
        ...u,
        holdingsCount: await this.store.countHoldingsByUser(u.id),
      })),
    );
  }

  tickers(opts?: {
    page?: number;
    pageSize?: number;
    q?: string;
    includeInScreener?: boolean;
    includeInAnnouncements?: boolean;
  }) {
    return this.store.listTickersPaged(opts);
  }

  async upsertTicker(body: Partial<Ticker> & { symbol: string; name: string }) {
    try {
      return await this.store.upsertTicker(body);
    } catch (err) {
      if (err instanceof Error && err.message === 'Ticker not found') {
        throw new NotFoundException('Ticker not found');
      }
      throw err;
    }
  }

  async updateTickerInclusion(
    id: string,
    patch: {
      includeInScreener?: boolean;
      includeInAnnouncements?: boolean;
    },
  ) {
    const ticker = await this.store.updateTickerInclusion(id, patch);
    if (!ticker) throw new NotFoundException('Ticker not found');
    return ticker;
  }

  syncAllTickers() {
    return this.market.syncAllTickers();
  }

  refreshTickerPrices() {
    return this.market.refreshAllPrices();
  }

  backfillHistory(batchSize?: number) {
    return this.market.backfillHistoryBatch(batchSize ?? 25);
  }

  historyCoverage() {
    return this.market.historyCoverage();
  }

  plans() {
    return this.store.listPlans();
  }

  async updatePlan(id: PlanId, patch: Partial<Plan>) {
    const plan = await this.store.updatePlan(id, patch);
    if (!plan) throw new NotFoundException();
    return plan;
  }

  features() {
    return this.store.listFeatures();
  }

  async updateFeature(key: string, patch: Partial<FeatureFlag>) {
    const feature = await this.store.updateFeature(key, patch);
    if (!feature) throw new NotFoundException();
    return feature;
  }

  cronRuns() {
    return this.store.listCronRuns(10);
  }

  getCronSettings() {
    return this.store.getCronSettings();
  }

  private assertValidCronExpression(expression: string) {
    const trimmed = expression.trim();
    if (!trimmed) {
      throw new BadRequestException('Cron expression is required');
    }
    try {
      CronJob.from({ cronTime: trimmed, onTick: () => undefined, start: false });
    } catch {
      throw new BadRequestException(
        `Invalid cron expression: ${trimmed}. Use 5 fields (min hour day month weekday), e.g. */10 * * * *`,
      );
    }
    return trimmed;
  }

  async updateCronSettings(body: {
    masterEnabled?: boolean;
    jobs?: Partial<Record<CronJobKey, boolean>>;
    expressions?: Partial<Record<CronJobKey, string>>;
  }) {
    const expressions: Partial<Record<CronJobKey, string>> = {};
    if (body.expressions) {
      for (const [key, value] of Object.entries(body.expressions) as [
        CronJobKey,
        string | undefined,
      ][]) {
        if (value === undefined) continue;
        expressions[key] = this.assertValidCronExpression(value);
      }
    }

    const next = await this.store.updateCronSettings({
      masterEnabled: body.masterEnabled,
      jobs: body.jobs,
      expressions:
        Object.keys(expressions).length > 0 ? expressions : undefined,
    });
    await this.cronJobs.applySchedules();
    return next;
  }

  async overview() {
    const [users, tickers, holdings, screenerHits, alerts, cronRuns] =
      await Promise.all([
        this.store.countUsers(),
        this.store.countTickers(),
        this.store.countHoldings(),
        this.store.countScreenerResults(),
        this.store.countAlerts(),
        this.store.listCronRuns(1),
      ]);
    return {
      users,
      tickers,
      holdings,
      screenerHits,
      alerts,
      lastCron: cronRuns[0] || null,
    };
  }

  async getAppSettings() {
    const [google, telegram, smtp] = await Promise.all([
      this.store.getGoogleAuthSettings(),
      this.store.getTelegramSettings(),
      this.store.getSmtpSettings(),
    ]);
    return {
      google: {
        enabled: google.enabled,
        clientId: google.clientId,
        // Never return raw secret — only whether one is stored.
        hasClientSecret: Boolean(google.clientSecret),
        callbackUrl: google.callbackUrl,
        allowDevLogin: google.allowDevLogin,
      },
      telegram: {
        enabled: telegram.enabled,
        hasBotToken: Boolean(telegram.botToken),
        webhookUrl: telegram.webhookUrl,
        hasWebhookSecret: Boolean(telegram.webhookSecret),
        botUsername: telegram.botUsername,
      },
      smtp: {
        enabled: smtp.enabled,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        hasPass: Boolean(smtp.pass),
        fromName: smtp.fromName,
        fromEmail: smtp.fromEmail,
      },
    };
  }

  async updateAppSettings(body: {
    google?: Partial<{
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
      enabled: boolean;
      allowDevLogin: boolean;
    }>;
    telegram?: Partial<{
      botToken: string;
      webhookUrl: string;
      webhookSecret: string;
      enabled: boolean;
    }>;
    smtp?: Partial<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      fromName: string;
      fromEmail: string;
      enabled: boolean;
    }>;
  }) {
    if (body.google) {
      await this.store.updateGoogleAuthSettings(body.google);
      await this.googleAuth.refreshStrategy();
    }
    if (body.telegram) {
      await this.telegram.updateSettings(body.telegram);
    }
    if (body.smtp) {
      await this.email.updateSettings(body.smtp);
    }
    return this.getAppSettings();
  }

  listEmailTemplates() {
    return this.store.listEmailTemplates();
  }

  async updateEmailTemplate(
    key: EmailTemplateKey,
    patch: Partial<{
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      enabled: boolean;
    }>,
  ) {
    const next = await this.store.updateEmailTemplate(key, patch);
    if (!next) throw new NotFoundException('Email template not found');
    return next;
  }

  async resetEmailTemplate(key: EmailTemplateKey) {
    const next = await this.store.resetEmailTemplate(key);
    if (!next) throw new NotFoundException('Email template not found');
    return next;
  }

  async sendTestTelegram(phone: string) {
    if (!String(phone || '').trim()) {
      throw new BadRequestException('Phone number is required');
    }
    const result = await this.telegram.sendToLinkedPhone(
      phone,
      this.telegram.formatHtmlCard({
        badge: '✅ Fin Goat',
        title: 'Admin test message',
        lines: ['Your phone + chat link is working.'],
      }),
    );
    if (!result.ok) {
      throw new BadRequestException(
        result.error || 'No linked user found for that phone',
      );
    }
    return {
      ok: true,
      userId: result.userId,
      chatId: result.chatId,
      phone: result.phone,
      message: 'Test message sent on Telegram',
    };
  }

  async sendTestEmail(to: string) {
    const result = await this.email.sendTestEmail(to);
    return {
      ok: true,
      messageId: result.messageId,
      message: 'Test email sent',
      to: String(to || '').trim(),
    };
  }
}
