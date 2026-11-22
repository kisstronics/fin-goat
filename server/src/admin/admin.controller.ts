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
import type {
  CronJobKey,
  EmailTemplateKey,
  FeatureFlag,
  Plan,
  PlanId,
  Ticker,
} from '../store/types';
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

  @Post('tickers/backfill-history')
  backfillHistory(@Body() body: { batchSize?: number }) {
    return this.admin.backfillHistory(
      typeof body?.batchSize === 'number' ? body.batchSize : 25,
    );
  }

  @Get('tickers/history-coverage')
  historyCoverage() {
    return this.admin.historyCoverage();
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

  @Get('cron-settings')
  cronSettings() {
    return this.admin.getCronSettings();
  }

  @Patch('cron-settings')
  updateCronSettings(
    @Body()
    body: {
      masterEnabled?: boolean;
      jobs?: Partial<Record<CronJobKey, boolean>>;
      expressions?: Partial<Record<CronJobKey, string>>;
    },
  ) {
    return this.admin.updateCronSettings(body);
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
    },
  ) {
    return this.admin.updateAppSettings(body);
  }

  @Get('email-templates')
  emailTemplates() {
    return this.admin.listEmailTemplates();
  }

  @Patch('email-templates/:key')
  updateEmailTemplate(
    @Param('key') key: EmailTemplateKey,
    @Body()
    body: Partial<{
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      enabled: boolean;
    }>,
  ) {
    return this.admin.updateEmailTemplate(key, body);
  }

  @Post('email-templates/:key/reset')
  resetEmailTemplate(@Param('key') key: EmailTemplateKey) {
    return this.admin.resetEmailTemplate(key);
  }

  @Post('telegram/test')
  sendTestTelegram(@Body() body: { phone?: string }) {
    return this.admin.sendTestTelegram(String(body.phone || ''));
  }

  @Post('email/test')
  sendTestEmail(@Body() body: { to?: string }) {
    return this.admin.sendTestEmail(String(body.to || ''));
  }
}
