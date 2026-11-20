import { Injectable, NotFoundException } from '@nestjs/common';
import { GoogleAuthService } from '../auth/google-auth.service';
import { MarketService } from '../market/market.service';
import { StoreService } from '../store/store.service';
import type { FeatureFlag, Plan, PlanId, Ticker } from '../store/types';

@Injectable()
export class AdminService {
  constructor(
    private readonly store: StoreService,
    private readonly googleAuth: GoogleAuthService,
    private readonly market: MarketService,
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

  tickers() {
    return this.store.listTickers();
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

  syncAllTickers() {
    return this.market.syncAllTickers();
  }

  refreshTickerPrices() {
    return this.market.refreshAllPrices();
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
    return this.store.listCronRuns(40);
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
    const google = await this.store.getGoogleAuthSettings();
    return {
      google: {
        enabled: google.enabled,
        clientId: google.clientId,
        // Never return raw secret — only whether one is stored.
        hasClientSecret: Boolean(google.clientSecret),
        callbackUrl: google.callbackUrl,
        allowDevLogin: google.allowDevLogin,
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
  }) {
    if (body.google) {
      await this.store.updateGoogleAuthSettings(body.google);
      await this.googleAuth.refreshStrategy();
    }
    return this.getAppSettings();
  }
}
