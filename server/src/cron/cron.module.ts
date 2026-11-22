import { Module } from '@nestjs/common';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { MarketModule } from '../market/market.module';
import { RecurringModule } from '../recurring/recurring.module';
import { ScreenersModule } from '../screeners/screeners.module';
import { CronJobsService } from './cron.service';

@Module({
  imports: [ScreenersModule, MarketModule, RecurringModule, AnnouncementsModule],
  providers: [CronJobsService],
  exports: [CronJobsService],
})
export class CronJobsModule {}
