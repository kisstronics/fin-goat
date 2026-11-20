import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type { FeatureFlag, Plan, PlanId, Ticker } from '../store/types';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Get('tickers')
  tickers() {
    return this.admin.tickers();
  }

  @Post('tickers')
  upsertTicker(
    @Body() body: Partial<Ticker> & { symbol: string; name: string },
  ) {
    return this.admin.upsertTicker(body);
  }

  @Post('tickers/sync')
  syncAllTickers() {
    return this.admin.syncAllTickers();
  }

  @Post('tickers/refresh-prices')
  refreshTickerPrices() {
    return this.admin.refreshTickerPrices();
  }

  @Get('plans')
  plans() {
    return this.admin.plans();
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: PlanId, @Body() body: Partial<Plan>) {
    return this.admin.updatePlan(id, body);
  }

  @Get('features')
  features() {
    return this.admin.features();
  }

  @Patch('features/:key')
  updateFeature(
    @Param('key') key: string,
    @Body() body: Partial<FeatureFlag>,
  ) {
    return this.admin.updateFeature(key, body);
  }

  @Get('cron-runs')
  cronRuns() {
    return this.admin.cronRuns();
  }

  @Get('app-settings')
  appSettings() {
    return this.admin.getAppSettings();
  }

  @Patch('app-settings')
  updateAppSettings(
    @Body()
    body: {
      google?: Partial<{
        clientId: string;
        clientSecret: string;
        callbackUrl: string;
        enabled: boolean;
        allowDevLogin: boolean;
      }>;
    },
  ) {
    return this.admin.updateAppSettings(body);
  }
}
