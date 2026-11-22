import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuid } from 'uuid';
import { AnnouncementsService } from '../announcements/announcements.service';
import { MarketService } from '../market/market.service';
import { RecurringService } from '../recurring/recurring.service';
import { ScreenersService } from '../screeners/screeners.service';
import { StoreService } from '../store/store.service';
import type { CronJobKey } from '../store/types';

@Injectable()
export class CronJobsService implements OnModuleInit {
  private readonly logger = new Logger(CronJobsService.name);
  private priceRefreshRunning = false;
  private announcementsRunning = false;

  constructor(
    private readonly store: StoreService,
    private readonly screeners: ScreenersService,
    private readonly market: MarketService,
    private readonly recurring: RecurringService,
    private readonly announcements: AnnouncementsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    await this.applySchedules();
    void this.runScreenerJob('bootstrap');
  }

  /** Re-register cron jobs from Admin → Cron settings. */
  async applySchedules() {
    const settings = await this.store.getCronSettings();
    for (const job of settings.jobs) {
      this.replaceJob(job.key, job.expression);
    }
    this.logger.log(
      `Cron schedules applied: ${settings.jobs
        .map((j) => `${j.key}=${j.expression}`)
        .join(', ')}`,
    );
  }

  private jobName(key: CronJobKey) {
    return `fg_${key}`;
  }

  private replaceJob(key: CronJobKey, expression: string) {
    const name = this.jobName(key);
    try {
      this.schedulerRegistry.deleteCronJob(name);
    } catch {
      // Job not registered yet.
    }

    const cronJob = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.dispatch(key);
      },
      start: true,
    });
    this.schedulerRegistry.addCronJob(name, cronJob);
  }

  private async dispatch(key: CronJobKey) {
    if (key === 'screener_10m') {
      if (!(await this.guard('screener_10m', 'cron:screener'))) return;
      void this.runScreenerJob('cron:screener');
      return;
    }
    if (key === 'price_refresh') {
      await this.handlePriceRefresh();
      return;
    }
    if (key === 'daily_digest') {
      await this.handleDailyDigest();
      return;
    }
    if (key === 'expense_reminders') {
      await this.handleExpenseReminders();
      return;
    }
    if (key === 'nse_announcements') {
      await this.handleNseAnnouncements();
    }
  }

  private async startRun(job: string) {
    const run = {
      id: uuid(),
      job,
      startedAt: new Date().toISOString(),
      status: 'running' as const,
    };
    await this.store.startCronRun(run);
    return run;
  }

  private finishRun(id: string, status: 'ok' | 'error', detail?: string) {
    return this.store.finishCronRun(id, status, detail);
  }

  private async guard(job: CronJobKey, label: string): Promise<boolean> {
    const enabled = await this.store.isCronJobEnabled(job);
    if (!enabled) {
      this.logger.debug(`Skipping ${label} — disabled in Admin → Cron`);
    }
    return enabled;
  }

  /** Pull LTP + SMAs from Yahoo Finance chart API. */
  async handlePriceRefresh() {
    if (!(await this.guard('price_refresh', 'yahoo-ltp-refresh'))) return;
    if (this.priceRefreshRunning) {
      this.logger.warn('Skipping price refresh — previous run still in progress');
      return;
    }
    this.priceRefreshRunning = true;
    const run = await this.startRun('yahoo-ltp-refresh');
    try {
      const result = await this.market.refreshAllPrices();
      await this.finishRun(
        run.id,
        'ok',
        `Updated ${result.updated}/${result.attempted}; failed ${result.failed.length}`,
      );
      // Re-run screeners after fresh prices.
      await this.runScreenerJob('post-price-refresh');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await this.finishRun(run.id, 'error', message);
      this.logger.error(`LTP refresh failed: ${message}`);
    } finally {
      this.priceRefreshRunning = false;
    }
  }

  async handleDailyDigest() {
    if (!(await this.guard('daily_digest', 'daily-digest'))) return;
    const run = await this.startRun('daily-digest');
    try {
      const results = await this.store.listScreenerResults();
      await this.screeners.queueAlertsForResults(results);
      await this.finishRun(
        run.id,
        'ok',
        `Queued digests for ${results.length} hits`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await this.finishRun(run.id, 'error', message);
    }
  }

  async handleExpenseReminders() {
    if (!(await this.guard('expense_reminders', 'expense-reminders'))) return;
    const run = await this.startRun('expense-reminders');
    try {
      const result = await this.recurring.sendExpenseReminders();
      await this.finishRun(
        run.id,
        'ok',
        `Due ${result.due}/${result.checked}; notified ${result.notified} users`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await this.finishRun(run.id, 'error', message);
      this.logger.error(`Expense reminders failed: ${message}`);
    }
  }

  async handleNseAnnouncements() {
    if (!(await this.guard('nse_announcements', 'nse-announcements'))) return;
    if (this.announcementsRunning) {
      this.logger.warn('Skipping NSE announcements — previous run still in progress');
      return;
    }
    this.announcementsRunning = true;
    const run = await this.startRun('nse-announcements');
    try {
      const result = await this.announcements.syncAndNotify();
      await this.finishRun(
        run.id,
        'ok',
        `Watched ${result.watchedSymbols}; fetched ${result.fetched}; new ${result.inserted}; notified ${result.notified}; ${result.detail}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await this.finishRun(run.id, 'error', message);
      this.logger.error(`NSE announcements failed: ${message}`);
    } finally {
      this.announcementsRunning = false;
    }
  }

  async runScreenerJob(label: string) {
    const run = await this.startRun(`screener-run:${label}`);
    try {
      const results = await this.screeners.runAll(label);
      if (label !== 'bootstrap') {
        await this.screeners.queueAlertsForResults(results);
      }
      await this.finishRun(run.id, 'ok', `${results.length} matches`);
      this.logger.log(`Screener job (${label}) → ${results.length} matches`);
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await this.finishRun(run.id, 'error', message);
      this.logger.error(`Screener job failed: ${message}`);
      return [];
    }
  }
}
