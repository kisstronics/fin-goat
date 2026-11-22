import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CronJobsModule } from '../cron/cron.module';
import { EmailModule } from '../email/email.module';
import { MarketModule } from '../market/market.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    AuthModule,
    MarketModule,
    TelegramModule,
    EmailModule,
    CronJobsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
