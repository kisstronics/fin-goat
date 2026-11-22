import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type { AssetType, User } from '../store/types';
import { PortfolioService } from './portfolio.service';

@Controller('api/portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  list(@Req() req: Request & { user: User }) {
    return this.portfolio.list(req.user.id);
  }

  @Get('dashboard')
  dashboard(@Req() req: Request & { user: User }) {
    return this.portfolio.dashboard(req.user.id);
  }

  @Get('projection')
  projection(
    @Req() req: Request & { user: User },
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.portfolio.projectNetWorth(
      req.user.id,
      Number(month),
      Number(year),
    );
  }

  @Get('projection-series')
  projectionSeries(
    @Req() req: Request & { user: User },
    @Query('years') years?: string,
  ) {
    return this.portfolio.projectSeries(req.user.id, Number(years) || 10);
  }

  @Post()
  create(
    @Req() req: Request & { user: User },
    @Body()
    body: {
      assetType: AssetType;
      name: string;
      currentValue: number;
      investedValue: number;
      quantity?: number;
      avgCost?: number;
      tickerId?: string;
      notes?: string;
      meta?: Record<string, string | number | boolean>;
    },
  ) {
    return this.portfolio.create(req.user.id, body);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: User },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.portfolio.update(req.user.id, id, body as never);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: User }, @Param('id') id: string) {
    return this.portfolio.remove(req.user.id, id);
  }
}
