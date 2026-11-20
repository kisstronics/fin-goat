import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type { ScreenerKey, User } from '../store/types';
import { ScreenersService } from './screeners.service';

@Controller('api/screeners')
@UseGuards(JwtAuthGuard)
export class ScreenersController {
  constructor(private readonly screeners: ScreenersService) {}

  @Get()
  definitions() {
    return this.screeners.listDefinitions();
  }

  @Get('results')
  results(@Query('key') key?: ScreenerKey) {
    return this.screeners.getResults(key);
  }

  @Post('run')
  async run() {
    const results = await this.screeners.runAll('manual');
    await this.screeners.queueAlertsForResults(results);
    return {
      count: results.length,
      results: await this.screeners.getResults(),
    };
  }

  @Get('watchlist')
  watchlist(@Req() req: Request & { user: User }) {
    return this.screeners.listWatchlist(req.user.id);
  }

  @Post('watchlist')
  addWatch(
    @Req() req: Request & { user: User },
    @Body() body: { tickerId: string },
  ) {
    return this.screeners.addWatchlist(req.user.id, body.tickerId);
  }

  @Delete('watchlist/:id')
  removeWatch(@Req() req: Request & { user: User }, @Param('id') id: string) {
    return this.screeners.removeWatchlist(req.user.id, id);
  }
}
