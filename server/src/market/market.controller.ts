import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type { ChartRange } from '../store/types';
import { MarketService } from './market.service';

@Controller('api/market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('tickers')
  tickers() {
    return this.market.listActiveTickers();
  }

  @Get('history-coverage')
  historyCoverage() {
    return this.market.historyCoverage();
  }

  @Get('tickers/:symbol')
  stockDetail(@Param('symbol') symbol: string) {
    return this.market.getStockDetail(symbol);
  }

  @Get('tickers/:symbol/history')
  stockHistory(
    @Param('symbol') symbol: string,
    @Query('range') range?: string,
  ) {
    const allowed: ChartRange[] = [
      '1d',
      '1w',
      '1m',
      '3m',
      '6m',
      '1y',
      '3y',
      '5y',
      'max',
    ];
    const chartRange = allowed.includes(range as ChartRange)
      ? (range as ChartRange)
      : '1y';
    return this.market.getStockHistory(symbol, chartRange);
  }
}
