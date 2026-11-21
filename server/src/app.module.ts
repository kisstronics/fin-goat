import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CronJobsModule } from './cron/cron.module';
import { PortfolioModule } from './portfolio/portfolio.module';
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
    ScreenersModule,
    AdminModule,
    CronJobsModule,
    TelegramModule,
  ],
})
export class AppModule {}
