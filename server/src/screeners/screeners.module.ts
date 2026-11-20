import { Module } from '@nestjs/common';
import { ScreenersController } from './screeners.controller';
import { ScreenersService } from './screeners.service';

@Module({
  controllers: [ScreenersController],
  providers: [ScreenersService],
  exports: [ScreenersService],
})
export class ScreenersModule {}
