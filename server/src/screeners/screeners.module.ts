import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ScreenersController } from './screeners.controller';
import { ScreenersService } from './screeners.service';

@Module({
  imports: [TelegramModule, EmailModule],
  controllers: [ScreenersController],
  providers: [ScreenersService],
  exports: [ScreenersService],
})
export class ScreenersModule {}
