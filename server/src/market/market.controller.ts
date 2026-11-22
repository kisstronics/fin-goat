import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MarketService } from './market.service';

@Controller('api/market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('tickers')
  tickers() {
    return this.market.listActiveTickers();
  }
}
