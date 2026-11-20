import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { ScreenersModule } from '../screeners/screeners.module';
import { CronJobsService } from './cron.service';

@Module({
  imports: [ScreenersModule, MarketModule],
  providers: [CronJobsService],
  exports: [CronJobsService],
})
export class CronJobsModule {}
