import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ScreenersController } from './screeners.controller';
import { ScreenersService } from './screeners.service';

@Module({
  imports: [TelegramModule],
  controllers: [ScreenersController],
  providers: [ScreenersService],
  exports: [ScreenersService],
})
export class ScreenersModule {}
