import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuid } from 'uuid';
import { MarketService } from '../market/market.service';
import { ScreenersService } from '../screeners/screeners.service';
import { StoreService } from '../store/store.service';
import type { CronJobKey } from '../store/types';

@Injectable()
export class CronJobsService implements OnModuleInit {
  private readonly logger = new Logger(CronJobsService.name);
  private priceRefreshRunning = false;

  constructor(
    private readonly store: StoreService,
    private readonly screeners: ScreenersService,
    private readonly market: MarketService,
  ) {}

  onModuleInit() {
    void this.runScreenerJob('bootstrap');
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

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleScreenerCron() {
    if (!(await this.guard('screener_10m', 'cron:every-10m'))) return;
    void this.runScreenerJob('cron:every-10m');
  }

  /** Pull LTP + SMAs from Yahoo Finance chart API every hour. */
  @Cron(CronExpression.EVERY_HOUR)
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
      this.logger.error(`Hourly LTP refresh failed: ${message}`);
    } finally {
      this.priceRefreshRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
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
