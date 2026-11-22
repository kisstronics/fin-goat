import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuthModule } from './auth/auth.module';
import { CronJobsModule } from './cron/cron.module';
import { EmailModule } from './email/email.module';
import { MarketModule } from './market/market.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { RecurringModule } from './recurring/recurring.module';
import { ScreenersModule } from './screeners/screeners.module';
import { StoreModule } from './store/store.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ScheduleModule.forRoot(),
    StoreModule,
    AuthModule,
    UsersModule,
    PortfolioModule,
    RecurringModule,
    ScreenersModule,
    MarketModule,
    AnnouncementsModule,
    AdminModule,
    CronJobsModule,
    TelegramModule,
    EmailModule,
  ],
})
export class AppModule {}
